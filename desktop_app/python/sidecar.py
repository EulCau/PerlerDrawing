#!/usr/bin/env python3
"""Thin executable entry point for the PerlerDrawing JSON Lines sidecar."""

import argparse

from perlerdrawing_sidecar.protocol import serve


def main() -> int:
    parser = argparse.ArgumentParser(description="PerlerDrawing image-processing sidecar")
    parser.add_argument(
        "--request-file",
        help="Read one or more JSON Lines requests from this UTF-8 file instead of stdin.",
    )
    arguments = parser.parse_args()
    if arguments.request_file:
        with open(arguments.request_file, encoding="utf-8") as request_stream:
            return serve(request_stream)
    return serve()


if __name__ == "__main__":
    raise SystemExit(main())
