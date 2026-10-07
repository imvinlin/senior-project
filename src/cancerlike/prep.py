import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import polars as pl

from cancerlike.pca import pca
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
    np.save(DERIVED / "expression.npy", matrix.T.astype(np.float32))
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
    print(f"wrote {DERIVED}: pca.parquet ({len(bulk)} samples), loadings, expression, manifest")
