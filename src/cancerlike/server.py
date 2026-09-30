from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import polars as pl
from fastapi import FastAPI, Query
from pydantic import BaseModel, ConfigDict

METADATA = Path("data/raw/Paipu_deduplicated_metadata.tsv")
SAMPLES: pl.DataFrame
FACET_COLUMNS = {
    "species": "organism_scientific_name",
    "cancer": "paipu_cancer_type_final",
    "system": "paipu_cancer_system",
    "tissue": "paipu_tissue_final",
    "sex": "paipu_sex_final",
    "assay": "single_bulk",
    "clade": "clade",
}
SEX_LABEL_CONFIDENCE = "paipu_sex_confidence"


class CohortFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    species: list[str] = []
    cancer: list[str] = []
    system: list[str] = []
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


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global SAMPLES
    SAMPLES = pl.read_csv(
        METADATA,
        separator="\t",
        infer_schema_length=0,
        null_values=["NA"],
    )
    yield


app = FastAPI(
    title="CancerLike", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan
)


def matching(filters: CohortFilter, skip: str | None = None) -> pl.Series:
    keep = pl.repeat(True, SAMPLES.height, eager=True)
    for field, values in filters.model_dump().items():
        if values and field != skip:
            keep = keep & SAMPLES[FACET_COLUMNS[field]].is_in(values)
    return keep


def tally(column: str, keep: pl.Series) -> dict[str, int]:
    counts = SAMPLES[column].filter(keep).drop_nulls().value_counts(sort=True)
    return dict(zip(counts[column], counts["count"], strict=True))


def facet_counts(filters: CohortFilter) -> dict[str, dict[str, int]]:
    return {
        field: tally(column, matching(filters, skip=field))
        for field, column in FACET_COLUMNS.items()
    }


def by_size(cells: pl.DataFrame, axis: str) -> list[str]:
    totals = cells.group_by(axis).agg(pl.col("atlas").sum())
    return totals.sort("atlas", axis, descending=[True, False])[axis].to_list()


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
