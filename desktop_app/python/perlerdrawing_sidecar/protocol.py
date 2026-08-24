"""Versioned JSON Lines protocol for the image-processing sidecar."""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import IO, Any

from .exporter import export_board_pdf, export_package
from .imaging import ConversionSettings, convert_image

PROTOCOL_VERSION = 1


class ProtocolError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _emit(stream: IO[str], payload: dict[str, object]) -> None:
    stream.write(json.dumps(payload, ensure_ascii=True, separators=(",", ":")) + "\n")
    stream.flush()


def _read_path(payload: dict[str, Any], key: str) -> Path:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ProtocolError("invalid_request", f"{key} must be a non-empty path string.")
    return Path(value)


def _read_optional_path(payload: dict[str, Any], key: str) -> Path | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise ProtocolError("invalid_request", f"{key} must be null or a non-empty path string.")
    return Path(value)


def handle_request(request: dict[str, Any], output: IO[str]) -> None:
    version = request.get("protocol_version")
    job_id = request.get("job_id")
    operation = request.get("operation")
    payload = request.get("payload")
    if version != PROTOCOL_VERSION:
        raise ProtocolError("unsupported_protocol", f"Expected protocol version {PROTOCOL_VERSION}.")
    if not isinstance(job_id, str) or not job_id or len(job_id) > 80:
        raise ProtocolError("invalid_request", "job_id must be a non-empty string of at most 80 characters.")
    if not isinstance(payload, dict):
        raise ProtocolError("invalid_request", "payload must be an object.")

    def progress(stage: str, value: float, message_key: str) -> None:
        _emit(
            output,
            {
                "protocol_version": PROTOCOL_VERSION,
                "type": "progress",
                "job_id": job_id,
                "stage": stage,
                "progress": max(0.0, min(1.0, value)),
                "message_key": message_key,
            },
        )

    if operation == "convert_image":
        settings_data = payload.get("settings")
        palette = payload.get("palette")
        if not isinstance(settings_data, dict) or not isinstance(palette, list):
            raise ProtocolError("invalid_request", "Image conversion requires settings and a palette.")
        settings = ConversionSettings(**settings_data)
        result = convert_image(
            _read_path(payload, "input_path"),
            _read_path(payload, "output_dir"),
            settings,
            palette,
            progress,
        )
    elif operation == "export_package":
        result = export_package(
            _read_path(payload, "snapshot_path"),
            _read_path(payload, "archive_path"),
            _read_path(payload, "working_dir"),
            progress,
            _read_optional_path(payload, "master_path"),
        )
    elif operation == "export_board_pdf":
        result = export_board_pdf(
            _read_path(payload, "snapshot_path"),
            _read_path(payload, "pdf_path"),
            progress,
        )
    else:
        raise ProtocolError("unsupported_operation", f"Unsupported operation: {operation}")
    _emit(
        output,
        {
            "protocol_version": PROTOCOL_VERSION,
            "type": "result",
            "job_id": job_id,
            "result": result,
        },
    )


def serve(input_stream: IO[str] = sys.stdin, output: IO[str] = sys.stdout) -> int:
    for line in input_stream:
        if not line.strip():
            continue
        job_id: object = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ProtocolError("invalid_request", "Each JSON Lines request must be an object.")
            job_id = request.get("job_id")
            handle_request(request, output)
        except Exception as error:  # The protocol must convert all worker failures to structured errors.
            code = error.code if isinstance(error, ProtocolError) else "processing_failed"
            _emit(
                output,
                {
                    "protocol_version": PROTOCOL_VERSION,
                    "type": "error",
                    "job_id": job_id,
                    "code": code,
                    "message": str(error),
                    "debug": traceback.format_exc(limit=4) if __debug__ else None,
                },
            )
    return 0
