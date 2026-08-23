#!/usr/bin/env python3
"""Make the Tempus bead grid exactly symmetric and remove flame outlines."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

import numpy as np

from make_perler_pattern import (
    prune_unused_palette,
    render_board_tiles,
    render_full_chart,
    render_preview,
    srgb_to_lab,
    write_csv_files,
)


SOURCE_TAG = "tempus_emblem_28x96_v1"
OUTPUT_TAG = "tempus_emblem_27x96_v2"
SOURCE_DIR = Path("projects/tempus_emblem/patterns") / SOURCE_TAG
OUTPUT_DIR = Path("projects/tempus_emblem/patterns") / OUTPUT_TAG
GRID_SIZE = 100
CENTER_COLUMN = 49  # Zero-based, column 50 on the physical board.

GOLD_CODES = {"A20", "A26", "B26", "G5", "G6"}
OUTLINE_CODES = {"G8", "G14"}
STEEL_CODES = {"H4", "H15", "M15"}
RED_CODES = {"F15"}


def read_source() -> tuple[np.ndarray, dict[str, np.ndarray]]:
    with (SOURCE_DIR / f"{SOURCE_TAG}.csv").open(
        newline="", encoding="utf-8"
    ) as file:
        rows = list(csv.reader(file))
    code_grid = np.asarray([row[1:] for row in rows[1:]], dtype=object)
    if code_grid.shape != (GRID_SIZE, GRID_SIZE):
        raise ValueError(f"Unexpected source grid shape: {code_grid.shape}")

    colors: dict[str, np.ndarray] = {}
    with (SOURCE_DIR / f"{SOURCE_TAG}_inventory.csv").open(
        newline="", encoding="utf-8"
    ) as file:
        for row in csv.DictReader(file):
            colors[row["code"]] = np.asarray(
                [int(row["red"]), int(row["green"]), int(row["blue"])],
                dtype=np.uint8,
            )
    return code_grid, colors


def semantic_class(codes: list[str], row: int, distance: int) -> str:
    if any(item in RED_CODES for item in codes):
        return "red"
    has_steel = any(item in STEEL_CODES for item in codes)
    has_gold = any(item in GOLD_CODES for item in codes)
    if has_steel and not has_gold:
        return "steel"
    if has_gold and not has_steel:
        return "gold"
    if has_steel and has_gold:
        if 16 <= row <= 70 and distance <= 3:
            return "steel"
        if 71 <= row <= 76 and distance <= 8:
            return "steel"
        if 77 <= row <= 92 and distance <= 3:
            return "steel"
        return "gold"

    # Cells containing only the former dark-brown outline are absorbed into
    # the adjacent material. This removes the flame wraparound color while
    # retaining the sword and crossguard silhouette.
    if 16 <= row <= 70 and distance <= 3:
        return "steel"
    if 71 <= row <= 76 and distance <= 8:
        return "steel"
    if 77 <= row <= 92 and distance <= 3:
        return "steel"
    return "gold"


def nearest_code(
    source_codes: list[str],
    candidates: list[str],
    colors: dict[str, np.ndarray],
) -> str:
    source_rgb = np.mean(
        np.stack([colors[item] for item in source_codes], axis=0),
        axis=0,
    )
    source_lab = srgb_to_lab(source_rgb)
    candidate_rgb = np.stack([colors[item] for item in candidates], axis=0)
    candidate_lab = srgb_to_lab(candidate_rgb)
    distances = np.sum((candidate_lab - source_lab) ** 2, axis=1)
    return candidates[int(np.argmin(distances))]


def choose_symmetric_code(
    left_code: str,
    right_code: str,
    row: int,
    distance: int,
    colors: dict[str, np.ndarray],
) -> str:
    source_codes = [item for item in (left_code, right_code) if item]
    if not source_codes:
        return ""
    material = semantic_class(source_codes, row, distance)
    if material == "red":
        return "F15"
    if material == "gold":
        return nearest_code(
            source_codes,
            ["A20", "A26", "G5", "G6"],
            colors,
        )
    # Keep M15 exclusive to the one-cell centerline along the blade and hilt.
    return nearest_code(source_codes, ["H4", "H15"], colors)


def build_symmetric_grid(
    source: np.ndarray,
    colors: dict[str, np.ndarray],
) -> np.ndarray:
    result = np.full(source.shape, "", dtype=object)
    old_left_center = 49
    old_right_center = 50

    for row in range(GRID_SIZE):
        center_sources = [
            item
            for item in (source[row, old_left_center], source[row, old_right_center])
            if item
        ]
        if center_sources:
            result[row, CENTER_COLUMN] = choose_symmetric_code(
                source[row, old_left_center],
                source[row, old_right_center],
                row,
                0,
                colors,
            )

        for distance in range(1, CENTER_COLUMN + 1):
            source_left = old_left_center - distance
            source_right = old_right_center + distance
            if source_left < 0 or source_right >= GRID_SIZE:
                continue
            selected = choose_symmetric_code(
                source[row, source_left],
                source[row, source_right],
                row,
                distance,
                colors,
            )
            if not selected:
                continue
            result[row, CENTER_COLUMN - distance] = selected
            result[row, CENTER_COLUMN + distance] = selected

    # A single M15 cell forms the exact central ridge. The gem interrupts the
    # ridge, matching the source design.
    for row in list(range(16, 72)) + list(range(76, 93)):
        if result[row, CENTER_COLUMN]:
            result[row, CENTER_COLUMN] = "M15"
    for row in list(range(16, 72)) + list(range(76, 93)):
        for column in (CENTER_COLUMN - 1, CENTER_COLUMN + 1):
            if result[row, column] == "M15":
                result[row, column] = "H4"
    return result


def main() -> None:
    source, colors = read_source()
    symmetric_codes = build_symmetric_grid(source, colors)
    ordered_codes = [
        code
        for code in ("A20", "A26", "F15", "G5", "G6", "H4", "H15", "M15")
        if np.any(symmetric_codes == code)
    ]
    palette = np.stack([colors[item] for item in ordered_codes], axis=0)
    code_to_label = {item: index for index, item in enumerate(ordered_codes)}
    label_grid = np.full(symmetric_codes.shape, -1, dtype=np.int16)
    for item, label in code_to_label.items():
        label_grid[symmetric_codes == item] = label
    label_grid, palette, ordered_codes = prune_unused_palette(
        label_grid,
        palette,
        ordered_codes,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    inventory = Counter(int(label) for label in label_grid[label_grid >= 0])
    pattern_tag = OUTPUT_TAG
    palette_type = "MARD 221 v1 fixed reference colors"
    render_preview(
        label_grid,
        palette,
        OUTPUT_DIR / f"{pattern_tag}_preview.png",
    )
    render_full_chart(
        label_grid,
        palette,
        inventory,
        ordered_codes,
        palette_type,
        GRID_SIZE,
        "Tempus emblem - symmetric",
        OUTPUT_DIR / f"{pattern_tag}_chart.png",
    )
    render_board_tiles(
        label_grid,
        palette,
        ordered_codes,
        GRID_SIZE,
        pattern_tag,
        OUTPUT_DIR / "tiles",
    )
    write_csv_files(
        label_grid,
        palette,
        ordered_codes,
        inventory,
        OUTPUT_DIR,
        pattern_tag,
    )

    occupied = np.argwhere(label_grid >= 0)
    metadata = {
        "source_pattern": str(SOURCE_DIR),
        "artifact_id": OUTPUT_TAG,
        "name": "tempus_emblem",
        "version": "v2",
        "title": "Tempus emblem v2",
        "grid": [GRID_SIZE, GRID_SIZE],
        "board_size": [GRID_SIZE, GRID_SIZE],
        "boards": [1, 1],
        "footprint": [
            int(occupied[:, 1].max() - occupied[:, 1].min() + 1),
            int(occupied[:, 0].max() - occupied[:, 0].min() + 1),
        ],
        "occupied_rows_one_based": [
            int(occupied[:, 0].min() + 1),
            int(occupied[:, 0].max() + 1),
        ],
        "occupied_columns_one_based": [
            int(occupied[:, 1].min() + 1),
            int(occupied[:, 1].max() + 1),
        ],
        "symmetry_type": "vertical_axis",
        "symmetry_axis_column_one_based": CENTER_COLUMN + 1,
        "palette_type": palette_type,
        "palette_source": "palettes/mard_221_v1.json",
        "palette_codes": ordered_codes,
        "color_count": len(ordered_codes),
        "bead_count": int(np.sum(label_grid >= 0)),
        "structural_edits": {
            "exact_vertical_axis_mirror": True,
            "removed_flame_outline_codes": ["B26", "G8", "G14"],
            "blade_centerline": {
                "code": "M15",
                "width_cells": 1,
                "column_one_based": CENTER_COLUMN + 1,
            },
        },
    }
    (OUTPUT_DIR / f"{OUTPUT_TAG}_metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
