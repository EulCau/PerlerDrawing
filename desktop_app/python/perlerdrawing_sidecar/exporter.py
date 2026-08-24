"""Validated complete artifact export from one immutable document snapshot."""

from __future__ import annotations

import csv
import io
import json
import math
import os
import shutil
import tarfile
import tempfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as pdf_canvas

ProgressCallback = Callable[[str, float, str], None]
EMPTY_CELL = 65535
MAX_GRID_DIMENSION = 500
REQUIRED_SUFFIXES = (
    ".csv",
    "_preview.png",
    "_preview_white.png",
    "_chart.png",
    "_inventory.csv",
    "_metadata.json",
    "_palette.json",
    "_boards.pdf",
)


def _font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def _validate_snapshot(snapshot: dict[str, object]) -> tuple[np.ndarray, list[dict[str, object]]]:
    artifact = snapshot.get("artifact")
    canvas = snapshot.get("canvas")
    board = snapshot.get("board")
    palette = snapshot.get("palette")
    cells = snapshot.get("cells")
    if not isinstance(artifact, dict) or not isinstance(canvas, dict) or not isinstance(board, dict):
        raise ValueError("Snapshot is missing artifact, canvas, or board settings.")
    name = artifact.get("name")
    version = artifact.get("version")
    import re

    if not isinstance(name, str) or re.fullmatch(r"[a-z0-9]+(?:_[a-z0-9]+)*", name) is None:
        raise ValueError("Artifact name must use lowercase snake_case.")
    if not isinstance(version, str) or re.fullmatch(r"v[1-9][0-9]*", version) is None:
        raise ValueError("Artifact version must use vN.")
    columns = canvas.get("columns")
    rows = canvas.get("rows")
    if not isinstance(columns, int) or not isinstance(rows, int) or not 1 <= columns <= MAX_GRID_DIMENSION or not 1 <= rows <= MAX_GRID_DIMENSION:
        raise ValueError("Canvas dimensions are invalid.")
    if not all(isinstance(board.get(key), int) and int(board[key]) > 0 for key in ("columns", "rows", "subdivision")):
        raise ValueError("Board settings are invalid.")
    if not isinstance(palette, dict) or not isinstance(palette.get("colors"), list):
        raise ValueError("Snapshot palette is invalid.")
    colors = palette["colors"]
    if not colors:
        raise ValueError("Snapshot palette is empty.")
    codes: set[str] = set()
    for color in colors:
        if not isinstance(color, dict) or not isinstance(color.get("code"), str):
            raise ValueError("Palette entries require codes.")
        rgb = color.get("rgb")
        if not isinstance(rgb, list) or len(rgb) != 3 or any(not isinstance(value, int) or not 0 <= value <= 255 for value in rgb):
            raise ValueError("Palette entries require valid RGB values.")
        if color["code"] in codes:
            raise ValueError("Palette codes must be unique.")
        codes.add(color["code"])
    if not isinstance(cells, list) or len(cells) != columns * rows:
        raise ValueError("Grid cell count does not match canvas dimensions.")
    values = np.asarray(cells, dtype=np.int64)
    valid = (values == EMPTY_CELL) | ((values >= 0) & (values < len(colors)))
    if not bool(np.all(valid)):
        raise ValueError("Grid contains a palette index outside the snapshot palette.")
    grid = values.reshape((rows, columns)).astype(np.int32)
    if not np.any(grid != EMPTY_CELL):
        raise ValueError("A complete package cannot be exported from an empty pattern.")
    return grid, colors


def _occupied_bounds(grid: np.ndarray) -> tuple[int, int, int, int]:
    positions = np.argwhere(grid != EMPTY_CELL)
    row_min, col_min = positions.min(axis=0)
    row_max, col_max = positions.max(axis=0)
    return int(row_min), int(col_min), int(row_max), int(col_max)


def _png_info(artifact_id: str, palette: dict[str, object]) -> PngImagePlugin.PngInfo:
    info = PngImagePlugin.PngInfo()
    info.add_text("Software", "PerlerDrawing Desktop 1.0.0")
    info.add_text("Document", artifact_id)
    info.add_text("Palette", f"{palette.get('standardId', 'custom')}@{palette.get('version', 'unknown')}")
    return info


def _pattern_rgba(grid: np.ndarray, colors: list[dict[str, object]]) -> np.ndarray:
    rgba = np.zeros((*grid.shape, 4), dtype=np.uint8)
    occupied = grid != EMPTY_CELL
    palette_rgb = np.asarray([entry["rgb"] for entry in colors], dtype=np.uint8)
    rgba[occupied, :3] = palette_rgb[grid[occupied]]
    rgba[occupied, 3] = 255
    return rgba


def _render_previews(
    grid: np.ndarray,
    colors: list[dict[str, object]],
    artifact_id: str,
    palette: dict[str, object],
    directory: Path,
) -> None:
    rgba = _pattern_rgba(grid, colors)
    scale = max(1, min(16, 1600 // max(grid.shape)))
    transparent = Image.fromarray(rgba, mode="RGBA").resize(
        (grid.shape[1] * scale, grid.shape[0] * scale), Image.Resampling.NEAREST
    )
    transparent.save(directory / f"{artifact_id}_preview.png", pnginfo=_png_info(artifact_id, palette), optimize=True)
    white = Image.new("RGB", transparent.size, "white")
    white.paste(transparent, mask=transparent.getchannel("A"))
    white.save(directory / f"{artifact_id}_preview_white.png", pnginfo=_png_info(artifact_id, palette), optimize=True)


def _text_color(rgb: list[int]) -> tuple[int, int, int]:
    luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    return (24, 24, 27) if luminance > 150 else (255, 255, 255)


def _draw_chart_cells(
    draw: ImageDraw.ImageDraw,
    grid: np.ndarray,
    colors: list[dict[str, object]],
    *,
    origin: tuple[int, int],
    cell_size: int,
    global_row_offset: int = 0,
    global_col_offset: int = 0,
) -> None:
    code_font = _font(max(7, cell_size // 3), bold=True)
    axis_font = _font(max(8, cell_size // 3))
    left, top = origin
    for row in range(grid.shape[0]):
        for col in range(grid.shape[1]):
            x0 = left + col * cell_size
            y0 = top + row * cell_size
            x1 = x0 + cell_size
            y1 = y0 + cell_size
            draw.rectangle((x0, y0, x1, y1), fill="white", outline=(214, 216, 224), width=1)
            value = int(grid[row, col])
            if value == EMPTY_CELL:
                continue
            color = colors[value]
            rgb = color["rgb"]
            inset = max(1, cell_size // 11)
            draw.ellipse((x0 + inset, y0 + inset, x1 - inset, y1 - inset), fill=tuple(rgb), outline=(55, 55, 60))
            text = str(color["code"])
            box = draw.textbbox((0, 0), text, font=code_font)
            draw.text(
                (x0 + (cell_size - (box[2] - box[0])) / 2, y0 + (cell_size - (box[3] - box[1])) / 2 - box[1]),
                text,
                fill=_text_color(rgb),
                font=code_font,
            )
    for col in range(grid.shape[1]):
        label = str(global_col_offset + col + 1)
        box = draw.textbbox((0, 0), label, font=axis_font)
        draw.text((left + col * cell_size + (cell_size - (box[2] - box[0])) / 2, top - max(13, cell_size // 2)), label, fill=(65, 68, 78), font=axis_font)
    for row in range(grid.shape[0]):
        label = str(global_row_offset + row + 1)
        box = draw.textbbox((0, 0), label, font=axis_font)
        draw.text((left - (box[2] - box[0]) - 7, top + row * cell_size + (cell_size - (box[3] - box[1])) / 2 - box[1]), label, fill=(65, 68, 78), font=axis_font)


def _render_chart(
    grid: np.ndarray,
    colors: list[dict[str, object]],
    inventory: Counter[int],
    artifact_id: str,
    board: dict[str, object],
    directory: Path,
) -> None:
    max_dimension = max(grid.shape)
    cell_size = 30 if max_dimension <= 120 else 20 if max_dimension <= 240 else 16
    left = 72
    top = 115
    grid_width = grid.shape[1] * cell_size
    grid_height = grid.shape[0] * cell_size
    legend_rows = math.ceil(len(inventory) / 4)
    image = Image.new("RGB", (left + grid_width + 48, top + grid_height + 100 + legend_rows * 42), "white")
    draw = ImageDraw.Draw(image)
    draw.text((left, 24), artifact_id, fill=(25, 26, 32), font=_font(28, bold=True))
    draw.text((left, 65), f"{grid.shape[1]} x {grid.shape[0]} grid | {sum(inventory.values())} beads", fill=(80, 82, 92), font=_font(15))
    _draw_chart_cells(draw, grid, colors, origin=(left, top), cell_size=cell_size)
    board_columns = int(board["columns"])
    board_rows = int(board["rows"])
    for col in range(0, grid.shape[1] + 1, board_columns):
        x = left + col * cell_size
        draw.line((x, top, x, top + grid_height), fill=(91, 76, 196), width=3)
    for row in range(0, grid.shape[0] + 1, board_rows):
        y = top + row * cell_size
        draw.line((left, y, left + grid_width, y), fill=(91, 76, 196), width=3)
    legend_top = top + grid_height + 58
    legend_column_width = max(180, grid_width // 4)
    for item_index, palette_index in enumerate(sorted(inventory)):
        column = item_index % 4
        row = item_index // 4
        x = left + column * legend_column_width
        y = legend_top + row * 42
        color = colors[palette_index]
        draw.ellipse((x, y, x + 28, y + 28), fill=tuple(color["rgb"]), outline=(60, 60, 65))
        draw.text((x + 38, y + 5), f"{color['code']}  {inventory[palette_index]}", fill=(35, 36, 42), font=_font(13, bold=True))
    image.save(directory / f"{artifact_id}_chart.png", optimize=True)


def _render_tiles(
    grid: np.ndarray,
    colors: list[dict[str, object]],
    artifact_id: str,
    board: dict[str, object],
    directory: Path,
) -> int:
    tiles = directory / "tiles"
    tiles.mkdir()
    board_columns = int(board["columns"])
    board_rows = int(board["rows"])
    row_count = math.ceil(grid.shape[0] / board_rows)
    column_count = math.ceil(grid.shape[1] / board_columns)
    cell_size = 34
    margin = 68
    for board_row in range(row_count):
        for board_col in range(column_count):
            row_start = board_row * board_rows
            col_start = board_col * board_columns
            tile = grid[row_start : row_start + board_rows, col_start : col_start + board_columns]
            image = Image.new("RGB", (margin + tile.shape[1] * cell_size + 30, margin + tile.shape[0] * cell_size + 32), "white")
            draw = ImageDraw.Draw(image)
            draw.text((margin, 14), f"Board r{board_row + 1} c{board_col + 1}", fill=(28, 29, 35), font=_font(20, bold=True))
            _draw_chart_cells(
                draw,
                tile,
                colors,
                origin=(margin, margin),
                cell_size=cell_size,
                global_row_offset=row_start,
                global_col_offset=col_start,
            )
            draw.rectangle((margin, margin, margin + tile.shape[1] * cell_size, margin + tile.shape[0] * cell_size), outline=(91, 76, 196), width=4)
            image.save(tiles / f"{artifact_id}_board_r{board_row + 1}_c{board_col + 1}.png", optimize=True)
    return row_count * column_count


def _render_board_pdf(
    grid: np.ndarray,
    colors: list[dict[str, object]],
    artifact_id: str,
    board: dict[str, object],
    output_path: Path,
) -> int:
    """Render one physical board per A4 page with global row and column coordinates."""
    page_width, page_height = A4
    margin_left = 42.0
    margin_right = 30.0
    margin_bottom = 42.0
    header_height = 72.0
    board_columns = int(board["columns"])
    board_rows = int(board["rows"])
    row_count = math.ceil(grid.shape[0] / board_rows)
    column_count = math.ceil(grid.shape[1] / board_columns)
    page_count = row_count * column_count
    document = pdf_canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    document.setTitle(f"{artifact_id} board charts")
    document.setAuthor("PerlerDrawing Desktop")
    document.setSubject("Printable perler bead board charts")

    page_number = 0
    for board_row in range(row_count):
        for board_col in range(column_count):
            page_number += 1
            row_start = board_row * board_rows
            col_start = board_col * board_columns
            tile = grid[
                row_start : row_start + board_rows,
                col_start : col_start + board_columns,
            ]
            available_width = page_width - margin_left - margin_right
            available_height = page_height - margin_bottom - header_height
            cell_size = min(
                14.4,  # 5.08 mm standard peg pitch at 72 points per inch.
                available_width / max(1, tile.shape[1]),
                available_height / max(1, tile.shape[0]),
            )
            grid_width = tile.shape[1] * cell_size
            grid_height = tile.shape[0] * cell_size
            origin_x = margin_left
            origin_y = margin_bottom + (available_height - grid_height) / 2

            document.setFillColorRGB(0.10, 0.10, 0.13)
            document.setFont("Helvetica-Bold", 15)
            document.drawString(margin_left, page_height - 32, artifact_id)
            document.setFont("Helvetica", 8.5)
            document.setFillColorRGB(0.33, 0.34, 0.39)
            document.drawString(
                margin_left,
                page_height - 49,
                f"Board r{board_row + 1} c{board_col + 1} | "
                f"rows {row_start + 1}-{row_start + tile.shape[0]} | "
                f"columns {col_start + 1}-{col_start + tile.shape[1]} | 5.08 mm pitch",
            )
            page_label = f"Page {page_number} / {page_count}"
            document.drawRightString(page_width - margin_right, page_height - 32, page_label)

            code_size = max(4.2, min(7.0, cell_size * 0.27))
            coordinate_size = max(4.6, min(7.2, cell_size * 0.3))
            document.setLineWidth(0.35)
            for row in range(tile.shape[0]):
                for col in range(tile.shape[1]):
                    x = origin_x + col * cell_size
                    y = origin_y + (tile.shape[0] - row - 1) * cell_size
                    document.setFillColorRGB(1, 1, 1)
                    document.setStrokeColorRGB(0.82, 0.83, 0.86)
                    document.rect(x, y, cell_size, cell_size, fill=1, stroke=1)
                    value = int(tile[row, col])
                    if value == EMPTY_CELL:
                        continue
                    color = colors[value]
                    red, green, blue = [int(channel) / 255.0 for channel in color["rgb"]]
                    inset = max(1.0, cell_size * 0.09)
                    document.setFillColorRGB(red, green, blue)
                    document.setStrokeColorRGB(0.22, 0.22, 0.25)
                    document.circle(
                        x + cell_size / 2,
                        y + cell_size / 2,
                        cell_size / 2 - inset,
                        fill=1,
                        stroke=1,
                    )
                    code = str(color["code"])
                    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                    document.setFillColorRGB(*(0.08, 0.08, 0.10) if luminance > 0.58 else (1, 1, 1))
                    document.setFont("Helvetica-Bold", code_size)
                    document.drawString(
                        x + (cell_size - stringWidth(code, "Helvetica-Bold", code_size)) / 2,
                        y + cell_size / 2 - code_size * 0.34,
                        code,
                    )

            document.setFont("Helvetica", coordinate_size)
            document.setFillColorRGB(0.28, 0.29, 0.34)
            for col in range(tile.shape[1]):
                label = str(col_start + col + 1)
                document.drawString(
                    origin_x
                    + col * cell_size
                    + (cell_size - stringWidth(label, "Helvetica", coordinate_size)) / 2,
                    origin_y + grid_height + 5,
                    label,
                )
            for row in range(tile.shape[0]):
                label = str(row_start + row + 1)
                document.drawRightString(
                    origin_x - 5,
                    origin_y
                    + (tile.shape[0] - row - 0.5) * cell_size
                    - coordinate_size * 0.32,
                    label,
                )
            document.setStrokeColorRGB(0.36, 0.30, 0.77)
            document.setLineWidth(1.8)
            document.rect(origin_x, origin_y, grid_width, grid_height, fill=0, stroke=1)
            document.showPage()
    document.save()
    return page_count


def export_board_pdf(
    snapshot_path: Path,
    pdf_path: Path,
    progress: ProgressCallback,
) -> dict[str, object]:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    grid, colors = _validate_snapshot(snapshot)
    artifact = snapshot["artifact"]
    board = snapshot["board"]
    row_min, col_min, row_max, col_max = _occupied_bounds(grid)
    artifact_id = (
        f"{artifact['name']}_{col_max - col_min + 1}x{row_max - row_min + 1}_"
        f"{artifact['version']}"
    )
    progress("pdf", 0.2, "export.progress.pdf")
    target = pdf_path.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        prefix=f".{artifact_id}-",
        suffix=".pdf",
        dir=target.parent,
        delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        page_count = _render_board_pdf(grid, colors, artifact_id, board, temporary_path)
        if temporary_path.stat().st_size < 1024:
            raise ValueError("Generated PDF is unexpectedly small.")
        os.replace(temporary_path, target)
    finally:
        temporary_path.unlink(missing_ok=True)
    progress("complete", 1.0, "export.progress.complete")
    return {
        "artifact_id": artifact_id,
        "pdf_path": str(target),
        "page_count": page_count,
    }


def _write_csv(grid: np.ndarray, colors: list[dict[str, object]], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream, lineterminator="\r\n")
        writer.writerow(["row/col", *range(1, grid.shape[1] + 1)])
        for row_index, row in enumerate(grid, start=1):
            writer.writerow([row_index, *["" if value == EMPTY_CELL else colors[int(value)]["code"] for value in row]])


def _write_inventory(colors: list[dict[str, object]], inventory: Counter[int], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream, lineterminator="\r\n")
        writer.writerow(["code", "hex", "red", "green", "blue", "bead_count"])
        for index in sorted(inventory):
            color = colors[index]
            writer.writerow([color["code"], color.get("hex", ""), *color["rgb"], inventory[index]])


def _validate_delivery(directory: Path, artifact_id: str, grid: np.ndarray, inventory: Counter[int], expected_tiles: int) -> dict[str, object]:
    missing = [suffix for suffix in REQUIRED_SUFFIXES if not (directory / f"{artifact_id}{suffix}").is_file()]
    if missing or not (directory / "README.md").is_file():
        raise ValueError(f"Export is missing required files: {missing}")
    if sum(inventory.values()) != int(np.sum(grid != EMPTY_CELL)):
        raise ValueError("Inventory total does not match occupied cells.")
    tiles = sorted((directory / "tiles").glob("*.png"))
    if len(tiles) != expected_tiles:
        raise ValueError("Tile count does not match board layout.")
    pdf_path = directory / f"{artifact_id}_boards.pdf"
    if pdf_path.stat().st_size < 1024 or pdf_path.read_bytes()[:5] != b"%PDF-":
        raise ValueError("Board PDF is missing or invalid.")
    preview = np.asarray(Image.open(directory / f"{artifact_id}_preview.png").convert("RGBA"))
    scale_y = preview.shape[0] // grid.shape[0]
    scale_x = preview.shape[1] // grid.shape[1]
    preview_alpha = preview[::scale_y, ::scale_x, 3][: grid.shape[0], : grid.shape[1]]
    if not np.array_equal(preview_alpha > 0, grid != EMPTY_CELL):
        raise ValueError("Transparent preview occupancy differs from the grid.")
    return {
        "required_files": True,
        "inventory_matches": True,
        "palette_indices_valid": True,
        "preview_occupancy_matches": True,
        "tile_count": expected_tiles,
        "pdf_valid": True,
    }


def export_package(
    snapshot_path: Path,
    archive_path: Path,
    working_dir: Path,
    progress: ProgressCallback,
    master_path: Path | None = None,
) -> dict[str, object]:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    grid, colors = _validate_snapshot(snapshot)
    artifact = snapshot["artifact"]
    palette = snapshot["palette"]
    board = snapshot["board"]
    row_min, col_min, row_max, col_max = _occupied_bounds(grid)
    footprint_width = col_max - col_min + 1
    footprint_height = row_max - row_min + 1
    artifact_id = f"{artifact['name']}_{footprint_width}x{footprint_height}_{artifact['version']}"
    inventory = Counter(int(value) for value in grid[grid != EMPTY_CELL])
    package_dir = working_dir / artifact_id
    package_dir.mkdir(parents=True, exist_ok=False)
    master_relative: str | None = None
    if master_path is not None:
        if not master_path.is_file():
            raise ValueError("The high-resolution master is no longer available.")
        masters_dir = package_dir / "masters"
        masters_dir.mkdir()
        master_name = f"{artifact['name']}_master.png"
        shutil.copyfile(master_path, masters_dir / master_name)
        master_relative = f"masters/{master_name}"

    progress("csv", 0.12, "export.progress.csv")
    _write_csv(grid, colors, package_dir / f"{artifact_id}.csv")
    _write_inventory(colors, inventory, package_dir / f"{artifact_id}_inventory.csv")
    progress("previews", 0.3, "export.progress.previews")
    _render_previews(grid, colors, artifact_id, palette, package_dir)
    progress("chart", 0.5, "export.progress.chart")
    _render_chart(grid, colors, inventory, artifact_id, board, package_dir)
    progress("tiles", 0.68, "export.progress.tiles")
    tile_count = _render_tiles(grid, colors, artifact_id, board, package_dir)
    progress("pdf", 0.76, "export.progress.pdf")
    _render_board_pdf(
        grid,
        colors,
        artifact_id,
        board,
        package_dir / f"{artifact_id}_boards.pdf",
    )

    used_codes = [str(colors[index]["code"]) for index in sorted(inventory)]
    processing = snapshot.get("processing") if isinstance(snapshot.get("processing"), dict) else {}
    metadata = {
        "schema_version": 1,
        "artifact_id": artifact_id,
        "name": artifact["name"],
        "version": artifact["version"],
        "input_master": master_relative or processing.get("master_artifact", "not_available"),
        "grid": [int(grid.shape[1]), int(grid.shape[0])],
        "footprint": [footprint_width, footprint_height],
        "occupied_rows_one_based": [row_min + 1, row_max + 1],
        "occupied_columns_one_based": [col_min + 1, col_max + 1],
        "board_size": [board["columns"], board["rows"]],
        "boards": [math.ceil(grid.shape[1] / int(board["columns"])), math.ceil(grid.shape[0] / int(board["rows"]))],
        "palette": {
            "name": palette.get("name"),
            "standard_id": palette.get("standardId"),
            "version": palette.get("version"),
            "source": palette.get("source"),
        },
        "used_palette_codes": used_codes,
        "color_count": len(used_codes),
        "bead_count": sum(inventory.values()),
        "alpha_threshold": processing.get("alpha_threshold"),
        "seed": processing.get("seed"),
        "background_removal": processing.get("background"),
        "structure_simplification": processing.get("wavelet"),
        "manual_corrections": processing.get("manual_corrections", []),
        "symmetry": snapshot.get("symmetry", {"type": "none"}),
        "protected_structures": processing.get("protected_structures", []),
    }
    (package_dir / f"{artifact_id}_metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    (package_dir / f"{artifact_id}_palette.json").write_text(json.dumps(palette, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    (package_dir / "README.md").write_text(
        "\n".join(
            [
                f"# {artifact_id}",
                "",
                f"- Canvas: {grid.shape[1]} x {grid.shape[0]}",
                f"- Occupied footprint: {footprint_width} x {footprint_height}",
                f"- Palette: {palette.get('name', 'Unknown')}",
                f"- Beads: {sum(inventory.values())}",
                f"- Version: {artifact['version']} (recommended)",
                f"- High-resolution master: {master_relative or 'not available for this document source'}",
                "- Special processing: background removal, wavelet structure simplification, Lab clustering, and fixed-palette quantization are recorded in metadata.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    progress("validate", 0.86, "export.progress.validate")
    validation = _validate_delivery(package_dir, artifact_id, grid, inventory, tile_count)
    archive_path = archive_path.resolve()
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=f".{artifact_id}-", suffix=".tar.gz", dir=archive_path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with tarfile.open(temporary_path, "w:gz") as archive:
            for path in sorted(package_dir.rglob("*")):
                if not path.is_file():
                    continue
                relative = PurePosixPath(artifact_id) / PurePosixPath(path.relative_to(package_dir).as_posix())
                if relative.is_absolute() or ".." in relative.parts:
                    raise ValueError("Unsafe archive member path.")
                archive.add(path, arcname=str(relative), recursive=False)
        os.replace(temporary_path, archive_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    progress("complete", 1.0, "export.progress.complete")
    return {
        "artifact_id": artifact_id,
        "archive_path": str(archive_path),
        "file_count": sum(1 for path in package_dir.rglob("*") if path.is_file()),
        "validation": validation,
    }
