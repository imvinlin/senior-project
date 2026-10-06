import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import polars as pl
from numpy.typing import NDArray

from cancerlike.server import FACET_COLUMNS, METADATA

EXPRESSION = Path("data/raw/Paipu_deduplicated_expression.tsv")
DERIVED = Path("data/derived")
COMPONENTS = 5
SOURCE_DOI = "10.5281/zenodo.19904328"


def md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def run() -> None:
    samples = pl.read_csv(METADATA, separator="\t", infer_schema_length=0, null_values=["NA"])
    bulk = samples.filter(pl.col(FACET_COLUMNS["assay"]) == "bulk")["run_accession"].to_list()
    expression = pl.read_csv(EXPRESSION, separator="\t", columns=["Genes", *bulk])
    matrix = expression.select(bulk).to_numpy().T
    coords, loadings, ratio = pca(matrix, COMPONENTS)

    DERIVED.mkdir(parents=True, exist_ok=True)
    columns = {f"pc{i + 1}": coords[:, i].astype(np.float32) for i in range(COMPONENTS)}
    pl.DataFrame({"run_accession": bulk, **columns}).write_parquet(DERIVED / "pca.parquet")
    weights = {f"pc{i + 1}": loadings[:, i].astype(np.float32) for i in range(COMPONENTS)}
    genes = expression["Genes"].to_list()
    pl.DataFrame({"gene": genes, **weights}).write_parquet(DERIVED / "loadings.parquet")
    manifest = {
        "source": {
            "doi": SOURCE_DOI,
            "metadata_md5": md5(METADATA),
            "expression_md5": md5(EXPRESSION),
        },
        "pca": {
            "fit_on": "bulk samples only",
            "samples": len(bulk),
            "genes": matrix.shape[1],
            "centered_per_gene": True,
            "scaled": False,
            "explained_variance_ratio": [round(float(r), 4) for r in ratio],
        },
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    (DERIVED / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {DERIVED}/pca.parquet ({len(bulk)} samples), loadings.parquet, manifest.json")
