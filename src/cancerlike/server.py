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


def select(filters: CohortFilter) -> pl.DataFrame:
    rows = SAMPLES
    for field, values in filters.model_dump().items():
        if values:
            rows = rows.filter(pl.col(FACET_COLUMNS[field]).is_in(values))
    return rows


def tally(rows: pl.DataFrame, column: str) -> dict[str, int]:
    counts = rows[column].drop_nulls().value_counts(sort=True)
    return dict(zip(counts[column], counts["count"], strict=True))


def facet_counts(rows: pl.DataFrame) -> dict[str, dict[str, int]]:
    return {field: tally(rows, column) for field, column in FACET_COLUMNS.items()}


@app.get("/api/health")
def health() -> dict[str, int | bool]:
    return {"ok": True, "samples": SAMPLES.height}


@app.get("/api/cohort")
def cohort(filters: Annotated[CohortFilter, Query()]) -> CohortSummary:
    rows = select(filters)
    return CohortSummary(
        n=rows.height,
        facets=facet_counts(rows),
        sex_label_confidence=tally(rows, SEX_LABEL_CONFIDENCE),
    )
