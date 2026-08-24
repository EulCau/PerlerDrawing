from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from perlerdrawing_sidecar.protocol import PROTOCOL_VERSION, serve


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def palette() -> list[dict[str, object]]:
    data = json.loads((REPOSITORY_ROOT / "palettes/mard_221_v1.json").read_text(encoding="utf-8"))
    for color in data["colors"]:
        value = color["hex"].lstrip("#")
        color["rgb"] = [int(value[offset : offset + 2], 16) for offset in (0, 2, 4)]
    return data["colors"]


class ProtocolTests(unittest.TestCase):
    def test_unknown_protocol_is_a_structured_error(self) -> None:
        source = io.StringIO(json.dumps({"protocol_version": 99, "job_id": "job-1", "operation": "unknown", "payload": {}}) + "\n")
        target = io.StringIO()
        self.assertEqual(serve(source, target), 0)
        event = json.loads(target.getvalue())
        self.assertEqual(event["type"], "error")
        self.assertEqual(event["code"], "unsupported_protocol")
        self.assertEqual(event["job_id"], "job-1")
        self.assertEqual(event["protocol_version"], PROTOCOL_VERSION)

    def test_image_request_streams_progress_and_a_result(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image = Image.new("RGB", (72, 60), "white")
            ImageDraw.Draw(image).rectangle((16, 10, 58, 52), fill="#2866b7")
            input_path = root / "source.png"
            image.save(input_path)
            request = {
                "protocol_version": PROTOCOL_VERSION,
                "job_id": "image-job",
                "operation": "convert_image",
                "payload": {
                    "input_path": str(input_path),
                    "output_dir": str(root / "output"),
                    "settings": {
                        "columns": 20,
                        "rows": 20,
                        "color_count": 6,
                        "alpha_threshold": 0.28,
                        "background_mode": "auto",
                        "background_tolerance": 18.0,
                        "wavelet_strength": 0.55,
                        "seed": 8,
                        "remove_tiny_components": True,
                        "symmetry": "none",
                    },
                    "palette": palette(),
                },
            }
            target = io.StringIO()
            self.assertEqual(serve(io.StringIO(json.dumps(request) + "\n"), target), 0)
            events = [json.loads(line) for line in target.getvalue().splitlines()]
            self.assertEqual(events[-1]["type"], "result")
            progress = [event["progress"] for event in events if event["type"] == "progress"]
            self.assertEqual(progress, sorted(progress))
            self.assertEqual(progress[-1], 1.0)
            self.assertTrue((root / "output" / "master.png").is_file())


if __name__ == "__main__":
    unittest.main()
