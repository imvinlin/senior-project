import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import polars as pl
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, ConfigDict

METADATA = Path("data/raw/Paipu_deduplicated_metadata.tsv")
DERIVED = Path("data/derived")
SAMPLES: pl.DataFrame
POINTS: pl.DataFrame | None = None
VARIANCE: list[float] = []
EXTENT: dict[str, list[float]] = {}
TOP: dict[str, list[str]] = {}
LOADINGS: dict[str, dict[str, list["GeneWeight"]]] = {}
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


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global SAMPLES, POINTS, VARIANCE, EXTENT, TOP, LOADINGS
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
        LOADINGS = {pc: extremes(pl.read_parquet(DERIVED / "loadings.parquet"), pc) for pc in PCS}
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
    )


@app.get("/api/loadings")
def loadings() -> dict[str, dict[str, list[GeneWeight]]]:
    if not LOADINGS:
        raise HTTPException(status_code=503, detail="no loadings, run make prep first")
    return LOADINGS
