#!/usr/bin/env python3
"""Convert a simplified RGBA illustration into a printable fuse-bead chart."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.cluster.vq import kmeans2


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    rgb = np.asarray(rgb, dtype=np.float64) / 255.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    xyz = linear @ np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    ).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    delta = 6.0 / 29.0
    f = np.where(xyz > delta**3, np.cbrt(xyz), xyz / (3.0 * delta**2) + 4.0 / 29.0)
    return np.stack(
        [116.0 * f[..., 1] - 16.0, 500.0 * (f[..., 0] - f[..., 1]), 200.0 * (f[..., 1] - f[..., 2])],
        axis=-1,
    )


def lab_to_srgb(lab: np.ndarray) -> np.ndarray:
    lab = np.asarray(lab, dtype=np.float64)
    fy = (lab[..., 0] + 16.0) / 116.0
    fx = fy + lab[..., 1] / 500.0
    fz = fy - lab[..., 2] / 200.0
    delta = 6.0 / 29.0
    f = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(f > delta, f**3, 3.0 * delta**2 * (f - 4.0 / 29.0))
    xyz *= np.array([0.95047, 1.0, 1.08883])
    linear = xyz @ np.array(
        [
            [3.2404542, -1.5371385, -0.4985314],
            [-0.9692660, 1.8760108, 0.0415560],
            [0.0556434, -0.2040259, 1.0572252],
        ]
    ).T
    srgb = np.where(
        linear <= 0.0031308,
        12.92 * linear,
        1.055 * np.maximum(linear, 0.0) ** (1.0 / 2.4) - 0.055,
    )
    return np.clip(np.rint(srgb * 255.0), 0, 255).astype(np.uint8)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def downsample_premultiplied(image: Image.Image, grid: int) -> tuple[np.ndarray, np.ndarray]:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0
    alpha = rgba[..., 3]
    premultiplied = rgba[..., :3] * alpha[..., None]
    resized_alpha = np.asarray(
        Image.fromarray(alpha, mode="F").resize((grid, grid), Image.Resampling.BOX),
        dtype=np.float32,
    )
    channels = []
    for channel in range(3):
        channels.append(
            np.asarray(
                Image.fromarray(premultiplied[..., channel], mode="F").resize(
                    (grid, grid), Image.Resampling.BOX
                ),
                dtype=np.float32,
            )
        )
    resized_premultiplied = np.stack(channels, axis=-1)
    rgb = resized_premultiplied / np.maximum(resized_alpha[..., None], 1e-6)
    return np.clip(rgb * 255.0, 0, 255).astype(np.uint8), resized_alpha


def remove_tiny_mask_components(mask: np.ndarray, minimum_size: int = 2) -> np.ndarray:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    cleaned = mask.copy()
    for row in range(height):
        for col in range(width):
            if not mask[row, col] or seen[row, col]:
                continue
            stack = [(row, col)]
            seen[row, col] = True
            component: list[tuple[int, int]] = []
            while stack:
                current_row, current_col = stack.pop()
                component.append((current_row, current_col))
                for delta_row, delta_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    next_row = current_row + delta_row
                    next_col = current_col + delta_col
                    if (
                        0 <= next_row < height
                        and 0 <= next_col < width
                        and mask[next_row, next_col]
                        and not seen[next_row, next_col]
                    ):
                        seen[next_row, next_col] = True
                        stack.append((next_row, next_col))
            if len(component) < minimum_size:
                for current_row, current_col in component:
                    cleaned[current_row, current_col] = False
    return cleaned


def quantize_cells(
    rgb: np.ndarray,
    mask: np.ndarray,
    color_count: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    colors_lab = srgb_to_lab(rgb[mask])
    if colors_lab.shape[0] < color_count:
        raise ValueError("The requested palette is larger than the number of occupied cells.")
    rng = np.random.default_rng(seed)
    centroids, labels = kmeans2(colors_lab, color_count, iter=80, minit="++", seed=rng)
    distances = np.sum((colors_lab[:, None, :] - centroids[None, :, :]) ** 2, axis=2)
    labels = np.argmin(distances, axis=1)

    label_grid = np.full(mask.shape, -1, dtype=np.int16)
    label_grid[mask] = labels
    label_grid = clean_isolated_colors(label_grid, centroids, passes=2)

    # Recompute centroids after cleanup and sort them from dark to light.
    occupied_lab = srgb_to_lab(rgb[mask])
    occupied_labels = label_grid[mask]
    for index in range(color_count):
        members = occupied_lab[occupied_labels == index]
        if members.size:
            centroids[index] = members.mean(axis=0)
    order = np.lexsort((centroids[:, 2], centroids[:, 1], centroids[:, 0]))
    inverse = np.empty_like(order)
    inverse[order] = np.arange(color_count)
    label_grid[mask] = inverse[label_grid[mask]]
    palette_rgb = lab_to_srgb(centroids[order])
    return label_grid, palette_rgb


def load_reference_palette(path: Path) -> tuple[str, list[str], np.ndarray]:
    """Load a fixed brand palette from a JSON file."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("colors"), list):
        raise ValueError("Reference palette JSON must contain a colors list.")
    name = str(data.get("name", path.stem))
    codes: list[str] = []
    colors: list[tuple[int, int, int]] = []
    for item in data["colors"]:
        if not isinstance(item, dict) or "code" not in item or "hex" not in item:
            raise ValueError("Each reference palette entry needs code and hex fields.")
        hex_value = str(item["hex"]).lstrip("#")
        if len(hex_value) != 6:
            raise ValueError(f"Invalid palette color: {item['hex']}")
        codes.append(str(item["code"]))
        colors.append(tuple(int(hex_value[offset : offset + 2], 16) for offset in (0, 2, 4)))
    if len(codes) != len(set(codes)):
        raise ValueError("Reference palette color codes must be unique.")
    return name, codes, np.asarray(colors, dtype=np.uint8)


def quantize_to_reference_palette(
    rgb: np.ndarray,
    mask: np.ndarray,
    reference_rgb: np.ndarray,
    reference_codes: list[str],
    color_count: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Choose a compact subset of a fixed palette and quantize cells to it."""
    occupied_lab = srgb_to_lab(rgb[mask])
    if occupied_lab.shape[0] < color_count:
        raise ValueError("The requested palette is larger than the number of occupied cells.")
    if len(reference_rgb) < color_count:
        raise ValueError("The reference palette has fewer colors than requested.")

    rng = np.random.default_rng(seed)
    centroids, initial_labels = kmeans2(
        occupied_lab,
        color_count,
        iter=80,
        minit="++",
        seed=rng,
    )
    weights = np.bincount(initial_labels, minlength=color_count)
    reference_lab = srgb_to_lab(reference_rgb)
    distances = np.sum(
        (centroids[:, None, :] - reference_lab[None, :, :]) ** 2,
        axis=2,
    )

    # Assign the most frequently used clusters first, reserving a unique real
    # bead color for each cluster. The final order follows the source palette.
    chosen: list[int] = []
    used: set[int] = set()
    for cluster in np.argsort(weights)[::-1]:
        for reference_index in np.argsort(distances[cluster]):
            candidate = int(reference_index)
            if candidate not in used:
                used.add(candidate)
                chosen.append(candidate)
                break
    selected_indices = sorted(chosen)
    selected_rgb = reference_rgb[selected_indices]
    selected_codes = [reference_codes[index] for index in selected_indices]
    selected_lab = srgb_to_lab(selected_rgb)
    labels = np.argmin(
        np.sum((occupied_lab[:, None, :] - selected_lab[None, :, :]) ** 2, axis=2),
        axis=1,
    )
    label_grid = np.full(mask.shape, -1, dtype=np.int16)
    label_grid[mask] = labels
    label_grid = clean_isolated_colors(label_grid, selected_lab, passes=2)
    return label_grid, selected_rgb, selected_codes


def prune_unused_palette(
    label_grid: np.ndarray,
    palette: np.ndarray,
    palette_codes: list[str],
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Remove zero-count colors and compact the cell labels."""
    used = sorted(int(label) for label in np.unique(label_grid[label_grid >= 0]))
    if len(used) == len(palette):
        return label_grid, palette, palette_codes
    remap = np.full(len(palette), -1, dtype=np.int16)
    remap[used] = np.arange(len(used), dtype=np.int16)
    occupied = label_grid >= 0
    compacted = label_grid.copy()
    compacted[occupied] = remap[label_grid[occupied]]
    return compacted, palette[used], [palette_codes[index] for index in used]


def clean_isolated_colors(label_grid: np.ndarray, centroids: np.ndarray, passes: int) -> np.ndarray:
    cleaned = label_grid.copy()
    height, width = cleaned.shape
    for _ in range(passes):
        updated = cleaned.copy()
        for row in range(height):
            for col in range(width):
                current = cleaned[row, col]
                if current < 0:
                    continue
                neighbors = []
                for delta_row in (-1, 0, 1):
                    for delta_col in (-1, 0, 1):
                        if delta_row == 0 and delta_col == 0:
                            continue
                        next_row = row + delta_row
                        next_col = col + delta_col
                        if 0 <= next_row < height and 0 <= next_col < width:
                            neighbor = cleaned[next_row, next_col]
                            if neighbor >= 0:
                                neighbors.append(int(neighbor))
                if not neighbors:
                    continue
                counts = Counter(neighbors)
                candidate, candidate_count = counts.most_common(1)[0]
                current_count = counts.get(int(current), 0)
                delta_e = float(np.linalg.norm(centroids[current] - centroids[candidate]))
                if current_count <= 1 and candidate_count >= 5 and delta_e < 24.0:
                    updated[row, col] = candidate
        cleaned = updated
    return cleaned


def text_color(rgb: np.ndarray) -> tuple[int, int, int]:
    red, green, blue = [int(value) for value in rgb]
    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    return (20, 20, 20) if luminance > 150 else (255, 255, 255)


def code(index: int, palette_codes: list[str] | None = None) -> str:
    if palette_codes is not None:
        return palette_codes[index]
    return f"P{index + 1:02d}"


def nearest_palette_label(palette: np.ndarray, target_rgb: tuple[int, int, int]) -> int:
    palette_lab = srgb_to_lab(palette)
    target_lab = srgb_to_lab(np.array(target_rgb, dtype=np.uint8))
    return int(np.argmin(np.sum((palette_lab - target_lab) ** 2, axis=1)))


def redraw_vertical_sword(label_grid: np.ndarray, palette: np.ndarray) -> dict[str, object]:
    """Replace the forked upper-left weapon with a strict grid-aligned sword."""
    if label_grid.shape != (87, 87):
        raise ValueError("The deterministic sword redraw is defined for the 87 x 87 layout.")

    # Clear the original blade and forked guard above the hand.
    label_grid[0:43, 12:25] = -1

    outline = nearest_palette_label(palette, (48, 51, 53))
    mid_metal = nearest_palette_label(palette, (142, 145, 148))
    light_metal = nearest_palette_label(palette, (210, 213, 216))
    handle = nearest_palette_label(palette, (80, 55, 40))

    # Long six-cell-wide blade centered on global column 18, the center of the
    # gripping hand. The pointed tip reaches the first row.
    label_grid[0, 16:18] = [outline, outline]
    label_grid[1, 15:19] = [outline, mid_metal, light_metal, outline]
    for row in range(2, 40):
        label_grid[row, 14:20] = [outline, mid_metal, light_metal, light_metal, mid_metal, outline]

    # Broad but simple guard immediately above the fist.
    label_grid[40, 10:25] = outline
    label_grid[41, 9:26] = mid_metal
    label_grid[41, 9] = outline
    label_grid[41, 25] = outline
    label_grid[42, 11:24] = outline

    # The handle stays on the same centerline and visibly passes into the hand.
    for row in range(43, 54):
        label_grid[row, 16:19] = [outline, handle, outline]

    return {
        "cleared_region_one_based": {"rows": [1, 43], "columns": [13, 25]},
        "blade_columns_one_based": [15, 20],
        "center_column_one_based": 18,
        "tip_row_one_based": 1,
        "guard_rows_one_based": [41, 43],
        "handle_rows_one_based": [44, 54],
    }


def apply_crisp_inner_outline(
    label_grid: np.ndarray,
    palette: np.ndarray,
    palette_codes: list[str] | None = None,
    connectivity: int = 4,
    use_black: bool = False,
) -> dict[str, object]:
    """Set every silhouette boundary cell to a uniform dark outline."""
    occupied = label_grid >= 0
    padded = np.pad(occupied, 1, constant_values=False)
    neighbors = [
        padded[0:-2, 1:-1],
        padded[2:, 1:-1],
        padded[1:-1, 0:-2],
        padded[1:-1, 2:],
    ]
    if connectivity == 8:
        neighbors.extend(
            [
                padded[0:-2, 0:-2],
                padded[0:-2, 2:],
                padded[2:, 0:-2],
                padded[2:, 2:],
            ]
        )
    elif connectivity != 4:
        raise ValueError("Outline connectivity must be 4 or 8.")
    interior = np.logical_and.reduce(neighbors)
    boundary = occupied & ~interior
    if use_black:
        outline = int(np.argmin(srgb_to_lab(palette)[:, 0]))
    else:
        outline = nearest_palette_label(palette, (48, 51, 53))
    label_grid[boundary] = outline
    return {
        "connectivity": connectivity,
        "color_mode": "darkest palette color" if use_black else "dark charcoal",
        "outline_code": code(outline, palette_codes),
        "outlined_cells": int(np.sum(boundary)),
    }


def remove_component_at(label_grid: np.ndarray, seed: tuple[int, int]) -> dict[str, object]:
    """Remove the eight-connected occupied component containing ``seed``."""
    height, width = label_grid.shape
    seed_row, seed_col = seed
    if not (0 <= seed_row < height and 0 <= seed_col < width):
        raise ValueError("Component-removal seed is outside the pattern grid.")
    if label_grid[seed_row, seed_col] < 0:
        raise ValueError("Component-removal seed is not an occupied cell.")

    stack = [seed]
    seen = {seed}
    component: list[tuple[int, int]] = []
    while stack:
        row, col = stack.pop()
        component.append((row, col))
        for delta_row in (-1, 0, 1):
            for delta_col in (-1, 0, 1):
                if delta_row == 0 and delta_col == 0:
                    continue
                next_row = row + delta_row
                next_col = col + delta_col
                candidate = (next_row, next_col)
                if (
                    0 <= next_row < height
                    and 0 <= next_col < width
                    and label_grid[next_row, next_col] >= 0
                    and candidate not in seen
                ):
                    seen.add(candidate)
                    stack.append(candidate)

    for row, col in component:
        label_grid[row, col] = -1
    rows = [row for row, _ in component]
    cols = [col for _, col in component]
    return {
        "seed_one_based": [seed_row + 1, seed_col + 1],
        "removed_cells": len(component),
        "bounding_box_one_based": {
            "rows": [min(rows) + 1, max(rows) + 1],
            "columns": [min(cols) + 1, max(cols) + 1],
        },
    }


def trim_left_blade_protrusion(label_grid: np.ndarray) -> dict[str, object]:
    """Remove the one-cell left flare produced by V5 grid quantization."""
    if label_grid.shape != (87, 87):
        raise ValueError("The blade-flare trim is defined for the 87 x 87 layout.")
    target = label_grid[14:35, 15]
    removed = int(np.sum(target >= 0))
    label_grid[14:35, 15] = -1
    return {
        "removed_cells": removed,
        "rows_one_based": [15, 35],
        "column_one_based": 16,
        "resulting_blade_columns_one_based": [17, 21],
    }


def render_preview(label_grid: np.ndarray, palette: np.ndarray, path: Path, scale: int = 12) -> None:
    height, width = label_grid.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    occupied = label_grid >= 0
    rgba[occupied, :3] = palette[label_grid[occupied]]
    rgba[occupied, 3] = 255
    Image.fromarray(rgba, mode="RGBA").resize(
        (width * scale, height * scale), Image.Resampling.NEAREST
    ).save(path)


def draw_cell(
    draw: ImageDraw.ImageDraw,
    left: int,
    top: int,
    size: int,
    label: int,
    palette: np.ndarray,
    palette_codes: list[str],
    font: ImageFont.ImageFont,
) -> None:
    draw.rectangle((left, top, left + size, top + size), fill=(255, 255, 255), outline=(215, 218, 224), width=1)
    if label < 0:
        return
    rgb = tuple(int(value) for value in palette[label])
    inset = max(2, size // 12)
    draw.ellipse((left + inset, top + inset, left + size - inset, top + size - inset), fill=rgb, outline=(60, 60, 60), width=1)
    label_text = code(label, palette_codes)
    box = draw.textbbox((0, 0), label_text, font=font)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    draw.text(
        (left + (size - text_width) / 2, top + (size - text_height) / 2 - box[1]),
        label_text,
        fill=text_color(palette[label]),
        font=font,
    )


def render_full_chart(
    label_grid: np.ndarray,
    palette: np.ndarray,
    inventory: Counter[int],
    palette_codes: list[str],
    palette_type: str,
    board_size: int,
    title: str,
    path: Path,
) -> None:
    height, width = label_grid.shape
    cell = 32
    left_margin = 90
    top_margin = 150
    legend_height = 560
    canvas = Image.new("RGB", (left_margin + width * cell + 70, top_margin + height * cell + legend_height), "white")
    draw = ImageDraw.Draw(canvas)
    title_font = load_font(34, bold=True)
    subtitle_font = load_font(20)
    code_font = load_font(12, bold=True)
    axis_font = load_font(14)
    legend_font = load_font(18)
    legend_bold = load_font(18, bold=True)

    draw.text((left_margin, 35), f"{title} fuse-bead pattern - {width} x {height}", fill=(25, 29, 38), font=title_font)
    total = sum(inventory.values())
    draw.text(
        (left_margin, 85),
        f"{len(palette)} colors | {total} beads | thick lines mark {board_size} x {board_size} boards",
        fill=(70, 75, 86),
        font=subtitle_font,
    )

    for row in range(height):
        for col in range(width):
            draw_cell(
                draw,
                left_margin + col * cell,
                top_margin + row * cell,
                cell,
                int(label_grid[row, col]),
                palette,
                palette_codes,
                code_font,
            )

    grid_right = left_margin + width * cell
    grid_bottom = top_margin + height * cell
    for index in range(0, width + 1, board_size):
        x = left_margin + index * cell
        draw.line((x, top_margin, x, grid_bottom), fill=(20, 95, 170), width=4)
    for index in range(0, height + 1, board_size):
        y = top_margin + index * cell
        draw.line((left_margin, y, grid_right, y), fill=(20, 95, 170), width=4)
    for col in range(width):
        if col == 0 or (col + 1) % 5 == 0 or (col + 1) % board_size == 0:
            label = str(col + 1)
            box = draw.textbbox((0, 0), label, font=axis_font)
            x = left_margin + col * cell + (cell - (box[2] - box[0])) / 2
            draw.text((x, top_margin - 24), label, fill=(50, 55, 65), font=axis_font)
    for row in range(height):
        if row == 0 or (row + 1) % 5 == 0 or (row + 1) % board_size == 0:
            label = str(row + 1)
            box = draw.textbbox((0, 0), label, font=axis_font)
            y = top_margin + row * cell + (cell - (box[3] - box[1])) / 2 - box[1]
            draw.text((left_margin - 12 - (box[2] - box[0]), y), label, fill=(50, 55, 65), font=axis_font)

    legend_top = grid_bottom + 70
    draw.text((left_margin, legend_top), f"Color legend ({palette_type})", fill=(25, 29, 38), font=title_font)
    legend_top += 60
    columns = 4
    column_width = (width * cell) // columns
    rows = (len(palette) + columns - 1) // columns
    for index, rgb_array in enumerate(palette):
        column = index // rows
        row = index % rows
        x = left_margin + column * column_width
        y = legend_top + row * 62
        rgb = tuple(int(value) for value in rgb_array)
        hex_value = "#" + "".join(f"{value:02X}" for value in rgb)
        draw.ellipse((x, y, x + 42, y + 42), fill=rgb, outline=(50, 50, 50), width=2)
        draw.text((x + 56, y - 1), code(index, palette_codes), fill=(25, 29, 38), font=legend_bold)
        draw.text((x + 112, y - 1), hex_value, fill=(55, 60, 70), font=legend_font)
        draw.text((x + 56, y + 23), f"{inventory[index]} beads", fill=(80, 85, 95), font=legend_font)
    canvas.save(path, optimize=True)


def render_board_tiles(
    label_grid: np.ndarray,
    palette: np.ndarray,
    palette_codes: list[str],
    board_size: int,
    pattern_tag: str,
    output_dir: Path,
) -> None:
    height, width = label_grid.shape
    if height % board_size or width % board_size:
        raise ValueError("Grid dimensions must be divisible by board size for tiled output.")
    output_dir.mkdir(parents=True, exist_ok=True)
    cell = 42
    margin = 105
    title_height = 105
    code_font = load_font(15, bold=True)
    axis_font = load_font(18)
    title_font = load_font(28, bold=True)
    board_rows = height // board_size
    board_cols = width // board_size
    for board_row in range(board_rows):
        for board_col in range(board_cols):
            canvas = Image.new(
                "RGB",
                (2 * margin + board_size * cell, title_height + margin + board_size * cell),
                "white",
            )
            draw = ImageDraw.Draw(canvas)
            draw.text(
                (margin, 28),
                f"Board row {board_row + 1}, column {board_col + 1}",
                fill=(25, 29, 38),
                font=title_font,
            )
            grid_top = title_height
            for local_row in range(board_size):
                global_row = board_row * board_size + local_row
                for local_col in range(board_size):
                    global_col = board_col * board_size + local_col
                    draw_cell(
                        draw,
                        margin + local_col * cell,
                        grid_top + local_row * cell,
                        cell,
                        int(label_grid[global_row, global_col]),
                        palette,
                        palette_codes,
                        code_font,
                    )
            grid_right = margin + board_size * cell
            grid_bottom = grid_top + board_size * cell
            draw.rectangle((margin, grid_top, grid_right, grid_bottom), outline=(20, 95, 170), width=4)
            for local_col in range(board_size):
                label = str(board_col * board_size + local_col + 1)
                box = draw.textbbox((0, 0), label, font=axis_font)
                x = margin + local_col * cell + (cell - (box[2] - box[0])) / 2
                draw.text((x, grid_top - 28), label, fill=(50, 55, 65), font=axis_font)
            for local_row in range(board_size):
                label = str(board_row * board_size + local_row + 1)
                box = draw.textbbox((0, 0), label, font=axis_font)
                y = grid_top + local_row * cell + (cell - (box[3] - box[1])) / 2 - box[1]
                draw.text((margin - 12 - (box[2] - box[0]), y), label, fill=(50, 55, 65), font=axis_font)
            canvas.save(
                output_dir
                / f"{pattern_tag}_board_r{board_row + 1}_c{board_col + 1}.png",
                optimize=True,
            )


def write_csv_files(
    label_grid: np.ndarray,
    palette: np.ndarray,
    palette_codes: list[str],
    inventory: Counter[int],
    output_dir: Path,
    pattern_tag: str,
) -> None:
    with (output_dir / f"{pattern_tag}.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["row/col"] + list(range(1, label_grid.shape[1] + 1)))
        for row_index, row in enumerate(label_grid, start=1):
            writer.writerow(
                [row_index]
                + ["" if label < 0 else code(int(label), palette_codes) for label in row]
            )
    with (output_dir / f"{pattern_tag}_inventory.csv").open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.writer(file)
        writer.writerow(["code", "hex", "red", "green", "blue", "bead_count"])
        for index, rgb_array in enumerate(palette):
            rgb = tuple(int(value) for value in rgb_array)
            writer.writerow(
                [
                    code(index, palette_codes),
                    "#" + "".join(f"{value:02X}" for value in rgb),
                    *rgb,
                    inventory[index],
                ]
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument(
        "--output-root",
        type=Path,
        required=True,
        help="Parent patterns directory. The canonical artifact directory is created inside it.",
    )
    parser.add_argument(
        "--name",
        required=True,
        help="Lowercase snake_case name of the represented subject.",
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Chronological version in vN form, for example v1.",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Human-readable chart title. Defaults to the subject name.",
    )
    parser.add_argument("--grid", type=int, default=87)
    parser.add_argument("--colors", type=int, default=24)
    parser.add_argument(
        "--palette-json",
        type=Path,
        default=None,
        help="Use exact brand colors from a JSON palette instead of adaptive RGB colors.",
    )
    parser.add_argument("--board-size", type=int, default=29)
    parser.add_argument("--alpha-threshold", type=float, default=0.28)
    parser.add_argument("--seed", type=int, default=20260822)
    parser.add_argument(
        "--preserve-green-eyes",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Reserve one olive-green bead for each iris in the 87 x 87 Ciri layout.",
    )
    parser.add_argument(
        "--straighten-sword",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Replace the forked upper-left weapon with a strict vertical sword in the 87 x 87 layout.",
    )
    parser.add_argument(
        "--crisp-outline",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Convert all four-connected outer boundary cells to a dark charcoal inner outline.",
    )
    parser.add_argument(
        "--outline-connectivity",
        type=int,
        choices=(4, 8),
        default=4,
        help="Neighborhood used to identify silhouette boundary cells.",
    )
    parser.add_argument(
        "--outline-black",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Use the darkest adaptive palette color instead of dark charcoal for the outline.",
    )
    parser.add_argument(
        "--remove-detached-lower-left-hilt",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Remove the isolated 33-cell hilt component in the 87 x 87 Ciri layout.",
    )
    parser.add_argument(
        "--trim-left-blade-protrusion",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Remove the 21-cell left blade flare in rows 15-35 of the 87 x 87 layout.",
    )
    args = parser.parse_args()

    if args.grid % args.board_size:
        raise ValueError("Grid size must be divisible by board size.")
    if re.fullmatch(r"[a-z0-9]+(?:_[a-z0-9]+)*", args.name) is None:
        raise ValueError("Name must use lowercase snake_case ASCII characters.")
    if re.fullmatch(r"v[1-9][0-9]*", args.version) is None:
        raise ValueError("Version must use vN form with N >= 1.")
    title = args.title or args.name.replace("_", " ").title()
    image = Image.open(args.input)
    rgb, alpha = downsample_premultiplied(image, args.grid)
    mask = remove_tiny_mask_components(alpha >= args.alpha_threshold, minimum_size=2)
    palette_source: str | None = None
    if args.palette_json is not None:
        palette_name, reference_codes, reference_rgb = load_reference_palette(args.palette_json)
        label_grid, palette, palette_codes = quantize_to_reference_palette(
            rgb,
            mask,
            reference_rgb,
            reference_codes,
            args.colors,
            args.seed,
        )
        palette_type = f"{palette_name} fixed reference colors"
        palette_source = str(args.palette_json)
    else:
        label_grid, palette = quantize_cells(rgb, mask, args.colors, args.seed)
        palette_codes = [code(index) for index in range(len(palette))]
        palette_type = "adaptive RGB reference colors; not brand-specific"
    semantic_accents: dict[str, object] = {}
    structural_edits: dict[str, object] = {}
    if args.straighten_sword:
        structural_edits["vertical_sword"] = redraw_vertical_sword(label_grid, palette)
    if args.remove_detached_lower_left_hilt:
        if args.grid != 87:
            raise ValueError("The detached-hilt removal is defined for the 87 x 87 layout.")
        structural_edits["removed_detached_lower_left_hilt"] = remove_component_at(
            label_grid,
            seed=(81, 26),
        )
    if args.trim_left_blade_protrusion:
        structural_edits["trimmed_left_blade_protrusion"] = trim_left_blade_protrusion(
            label_grid
        )
    if args.crisp_outline:
        structural_edits["crisp_inner_outline"] = apply_crisp_inner_outline(
            label_grid,
            palette,
            palette_codes=palette_codes,
            connectivity=args.outline_connectivity,
            use_black=args.outline_black,
        )
    if args.preserve_green_eyes and args.grid == 87:
        if args.palette_json is not None:
            raise ValueError("Semantic green eyes are incompatible with a fixed brand palette.")
        eye_cells = [(26, 44), (26, 54)]  # Zero-based (row, column), selected from the master image.
        eye_label = len(palette)
        palette = np.vstack([palette, np.array([[126, 145, 92]], dtype=np.uint8)])
        palette_codes.append(code(eye_label))
        for row, col in eye_cells:
            if mask[row, col]:
                label_grid[row, col] = eye_label
        semantic_accents["green_irises"] = {
            "cells_one_based": [[row + 1, col + 1] for row, col in eye_cells],
            "rgb": [126, 145, 92],
        }
    label_grid, palette, palette_codes = prune_unused_palette(
        label_grid,
        palette,
        palette_codes,
    )
    inventory = Counter(int(label) for label in label_grid[label_grid >= 0])
    occupied = np.argwhere(label_grid >= 0)
    if occupied.size == 0:
        raise ValueError("The generated pattern contains no occupied cells.")
    row_min = int(occupied[:, 0].min())
    row_max = int(occupied[:, 0].max())
    column_min = int(occupied[:, 1].min())
    column_max = int(occupied[:, 1].max())
    footprint_width = column_max - column_min + 1
    footprint_height = row_max - row_min + 1
    pattern_tag = (
        f"{args.name}_{footprint_width}x{footprint_height}_{args.version}"
    )
    output_dir = args.output_root / pattern_tag
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Refusing to overwrite non-empty output: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    render_preview(label_grid, palette, output_dir / f"{pattern_tag}_preview.png")
    render_full_chart(
        label_grid,
        palette,
        inventory,
        palette_codes,
        palette_type,
        args.board_size,
        title,
        output_dir / f"{pattern_tag}_chart.png",
    )
    render_board_tiles(
        label_grid,
        palette,
        palette_codes,
        args.board_size,
        pattern_tag,
        output_dir / "tiles",
    )
    write_csv_files(
        label_grid,
        palette,
        palette_codes,
        inventory,
        output_dir,
        pattern_tag,
    )

    metadata = {
        "input": str(args.input),
        "artifact_id": pattern_tag,
        "name": args.name,
        "version": args.version,
        "title": title,
        "grid": [args.grid, args.grid],
        "footprint": [footprint_width, footprint_height],
        "occupied_rows_one_based": [row_min + 1, row_max + 1],
        "occupied_columns_one_based": [column_min + 1, column_max + 1],
        "board_size": [args.board_size, args.board_size],
        "boards": [args.grid // args.board_size, args.grid // args.board_size],
        "palette_type": palette_type,
        "palette_source": palette_source,
        "palette_codes": palette_codes,
        "color_count": len(palette),
        "bead_count": sum(inventory.values()),
        "empty_cells": int(np.sum(label_grid < 0)),
        "alpha_threshold": args.alpha_threshold,
        "seed": args.seed,
        "semantic_accents": semantic_accents,
        "structural_edits": structural_edits,
    }
    (output_dir / f"{pattern_tag}_metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
