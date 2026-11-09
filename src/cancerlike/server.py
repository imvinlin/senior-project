import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
import polars as pl
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict

from cancerlike.pca import pca as decompose

DATA_DIR = Path(
    os.environ.get("CANCERLIKE_DATA_DIR", str(Path(__file__).resolve().parents[2] / "data"))
)
METADATA = DATA_DIR / "raw/Paipu_deduplicated_metadata.tsv"
DERIVED = DATA_DIR / "derived"
SAMPLES: pl.DataFrame
POINTS: pl.DataFrame | None = None
VARIANCE: list[float] = []
EXTENT: dict[str, list[float]] = {}
TOP: dict[str, list[str]] = {}
LOADINGS: dict[str, dict[str, list["GeneWeight"]]] = {}
GENES: list[str] = []
GENE_INDEX: dict[str, int] = {}
EXPRESSION: NDArray[np.float32] | None = None
COLUMN: dict[str, int] = {}
MIN_FIT = 10
PCS = ["pc1", "pc2", "pc3", "pc4", "pc5"]
FACET_COLUMNS = {
    "species": "organism_scientific_name",
    "system": "paipu_cancer_system",
    "cancer": "paipu_cancer_type_final",
    "subtype": "paipu_cancer_type",
    "tissue": "paipu_tissue_final",
    "sex": "paipu_sex_final",
    "assay": "single_bulk",
    "clade": "clade",
}
SEX_LABEL_CONFIDENCE = "paipu_sex_confidence"


class CohortFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    species: list[str] = []
    system: list[str] = []
    cancer: list[str] = []
    subtype: list[str] = []
    tissue: list[str] = []
    sex: list[str] = []
    assay: list[str] = []
    clade: list[str] = []


class CohortSummary(BaseModel):
    n: int
    facets: dict[str, dict[str, int]]
    sex_label_confidence: dict[str, int]


class CoverageCell(BaseModel):
    species: str
    cancer: str
    n: int
    atlas: int


class Coverage(BaseModel):
    species: list[str]
    cancers: list[str]
    cells: list[CoverageCell]


class PcaPoint(BaseModel):
    run_accession: str
    species: str
    system: str
    cancer: str
    subtype: str
    tissue: str
    sex: str
    assay: str
    clade: str
    study: str
    pc1: float
    pc2: float
    pc3: float
    pc4: float
    pc5: float


class GeneWeight(BaseModel):
    gene: str
    weight: float


class PcaView(BaseModel):
    points: list[PcaPoint]
    variance: list[float]
    extent: dict[str, list[float]]
    top: dict[str, list[str]]
    excluded: int
    fit: str
    loadings: dict[str, dict[str, list[GeneWeight]]] | None = None


class GenePoint(BaseModel):
    run_accession: str
    species: str
    system: str
    cancer: str
    subtype: str
    tissue: str
    sex: str
    assay: str
    clade: str
    study: str
    x: float
    y: float


class GeneExpressionView(BaseModel):
    points: list[GenePoint]
    top: dict[str, list[str]]
    excluded: int
    total: int
    scope: str
    gene1: str
    gene2: str


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global SAMPLES, POINTS, VARIANCE, EXTENT, TOP, LOADINGS, GENES, GENE_INDEX
    global EXPRESSION, COLUMN
    SAMPLES = pl.read_csv(
        METADATA,
        separator="\t",
        infer_schema_length=0,
        null_values=["NA"],
    )
    if (DERIVED / "pca.parquet").exists():
        POINTS = SAMPLES.select("run_accession", study="bioproject", **FACET_COLUMNS).join(
            pl.read_parquet(DERIVED / "pca.parquet"), on="run_accession", how="left"
        )
        manifest = json.loads((DERIVED / "manifest.json").read_text())
        VARIANCE = manifest["pca"]["explained_variance_ratio"]
        placed = POINTS.drop_nulls("pc1")
        low = placed.select(pl.col(PCS).min()).row(0)
        high = placed.select(pl.col(PCS).max()).row(0)
        EXTENT = {pc: [round(a, 2), round(b, 2)] for pc, a, b in zip(PCS, low, high, strict=True)}
        TOP = {facet: leading(placed, facet) for facet in FACET_COLUMNS}
        weights = pl.read_parquet(DERIVED / "loadings.parquet")
        LOADINGS = {pc: extremes(weights, pc) for pc in PCS}
        GENES = weights["gene"].to_list()
        GENE_INDEX = {gene: index for index, gene in enumerate(GENES)}
    if (DERIVED / "expression.npy").exists():
        EXPRESSION = np.load(DERIVED / "expression.npy", mmap_mode="r")
        ids = pl.read_parquet(DERIVED / "pca.parquet")["run_accession"]
        COLUMN = {sample: i for i, sample in enumerate(ids)}
    yield


app = FastAPI(
    title="CancerLike", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan
)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=1)


def matching(filters: CohortFilter, skip: str | None = None) -> pl.Series:
    keep = pl.repeat(True, SAMPLES.height, eager=True)
    for field, values in filters.model_dump().items():
        if values and field != skip:
            keep = keep & SAMPLES[FACET_COLUMNS[field]].is_in(values)
    return keep


def tally(column: str, keep: pl.Series) -> dict[str, int]:
    counts = SAMPLES[column].filter(keep).drop_nulls().value_counts()
    counts = counts.sort("count", column, descending=[True, False])
    return dict(zip(counts[column], counts["count"], strict=True))


def facet_counts(filters: CohortFilter) -> dict[str, dict[str, int]]:
    return {
        field: tally(column, matching(filters, skip=field))
        for field, column in FACET_COLUMNS.items()
    }


def by_size(cells: pl.DataFrame, axis: str) -> list[str]:
    totals = cells.group_by(axis).agg(pl.col("atlas").sum())
    return totals.sort("atlas", axis, descending=[True, False])[axis].to_list()


def leading(placed: pl.DataFrame, facet: str) -> list[str]:
    counts = placed[facet].value_counts().sort("count", facet, descending=[True, False])
    return counts[facet].head(3).to_list()


def extremes(loadings: pl.DataFrame, pc: str, n: int = 20) -> dict[str, list[GeneWeight]]:
    ranked = loadings.select("gene", weight=pl.col(pc).cast(pl.Float64).round(4)).sort("weight")
    return {
        "high": [GeneWeight(**row) for row in ranked.tail(n).reverse().to_dicts()],
        "low": [GeneWeight(**row) for row in ranked.head(n).to_dicts()],
    }


@app.get("/api/health")
def health() -> dict[str, int | bool]:
    return {"ok": True, "samples": SAMPLES.height}


@app.get("/api/cohort")
def cohort(filters: Annotated[CohortFilter, Query()]) -> CohortSummary:
    keep = matching(filters)
    return CohortSummary(
        n=int(keep.sum()),
        facets=facet_counts(filters),
        sex_label_confidence=tally(SEX_LABEL_CONFIDENCE, keep),
    )


@app.get("/api/coverage")
def coverage(filters: Annotated[CohortFilter, Query()]) -> Coverage:
    keep = matching(filters.model_copy(update={"species": [], "cancer": []}))
    axes = {name: SAMPLES[FACET_COLUMNS[name]] for name in ("species", "cancer")}
    cells = (
        pl.DataFrame({**axes, "keep": keep})
        .group_by("species", "cancer")
        .agg(n=pl.col("keep").sum(), atlas=pl.len())
        .sort("species", "cancer")
    )
    return Coverage(
        species=by_size(cells, "species"),
        cancers=by_size(cells, "cancer"),
        cells=[CoverageCell(**cell) for cell in cells.to_dicts()],
    )


@app.get("/api/pca")
def pca(filters: Annotated[CohortFilter, Query()]) -> PcaView:
    if POINTS is None:
        raise HTTPException(status_code=503, detail="no pca coordinates, run make prep first")
    rows = POINTS.filter(matching(filters))
    placed = rows.drop_nulls("pc1")
    fields = list(PcaPoint.model_fields)
    rounded = placed.select(fields).with_columns(pl.col(PCS).cast(pl.Float64).round(2))
    return PcaView(
        points=[PcaPoint(**point) for point in rounded.to_dicts()],
        variance=VARIANCE,
        extent=EXTENT,
        top=TOP,
        excluded=rows.height - placed.height,
        fit="global",
    )


@app.get("/api/pca/cohort")
def pca_cohort(filters: Annotated[CohortFilter, Query()]) -> PcaView:
    if EXPRESSION is None or POINTS is None:
        raise HTTPException(status_code=503, detail="no expression matrix, run make prep first")
    rows = POINTS.filter(matching(filters))
    placed = rows.drop_nulls("pc1")
    if placed.height < MIN_FIT:
        raise HTTPException(
            status_code=422,
            detail=f"{placed.height} bulk samples is too few to decompose, {MIN_FIT} needed",
        )
    matrix = EXPRESSION[:, [COLUMN[s] for s in placed["run_accession"]]].T.astype(np.float64)
    coords, weights, ratio = decompose(matrix, len(PCS))
    refit = placed.with_columns(
        **{pc: pl.Series(coords[:, i]).round(2) for i, pc in enumerate(PCS)}
    )
    loadings = pl.DataFrame({"gene": GENES, **{pc: weights[:, i] for i, pc in enumerate(PCS)}})
    return PcaView(
        points=[
            PcaPoint(**point) for point in refit.select(list(PcaPoint.model_fields)).to_dicts()
        ],
        variance=[round(float(r), 4) for r in ratio],
        extent={
            pc: [round(float(coords[:, i].min()), 2), round(float(coords[:, i].max()), 2)]
            for i, pc in enumerate(PCS)
        },
        top=TOP,
        excluded=rows.height - placed.height,
        fit="cohort",
        loadings={pc: extremes(loadings, pc) for pc in PCS},
    )


@app.get("/api/loadings")
def loadings() -> dict[str, dict[str, list[GeneWeight]]]:
    if not LOADINGS:
        raise HTTPException(status_code=503, detail="no loadings, run make prep first")
    return LOADINGS


@app.get("/api/genes")
def search_genes(q: str = "", limit: int = 50) -> list[str]:
    if EXPRESSION is None:
        raise HTTPException(status_code=503, detail="no expression matrix, run make prep first")
    query = q.casefold().strip()
    matches = [gene for gene in GENES if query in gene.casefold()]
    return matches[: max(1, min(limit, 50))]


@app.get("/api/genes/expression")
def gene_expression(
    gene1: str,
    gene2: str,
    scope: Literal["global", "cohort"] = "global",
    species: Annotated[list[str] | None, Query()] = None,
    system: Annotated[list[str] | None, Query()] = None,
    cancer: Annotated[list[str] | None, Query()] = None,
    subtype: Annotated[list[str] | None, Query()] = None,
    tissue: Annotated[list[str] | None, Query()] = None,
    sex: Annotated[list[str] | None, Query()] = None,
    assay: Annotated[list[str] | None, Query()] = None,
    clade: Annotated[list[str] | None, Query()] = None,
) -> GeneExpressionView:
    if EXPRESSION is None:
        raise HTTPException(status_code=503, detail="no expression matrix, run make prep first")
    if gene1 not in GENE_INDEX or gene2 not in GENE_INDEX:
        raise HTTPException(status_code=404, detail="gene not found")
    filters = CohortFilter(
        species=species or [], system=system or [], cancer=cancer or [], subtype=subtype or [],
        tissue=tissue or [], sex=sex or [], assay=assay or [], clade=clade or [],
    )
    return expression_view(gene1, gene2, scope, filters)


def expression_view(
    gene1: str, gene2: str, scope: str, filters: CohortFilter
) -> GeneExpressionView:
    selected = SAMPLES.filter(matching(filters) if scope == "cohort" else pl.lit(True))
    bulk = selected.filter(pl.col("run_accession").is_in(COLUMN))
    samples = bulk.select("run_accession", "bioproject", *FACET_COLUMNS.values()).to_dicts()
    x_index, y_index = GENE_INDEX[gene1], GENE_INDEX[gene2]
    points = [
        GenePoint(
            run_accession=row["run_accession"],
            study=row["bioproject"],
            **{facet: row[column] for facet, column in FACET_COLUMNS.items()},
            x=float(EXPRESSION[x_index, COLUMN[row["run_accession"]]]),
            y=float(EXPRESSION[y_index, COLUMN[row["run_accession"]]]),
        )
        for row in samples
    ]
    return GeneExpressionView(
        points=points,
        top=top_facets(bulk),
        excluded=selected.height - bulk.height,
        total=selected.height,
        scope=scope,
        gene1=gene1,
        gene2=gene2,
    )


def top_facets(bulk: pl.DataFrame) -> dict[str, list[str]]:
    top: dict[str, list[str]] = {}
    for facet, column in FACET_COLUMNS.items():
        counts = bulk[column].drop_nulls().value_counts()
        counts = counts.sort("count", column, descending=[True, False])
        top[facet] = counts[column].head(3).to_list()
    return top
