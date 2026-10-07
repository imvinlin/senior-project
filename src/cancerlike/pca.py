import numpy as np
from numpy.typing import NDArray

Arrays = tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]


def pca(matrix: NDArray[np.float64], k: int) -> Arrays:
    # used sample space gram matrix because 3,484 (sample) vs ~20k (feature)
    centered = matrix - matrix.mean(axis=0)
    values, vectors = np.linalg.eigh(centered @ centered.T)
    values = values.clip(min=0)
    order = np.argsort(values)[::-1][:k]
    scale = np.sqrt(values[order])
    coords = vectors[:, order] * scale
    signs = np.sign(coords[np.abs(coords).argmax(axis=0), np.arange(k)])
    loadings = centered.T @ vectors[:, order] / scale
    return coords * signs, loadings * signs, values[order] / values.sum()
