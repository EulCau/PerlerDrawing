"""Color conversion, deterministic clustering, and fixed-palette mapping."""

from __future__ import annotations

import numpy as np


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Convert uint8 or floating-point sRGB values to CIE Lab using D65."""
    values = np.asarray(rgb, dtype=np.float64)
    if values.size and float(np.nanmax(values)) > 1.0:
        values /= 255.0
    linear = np.where(
        values <= 0.04045,
        values / 12.92,
        ((values + 0.055) / 1.055) ** 2.4,
    )
    xyz = linear @ np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    ).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    delta = 6.0 / 29.0
    transformed = np.where(
        xyz > delta**3,
        np.cbrt(xyz),
        xyz / (3.0 * delta**2) + 4.0 / 29.0,
    )
    return np.stack(
        [
            116.0 * transformed[..., 1] - 16.0,
            500.0 * (transformed[..., 0] - transformed[..., 1]),
            200.0 * (transformed[..., 1] - transformed[..., 2]),
        ],
        axis=-1,
    )


def lab_to_srgb(lab: np.ndarray) -> np.ndarray:
    values = np.asarray(lab, dtype=np.float64)
    fy = (values[..., 0] + 16.0) / 116.0
    fx = fy + values[..., 1] / 500.0
    fz = fy - values[..., 2] / 200.0
    delta = 6.0 / 29.0
    transformed = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(
        transformed > delta,
        transformed**3,
        3.0 * delta**2 * (transformed - 4.0 / 29.0),
    )
    xyz *= np.array([0.95047, 1.0, 1.08883])
    linear = xyz @ np.array(
        [
            [3.2404542, -1.5371385, -0.4985314],
            [-0.9692660, 1.8760108, 0.0415560],
            [0.0556434, -0.2040259, 1.0572252],
        ]
    ).T
    srgb = np.where(
        linear <= 0.0031308,
        12.92 * linear,
        1.055 * np.maximum(linear, 0.0) ** (1.0 / 2.4) - 0.055,
    )
    return np.clip(np.rint(srgb * 255.0), 0, 255).astype(np.uint8)


def _kmeans_plus_plus(values: np.ndarray, count: int, rng: np.random.Generator) -> np.ndarray:
    centers = np.empty((count, values.shape[1]), dtype=np.float64)
    centers[0] = values[int(rng.integers(0, len(values)))]
    closest = np.sum((values - centers[0]) ** 2, axis=1)
    for index in range(1, count):
        total = float(np.sum(closest))
        if total <= 1e-12:
            centers[index:] = values[rng.integers(0, len(values), size=count - index)]
            break
        selected = int(rng.choice(len(values), p=closest / total))
        centers[index] = values[selected]
        closest = np.minimum(closest, np.sum((values - centers[index]) ** 2, axis=1))
    return centers


def deterministic_kmeans(
    values: np.ndarray,
    count: int,
    seed: int,
    *,
    iterations: int = 40,
) -> tuple[np.ndarray, np.ndarray]:
    """Run deterministic k-means++ without depending on scikit-learn."""
    data = np.asarray(values, dtype=np.float64)
    if data.ndim != 2 or data.shape[0] == 0:
        raise ValueError("Clustering requires a non-empty two-dimensional array.")
    unique = np.unique(np.round(data, decimals=6), axis=0)
    count = max(1, min(int(count), len(unique)))
    rng = np.random.default_rng(seed)
    centers = _kmeans_plus_plus(data, count, rng)
    labels = np.zeros(len(data), dtype=np.int32)
    for _ in range(iterations):
        distances = np.sum((data[:, None, :] - centers[None, :, :]) ** 2, axis=2)
        updated_labels = np.argmin(distances, axis=1).astype(np.int32)
        updated = centers.copy()
        for index in range(count):
            members = data[updated_labels == index]
            if len(members):
                updated[index] = members.mean(axis=0)
            else:
                farthest = int(np.argmax(np.min(distances, axis=1)))
                updated[index] = data[farthest]
        labels = updated_labels
        if np.allclose(updated, centers, atol=1e-5):
            centers = updated
            break
        centers = updated
    return centers, labels


def compact_palette_subset(
    occupied_rgb: np.ndarray,
    palette_rgb: np.ndarray,
    color_count: int,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Cluster observed colors, then reserve unique nearest real palette colors."""
    observed_lab = srgb_to_lab(occupied_rgb)
    reference_lab = srgb_to_lab(palette_rgb)
    cluster_count = min(color_count, len(observed_lab), len(reference_lab))
    centers, labels = deterministic_kmeans(observed_lab, cluster_count, seed)
    weights = np.bincount(labels, minlength=len(centers))
    distances = np.sum((centers[:, None, :] - reference_lab[None, :, :]) ** 2, axis=2)
    chosen: list[int] = []
    used: set[int] = set()
    for cluster in np.argsort(weights)[::-1]:
        for reference_index in np.argsort(distances[int(cluster)]):
            candidate = int(reference_index)
            if candidate not in used:
                chosen.append(candidate)
                used.add(candidate)
                break
    chosen_array = np.array(sorted(chosen), dtype=np.int32)
    selected_lab = reference_lab[chosen_array]
    cell_labels = np.argmin(
        np.sum((observed_lab[:, None, :] - selected_lab[None, :, :]) ** 2, axis=2),
        axis=1,
    )
    return chosen_array, cell_labels.astype(np.int32)
