"""Structure-preserving image-to-pattern conversion pipeline."""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageCms, ImageFilter, ImageOps

from .color import compact_palette_subset, deterministic_kmeans, lab_to_srgb, srgb_to_lab

MAX_IMAGE_PIXELS = 32_000_000
MAX_GRID_DIMENSION = 500
MAX_CLUSTER_SAMPLE = 60_000

ProgressCallback = Callable[[str, float, str], None]


@dataclass(frozen=True)
class ConversionSettings:
    columns: int
    rows: int
    color_count: int = 24
    alpha_threshold: float = 0.28
    background_mode: str = "auto"
    background_tolerance: float = 18.0
    wavelet_strength: float = 0.55
    seed: int = 20260824
    remove_tiny_components: bool = True
    symmetry: str = "none"


def _check_settings(settings: ConversionSettings, palette_size: int) -> None:
    if not 1 <= settings.columns <= MAX_GRID_DIMENSION or not 1 <= settings.rows <= MAX_GRID_DIMENSION:
        raise ValueError("Target dimensions must be between 1 and 500.")
    if not 1 <= settings.color_count <= min(64, palette_size):
        raise ValueError("Color count must be between 1 and the palette limit.")
    if not 0.01 <= settings.alpha_threshold <= 0.99:
        raise ValueError("Alpha threshold must be between 0.01 and 0.99.")
    if settings.background_mode not in {"auto", "preserve", "none"}:
        raise ValueError("Unsupported background mode.")
    if not 4.0 <= settings.background_tolerance <= 60.0:
        raise ValueError("Background tolerance must be between 4 and 60 Delta E.")
    if not 0.0 <= settings.wavelet_strength <= 1.0:
        raise ValueError("Wavelet strength must be between 0 and 1.")
    if settings.symmetry not in {"none", "vertical", "horizontal", "central"}:
        raise ValueError("Unsupported symmetry mode.")


def _load_oriented_srgb(path: Path) -> tuple[Image.Image, dict[str, object]]:
    with Image.open(path) as opened:
        if opened.width * opened.height > MAX_IMAGE_PIXELS:
            raise ValueError("Image exceeds the 32 megapixel safety limit.")
        oriented = ImageOps.exif_transpose(opened)
        color_profile = "assumed_srgb"
        icc_profile = oriented.info.get("icc_profile")
        if icc_profile:
            try:
                source = ImageCms.ImageCmsProfile(BytesIO(bytes(icc_profile)))
                target = ImageCms.createProfile("sRGB")
                rgb = ImageCms.profileToProfile(oriented.convert("RGB"), source, target)
                alpha = oriented.getchannel("A") if "A" in oriented.getbands() else None
                oriented = rgb
                if alpha is not None:
                    oriented.putalpha(alpha)
                color_profile = "converted_to_srgb"
            except (ImageCms.PyCMSError, OSError, TypeError, ValueError):
                color_profile = "embedded_profile_unreadable_assumed_srgb"
        rgba = oriented.convert("RGBA")
        return rgba.copy(), {
            "source_width": opened.width,
            "source_height": opened.height,
            "oriented_width": rgba.width,
            "oriented_height": rgba.height,
            "source_mode": opened.mode,
            "source_had_alpha": "A" in opened.getbands(),
            "color_profile": color_profile,
        }


def _border_pixels(values: np.ndarray) -> np.ndarray:
    top = values[0, :, :]
    bottom = values[-1, :, :]
    left = values[1:-1, 0, :]
    right = values[1:-1, -1, :]
    return np.concatenate([top, bottom, left, right], axis=0)


def _connected_background(candidate: np.ndarray) -> np.ndarray:
    """Keep only candidate background reachable from an image edge."""
    height, width = candidate.shape
    reached = np.zeros_like(candidate, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for col in range(width):
        if candidate[0, col]:
            reached[0, col] = True
            queue.append((0, col))
        if candidate[height - 1, col] and not reached[height - 1, col]:
            reached[height - 1, col] = True
            queue.append((height - 1, col))
    for row in range(1, height - 1):
        if candidate[row, 0]:
            reached[row, 0] = True
            queue.append((row, 0))
        if candidate[row, width - 1] and not reached[row, width - 1]:
            reached[row, width - 1] = True
            queue.append((row, width - 1))
    while queue:
        row, col = queue.popleft()
        for next_row, next_col in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
            if (
                0 <= next_row < height
                and 0 <= next_col < width
                and candidate[next_row, next_col]
                and not reached[next_row, next_col]
            ):
                reached[next_row, next_col] = True
                queue.append((next_row, next_col))
    return reached


def remove_background(
    rgba: np.ndarray,
    *,
    tolerance: float,
    seed: int,
) -> tuple[np.ndarray, dict[str, object]]:
    """Estimate an alpha matte from border colors and edge-connected flood fill.

    The algorithm models up to three common CIE Lab colors on the image border,
    then removes only sufficiently similar pixels connected to that border. This
    prevents an isolated interior region with a background-like color from being
    removed merely because its color is similar.
    """
    rgb = rgba[..., :3]
    source_alpha = rgba[..., 3].astype(np.float32) / 255.0
    if float(np.percentile(source_alpha, 5)) < 0.98:
        return source_alpha, {
            "method": "preserved_source_alpha",
            "background_clusters": 0,
            "tolerance_delta_e": tolerance,
        }

    lab = srgb_to_lab(rgb)
    border = _border_pixels(lab)
    if len(border) > 12_000:
        rng = np.random.default_rng(seed)
        border = border[rng.choice(len(border), size=12_000, replace=False)]
    cluster_count = min(3, len(np.unique(np.round(border, 1), axis=0)))
    centers, labels = deterministic_kmeans(border, max(1, cluster_count), seed)
    counts = np.bincount(labels, minlength=len(centers))
    corner_lab = np.stack([lab[0, 0], lab[0, -1], lab[-1, 0], lab[-1, -1]])
    corner_distances = np.sqrt(
        np.min(
            np.sum((centers[:, None, :] - corner_lab[None, :, :]) ** 2, axis=2),
            axis=1,
        )
    )
    # A subject touching an edge can enter the border sample. Requiring a
    # cluster to explain a corner or a dominant share of the full border keeps
    # such a foreground color from being treated as background by default.
    accepted = (corner_distances <= max(10.0, tolerance * 0.65)) | (
        counts >= int(0.34 * len(border))
    )
    centers = centers[accepted]
    if len(centers) == 0:
        centers = np.mean(border, axis=0, keepdims=True)

    distances = np.sqrt(np.min(np.sum((lab[..., None, :] - centers[None, None, :, :]) ** 2, axis=3), axis=2))
    red_green = np.max(np.abs(np.diff(rgb.astype(np.float32), axis=0)), axis=2, initial=0)
    left_right = np.max(np.abs(np.diff(rgb.astype(np.float32), axis=1)), axis=2, initial=0)
    edge = np.zeros(distances.shape, dtype=np.float32)
    edge[:-1, :] = np.maximum(edge[:-1, :], red_green)
    edge[:, :-1] = np.maximum(edge[:, :-1], left_right)
    candidate = (distances <= tolerance * 1.35) & (edge <= 92.0)
    connected = _connected_background(candidate)

    confidence = np.clip((tolerance * 1.35 - distances) / max(tolerance * 0.7, 1e-6), 0.0, 1.0)
    raw_alpha = np.where(connected, 1.0 - confidence, 1.0).astype(np.float32)
    matte_image = Image.fromarray(np.clip(np.rint(raw_alpha * 255), 0, 255).astype(np.uint8), mode="L")
    feather_radius = max(0.6, min(rgba.shape[0], rgba.shape[1]) / 700.0)
    feathered = np.asarray(matte_image.filter(ImageFilter.GaussianBlur(feather_radius)), dtype=np.float32) / 255.0
    alpha = np.where(raw_alpha <= 0.02, feathered, np.maximum(raw_alpha, feathered * 0.9))
    alpha[connected & (distances <= tolerance * 0.48)] = 0.0
    return np.clip(alpha, 0.0, 1.0), {
        "method": "border_lab_connected_matte",
        "background_clusters": int(len(centers)),
        "tolerance_delta_e": tolerance,
        "removed_fraction": float(np.mean(alpha < 0.05)),
        "feather_radius": feather_radius,
    }


def _haar_denoise_channel(channel: np.ndarray, strength: float, levels: int = 2) -> np.ndarray:
    working = np.asarray(channel, dtype=np.float32)
    original_shape = working.shape
    multiple = 2**levels
    pad_rows = (-working.shape[0]) % multiple
    pad_cols = (-working.shape[1]) % multiple
    if pad_rows or pad_cols:
        working = np.pad(working, ((0, pad_rows), (0, pad_cols)), mode="edge")
    details: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    approximation = working
    for level in range(levels):
        even_rows = approximation[0::2, :]
        odd_rows = approximation[1::2, :]
        low_rows = (even_rows + odd_rows) * 0.5
        high_rows = (even_rows - odd_rows) * 0.5
        low_even = low_rows[:, 0::2]
        low_odd = low_rows[:, 1::2]
        high_even = high_rows[:, 0::2]
        high_odd = high_rows[:, 1::2]
        ll = (low_even + low_odd) * 0.5
        horizontal = (low_even - low_odd) * 0.5
        vertical = (high_even + high_odd) * 0.5
        diagonal = (high_even - high_odd) * 0.5
        coefficients = np.concatenate([np.abs(horizontal).ravel(), np.abs(vertical).ravel(), np.abs(diagonal).ravel()])
        noise = float(np.median(coefficients)) / 0.6745 if coefficients.size else 0.0
        threshold = noise * (0.8 + level * 0.35) * strength
        shrink = lambda values: np.sign(values) * np.maximum(np.abs(values) - threshold, 0.0)
        details.append((shrink(horizontal), shrink(vertical), shrink(diagonal)))
        approximation = ll
    for horizontal, vertical, diagonal in reversed(details):
        low_even = approximation + horizontal
        low_odd = approximation - horizontal
        high_even = vertical + diagonal
        high_odd = vertical - diagonal
        low_rows = np.empty((approximation.shape[0], approximation.shape[1] * 2), dtype=np.float32)
        high_rows = np.empty_like(low_rows)
        low_rows[:, 0::2] = low_even
        low_rows[:, 1::2] = low_odd
        high_rows[:, 0::2] = high_even
        high_rows[:, 1::2] = high_odd
        reconstructed = np.empty((low_rows.shape[0] * 2, low_rows.shape[1]), dtype=np.float32)
        reconstructed[0::2, :] = low_rows + high_rows
        reconstructed[1::2, :] = low_rows - high_rows
        approximation = reconstructed
    return approximation[: original_shape[0], : original_shape[1]]


def wavelet_structure_simplify(rgb: np.ndarray, alpha: np.ndarray, strength: float) -> tuple[np.ndarray, dict[str, object]]:
    """Suppress high-frequency texture while retaining strong structural edges."""
    values = rgb.astype(np.float32)
    denoised = np.stack(
        [_haar_denoise_channel(values[..., channel], strength) for channel in range(3)],
        axis=2,
    )
    luminance = 0.2126 * values[..., 0] + 0.7152 * values[..., 1] + 0.0722 * values[..., 2]
    gradient = np.zeros_like(luminance)
    gradient[:-1, :] = np.maximum(gradient[:-1, :], np.abs(np.diff(luminance, axis=0)))
    gradient[:, :-1] = np.maximum(gradient[:, :-1], np.abs(np.diff(luminance, axis=1)))
    edge_weight = np.clip((gradient - 5.0) / 34.0, 0.0, 1.0) * alpha
    mixed = denoised * (1.0 - edge_weight[..., None]) + values * edge_weight[..., None]
    detail_before = float(np.mean(np.abs(values - denoised)[alpha > 0.05])) if np.any(alpha > 0.05) else 0.0
    return np.clip(np.rint(mixed), 0, 255).astype(np.uint8), {
        "method": "haar_soft_threshold_edge_blend",
        "levels": 2,
        "strength": strength,
        "mean_removed_detail": detail_before,
    }


def cluster_master_colors(rgb: np.ndarray, alpha: np.ndarray, count: int, seed: int) -> tuple[np.ndarray, dict[str, object]]:
    occupied = alpha >= 0.05
    values = srgb_to_lab(rgb[occupied])
    if len(values) == 0:
        raise ValueError("Background removal left no visible subject pixels.")
    rng = np.random.default_rng(seed)
    if len(values) > MAX_CLUSTER_SAMPLE:
        sample = values[rng.choice(len(values), size=MAX_CLUSTER_SAMPLE, replace=False)]
    else:
        sample = values
    cluster_count = min(max(4, count * 2), 48, len(np.unique(np.round(sample, 1), axis=0)))
    centers, _ = deterministic_kmeans(sample, max(1, cluster_count), seed)
    quantized_lab = np.empty_like(values)
    chunk = 20_000
    for start in range(0, len(values), chunk):
        part = values[start : start + chunk]
        labels = np.argmin(np.sum((part[:, None, :] - centers[None, :, :]) ** 2, axis=2), axis=1)
        quantized_lab[start : start + chunk] = centers[labels]
    result = rgb.copy()
    result[occupied] = lab_to_srgb(quantized_lab)
    return result, {"method": "lab_kmeans", "cluster_count": int(len(centers)), "sample_size": int(len(sample))}


def _crop_to_subject(rgb: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int, int]]:
    occupied = np.argwhere(alpha >= 0.02)
    if occupied.size == 0:
        raise ValueError("Background removal left no visible subject pixels.")
    row_min, col_min = occupied.min(axis=0)
    row_max, col_max = occupied.max(axis=0)
    padding = max(2, int(round(max(rgb.shape[:2]) * 0.01)))
    row_min = max(0, int(row_min) - padding)
    col_min = max(0, int(col_min) - padding)
    row_max = min(rgb.shape[0] - 1, int(row_max) + padding)
    col_max = min(rgb.shape[1] - 1, int(col_max) + padding)
    return (
        rgb[row_min : row_max + 1, col_min : col_max + 1],
        alpha[row_min : row_max + 1, col_min : col_max + 1],
        (col_min, row_min, col_max + 1, row_max + 1),
    )


def _fit_dimensions(width: int, height: int, maximum_columns: int, maximum_rows: int) -> tuple[int, int]:
    scale = min(maximum_columns / width, maximum_rows / height)
    return max(1, min(maximum_columns, round(width * scale))), max(1, min(maximum_rows, round(height * scale)))


def downsample_premultiplied(rgb: np.ndarray, alpha: np.ndarray, size: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    premultiplied = rgb.astype(np.float32) / 255.0 * alpha[..., None]
    resized_alpha = np.asarray(Image.fromarray(alpha.astype(np.float32), mode="F").resize(size, Image.Resampling.BOX), dtype=np.float32)
    channels = [
        np.asarray(Image.fromarray(premultiplied[..., channel], mode="F").resize(size, Image.Resampling.BOX), dtype=np.float32)
        for channel in range(3)
    ]
    resized = np.stack(channels, axis=2) / np.maximum(resized_alpha[..., None], 1e-6)
    return np.clip(np.rint(resized * 255.0), 0, 255).astype(np.uint8), resized_alpha


def _remove_tiny_components(mask: np.ndarray, minimum_size: int = 2) -> np.ndarray:
    cleaned = mask.copy()
    seen = np.zeros_like(mask, dtype=bool)
    for start_row, start_col in np.argwhere(mask):
        row = int(start_row)
        col = int(start_col)
        if seen[row, col]:
            continue
        component: list[tuple[int, int]] = []
        queue = [(row, col)]
        seen[row, col] = True
        while queue:
            current_row, current_col = queue.pop()
            component.append((current_row, current_col))
            for next_row, next_col in ((current_row - 1, current_col), (current_row + 1, current_col), (current_row, current_col - 1), (current_row, current_col + 1)):
                if 0 <= next_row < mask.shape[0] and 0 <= next_col < mask.shape[1] and mask[next_row, next_col] and not seen[next_row, next_col]:
                    seen[next_row, next_col] = True
                    queue.append((next_row, next_col))
        if len(component) < minimum_size:
            for current_row, current_col in component:
                cleaned[current_row, current_col] = False
    return cleaned


def _enforce_symmetry(grid: np.ndarray, mode: str) -> np.ndarray:
    if mode == "none":
        return grid
    result = grid.copy()
    if mode == "vertical":
        for col in range(grid.shape[1] // 2):
            mirror = grid.shape[1] - col - 1
            for row in range(grid.shape[0]):
                left = int(result[row, col])
                right = int(result[row, mirror])
                if left < 0 <= right:
                    result[row, col] = right
                else:
                    result[row, mirror] = left
    elif mode == "horizontal":
        for row in range(grid.shape[0] // 2):
            mirror = grid.shape[0] - row - 1
            for col in range(grid.shape[1]):
                top = int(result[row, col])
                bottom = int(result[mirror, col])
                if top < 0 <= bottom:
                    result[row, col] = bottom
                else:
                    result[mirror, col] = top
    else:
        for row in range(grid.shape[0]):
            for col in range(grid.shape[1]):
                mirror_row = grid.shape[0] - row - 1
                mirror_col = grid.shape[1] - col - 1
                if row < mirror_row or (row == mirror_row and col <= mirror_col):
                    source = int(result[row, col])
                    mirror_value = int(result[mirror_row, mirror_col])
                    if source < 0 <= mirror_value:
                        result[row, col] = mirror_value
                    else:
                        result[mirror_row, mirror_col] = source
    return result


def _save_rgba(rgb: np.ndarray, alpha: np.ndarray, path: Path) -> None:
    rgba = np.dstack([rgb, np.clip(np.rint(alpha * 255), 0, 255).astype(np.uint8)])
    Image.fromarray(rgba, mode="RGBA").save(path, optimize=True)


def convert_image(
    input_path: Path,
    output_dir: Path,
    settings: ConversionSettings,
    palette: list[dict[str, object]],
    progress: ProgressCallback,
) -> dict[str, object]:
    _check_settings(settings, len(palette))
    output_dir.mkdir(parents=True, exist_ok=True)
    progress("decode", 0.05, "image.progress.decode")
    image, source_metadata = _load_oriented_srgb(input_path)
    rgba = np.asarray(image, dtype=np.uint8)

    progress("background", 0.17, "image.progress.background")
    if settings.background_mode == "auto":
        alpha, background_metadata = remove_background(rgba, tolerance=settings.background_tolerance, seed=settings.seed)
    else:
        alpha = rgba[..., 3].astype(np.float32) / 255.0
        if settings.background_mode == "none":
            alpha = np.ones_like(alpha)
        background_metadata = {"method": "preserve_alpha" if settings.background_mode == "preserve" else "disabled"}

    progress("wavelet", 0.34, "image.progress.wavelet")
    simplified, wavelet_metadata = wavelet_structure_simplify(rgba[..., :3], alpha, settings.wavelet_strength)
    cropped_rgb, cropped_alpha, crop_box = _crop_to_subject(simplified, alpha)

    progress("cluster", 0.49, "image.progress.cluster")
    clustered_rgb, clustering_metadata = cluster_master_colors(cropped_rgb, cropped_alpha, settings.color_count, settings.seed)
    master_path = output_dir / "master.png"
    _save_rgba(clustered_rgb, cropped_alpha, master_path)

    progress("rasterize", 0.65, "image.progress.rasterize")
    target_size = _fit_dimensions(clustered_rgb.shape[1], clustered_rgb.shape[0], settings.columns, settings.rows)
    grid_rgb, grid_alpha = downsample_premultiplied(clustered_rgb, cropped_alpha, target_size)
    mask = grid_alpha >= settings.alpha_threshold
    if settings.remove_tiny_components:
        mask = _remove_tiny_components(mask, minimum_size=2)
    if not np.any(mask):
        raise ValueError("The selected alpha threshold leaves no occupied cells.")

    progress("palette", 0.78, "image.progress.palette")
    palette_rgb = np.asarray([entry["rgb"] for entry in palette], dtype=np.uint8)
    selected_indices, occupied_labels = compact_palette_subset(
        grid_rgb[mask], palette_rgb, settings.color_count, settings.seed
    )
    grid = np.full(mask.shape, -1, dtype=np.int32)
    grid[mask] = selected_indices[occupied_labels]
    grid = _enforce_symmetry(grid, settings.symmetry)

    pattern_rgba = np.zeros((*grid.shape, 4), dtype=np.uint8)
    occupied = grid >= 0
    pattern_rgba[occupied, :3] = palette_rgb[grid[occupied]]
    pattern_rgba[occupied, 3] = 255
    pattern_path = output_dir / "pattern.png"
    Image.fromarray(pattern_rgba, mode="RGBA").resize(
        (grid.shape[1] * 12, grid.shape[0] * 12), Image.Resampling.NEAREST
    ).save(pattern_path, optimize=True)

    occupied_positions = np.argwhere(occupied)
    row_min, col_min = occupied_positions.min(axis=0)
    row_max, col_max = occupied_positions.max(axis=0)
    used_indices = sorted(int(value) for value in np.unique(grid[occupied]))
    inventory = Counter(int(value) for value in grid[occupied])
    metadata = {
        "pipeline_version": 1,
        "source": source_metadata,
        "background": background_metadata,
        "wavelet": wavelet_metadata,
        "master_clustering": clustering_metadata,
        "crop_box_zero_based": list(crop_box),
        "target_maximum": [settings.columns, settings.rows],
        "grid": [int(grid.shape[1]), int(grid.shape[0])],
        "footprint": [int(col_max - col_min + 1), int(row_max - row_min + 1)],
        "alpha_threshold": settings.alpha_threshold,
        "seed": settings.seed,
        "symmetry": settings.symmetry,
        "symmetry_axis_or_center": (
            None
            if settings.symmetry == "none"
            else [(grid.shape[1] - 1) / 2.0]
            if settings.symmetry == "vertical"
            else [(grid.shape[0] - 1) / 2.0]
            if settings.symmetry == "horizontal"
            else [(grid.shape[0] - 1) / 2.0, (grid.shape[1] - 1) / 2.0]
        ),
        "symmetry_check_passed": bool(
            settings.symmetry == "none"
            or (settings.symmetry == "vertical" and np.array_equal(grid, np.fliplr(grid)))
            or (settings.symmetry == "horizontal" and np.array_equal(grid, np.flipud(grid)))
            or (settings.symmetry == "central" and np.array_equal(grid, np.flipud(np.fliplr(grid))))
        ),
        "used_palette_indices": used_indices,
        "bead_count": int(np.sum(occupied)),
        "inventory": {str(index): inventory[index] for index in used_indices},
        "operations": [
            "orientation_and_srgb_normalization",
            background_metadata["method"],
            "haar_wavelet_structure_simplification",
            "high_resolution_lab_clustering",
            "premultiplied_alpha_box_resampling",
            "lab_palette_subset_quantization",
        ],
    }
    result = {
        "document": {
            "columns": int(grid.shape[1]),
            "rows": int(grid.shape[0]),
            "cells": [None if value < 0 else int(value) for value in grid.ravel()],
            "processing": metadata,
        },
        "assets": {"master": master_path.name, "pattern": pattern_path.name},
        "metadata": metadata,
    }
    progress("validate", 0.94, "image.progress.validate")
    result_path = output_dir / "result.json"
    import json

    result_path.write_text(json.dumps(result, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    progress("complete", 1.0, "image.progress.complete")
    return {"result_path": str(result_path), "result": result}
