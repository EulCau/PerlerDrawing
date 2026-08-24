from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from perlerdrawing_sidecar.color import deterministic_kmeans
from perlerdrawing_sidecar.imaging import (
    ConversionSettings,
    convert_image,
    remove_background,
    wavelet_structure_simplify,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def palette() -> list[dict[str, object]]:
    data = json.loads((REPOSITORY_ROOT / "palettes/mard_221_v1.json").read_text(encoding="utf-8"))
    for color in data["colors"]:
        value = color["hex"].lstrip("#")
        color["rgb"] = [int(value[offset : offset + 2], 16) for offset in (0, 2, 4)]
    return data["colors"]


class ImagingTests(unittest.TestCase):
    def test_kmeans_is_deterministic(self) -> None:
        values = np.array([[0.0, 0.0], [0.1, 0.0], [9.9, 10.0], [10.0, 10.1]])
        first_centers, first_labels = deterministic_kmeans(values, 2, 42)
        second_centers, second_labels = deterministic_kmeans(values, 2, 42)
        np.testing.assert_allclose(first_centers, second_centers)
        np.testing.assert_array_equal(first_labels, second_labels)

    def test_background_removal_is_edge_connected(self) -> None:
        image = np.full((80, 100, 4), 255, dtype=np.uint8)
        image[18:68, 22:78, :3] = [210, 52, 65]
        image[18:68, 22:78, 3] = 255
        # Interior white hole must remain transparent only because it is already
        # enclosed by the subject, not because it shares the border color.
        image[36:50, 43:57, :3] = [255, 255, 255]
        alpha, metadata = remove_background(image, tolerance=16.0, seed=9)
        self.assertLess(float(alpha[2, 2]), 0.05)
        self.assertGreater(float(alpha[26, 30]), 0.95)
        self.assertGreater(float(alpha[42, 50]), 0.9)
        self.assertEqual(metadata["method"], "border_lab_connected_matte")

    def test_background_model_does_not_accept_a_foreground_edge_cluster(self) -> None:
        image = np.full((90, 120, 4), 255, dtype=np.uint8)
        image[:, :, :3] = [238, 236, 229]
        image[14:78, 0:82, :3] = [42, 103, 185]
        alpha, _ = remove_background(image, tolerance=17.0, seed=5)
        self.assertLess(float(alpha[2, 110]), 0.05)
        self.assertGreater(float(alpha[40, 10]), 0.9)

    def test_wavelet_reduces_texture_but_preserves_edge(self) -> None:
        rng = np.random.default_rng(4)
        base = np.zeros((96, 96, 3), dtype=np.float32)
        base[:, :48] = 45
        base[:, 48:] = 210
        noisy = np.clip(base + rng.normal(0, 13, base.shape), 0, 255).astype(np.uint8)
        alpha = np.ones((96, 96), dtype=np.float32)
        simplified, metadata = wavelet_structure_simplify(noisy, alpha, 0.85)
        self.assertLess(float(np.std(simplified[10:80, 10:38])), float(np.std(noisy[10:80, 10:38])))
        contrast = float(np.mean(simplified[:, 54:64]) - np.mean(simplified[:, 32:42]))
        self.assertGreater(contrast, 130.0)
        self.assertEqual(metadata["method"], "haar_soft_threshold_edge_blend")

    def test_conversion_writes_master_and_deterministic_pattern(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = Image.new("RGB", (180, 120), "#f4eee3")
            draw = ImageDraw.Draw(source)
            draw.ellipse((28, 12, 152, 112), fill="#d7494f")
            draw.polygon([(90, 18), (125, 95), (55, 95)], fill="#edc65f")
            input_path = root / "source.png"
            source.save(input_path)
            settings = ConversionSettings(columns=29, rows=29, color_count=8, seed=112)
            first = convert_image(input_path, root / "first", settings, palette(), lambda *_: None)
            second = convert_image(input_path, root / "second", settings, palette(), lambda *_: None)
            first_document = first["result"]["document"]
            second_document = second["result"]["document"]
            self.assertEqual(first_document["cells"], second_document["cells"])
            self.assertLessEqual(first_document["columns"], 29)
            self.assertLessEqual(first_document["rows"], 29)
            self.assertTrue((root / "first" / "master.png").is_file())
            master = Image.open(root / "first" / "master.png").convert("RGBA")
            self.assertEqual(master.getpixel((0, 0))[3], 0)
            self.assertGreater(first["result"]["metadata"]["bead_count"], 0)


if __name__ == "__main__":
    unittest.main()
