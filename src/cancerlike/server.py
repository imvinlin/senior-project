from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import polars as pl
from fastapi import FastAPI

METADATA = Path("data/raw/Paipu_deduplicated_metadata.tsv")
SAMPLES: pl.DataFrame

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global SAMPLES
    SAMPLES = pl.read_csv(
        METADATA,
        separator="\t",
        infer_schema_length=0,
        null_values["NA"],
    )
    yield

app = FastAPI(
    title="CancerLike",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)


@app.get("/api/health")
def health() -> dict[str, int | bool]:
    return {"ok": True, "samples": SAMPLES.height}
