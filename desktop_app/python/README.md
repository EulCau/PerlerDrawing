# PerlerDrawing image sidecar

The sidecar accepts versioned JSON Lines requests on stdin and writes progress,
result, and structured error events to stdout. Large images and generated files
are exchanged through the per-job directory instead of being embedded in JSON.

The core processor only requires NumPy and Pillow. Background removal uses a
border-constrained CIE Lab matte and does not download or upload anything. The
high-resolution master is simplified with a two-level Haar wavelet transform,
then clustered in Lab before premultiplied-alpha rasterization and MARD mapping.

For development, run it from `desktop_app/python`:

```bash
python sidecar.py
```
