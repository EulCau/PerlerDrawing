#!/usr/bin/env python3
"""Thin executable entry point for the PerlerDrawing JSON Lines sidecar."""

from perlerdrawing_sidecar.protocol import serve


if __name__ == "__main__":
    raise SystemExit(serve())
