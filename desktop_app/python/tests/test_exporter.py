from __future__ import annotations

import json
import tarfile
import tempfile
import unittest
from pathlib import Path, PurePosixPath

from PIL import Image

from perlerdrawing_sidecar.exporter import EMPTY_CELL, export_package


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def snapshot() -> dict[str, object]:
    palette = json.loads((REPOSITORY_ROOT / "palettes/mard_221_v1.json").read_text(encoding="utf-8"))
    # The desktop snapshot stores RGB arrays explicitly.
    for color in palette["colors"]:
        value = color["hex"].lstrip("#")
        color["rgb"] = [int(value[offset : offset + 2], 16) for offset in (0, 2, 4)]
    cells = [EMPTY_CELL] * (8 * 7)
    for row in range(1, 6):
        for col in range(2, 7):
            cells[row * 8 + col] = (row + col) % 3
    return {
        "schemaVersion": 1,
        "artifact": {"name": "test_badge", "version": "v1"},
        "canvas": {"columns": 8, "rows": 7},
        "board": {"columns": 4, "rows": 4, "subdivision": 2},
        "palette": palette,
        "symmetry": {"type": "none"},
        "processing": {"source": "test", "seed": 7, "alpha_threshold": 0.28},
        "cells": cells,
    }


class ExporterTests(unittest.TestCase):
    def test_complete_export_is_consistent_and_archive_paths_are_safe(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot_path = root / "snapshot.json"
            snapshot_path.write_text(json.dumps(snapshot()), encoding="utf-8")
            archive_path = root / "delivery.tar.gz"
            master_path = root / "master.png"
            Image.new("RGBA", (40, 30), (220, 45, 61, 255)).save(master_path)
            result = export_package(
                snapshot_path,
                archive_path,
                root / "work",
                lambda *_: None,
                master_path,
            )
            self.assertEqual(result["artifact_id"], "test_badge_5x5_v1")
            self.assertTrue(result["validation"]["required_files"])
            self.assertTrue(result["validation"]["inventory_matches"])
            self.assertTrue(result["validation"]["palette_indices_valid"])
            self.assertTrue(result["validation"]["preview_occupancy_matches"])
            self.assertEqual(result["validation"]["tile_count"], 4)
            self.assertTrue(archive_path.is_file())
            with tarfile.open(archive_path, "r:gz") as archive:
                names = archive.getnames()
                self.assertTrue(any(name.endswith("_preview_white.png") for name in names))
                self.assertTrue(any("/tiles/" in name for name in names))
                self.assertTrue(any(name.endswith("/masters/test_badge_master.png") for name in names))
                for name in names:
                    path = PurePosixPath(name)
                    self.assertFalse(path.is_absolute())
                    self.assertNotIn("..", path.parts)

    def test_export_rejects_empty_pattern(self) -> None:
        value = snapshot()
        value["cells"] = [EMPTY_CELL] * (8 * 7)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot_path = root / "snapshot.json"
            snapshot_path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "empty pattern"):
                export_package(snapshot_path, root / "delivery.tar.gz", root / "work", lambda *_: None)


if __name__ == "__main__":
    unittest.main()
