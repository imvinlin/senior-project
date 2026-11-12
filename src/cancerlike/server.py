import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
import polars as pl
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
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
SINGLE_CELL_EXPRESSION: NDArray[np.float32] | None = None
SINGLE_CELL_COLUMN: dict[str, int] = {}
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
    assay: Literal["bulk", "single-cell"] = "bulk"
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


class DifferentialExpressionRequest(BaseModel):
    assay: Literal["bulk", "single-cell"] = "bulk"
    cohort1: CohortFilter
    cohort2: CohortFilter
    top_genes: int = 50


class DifferentialExpressionResponse(BaseModel):
    cohort1_n: int
    cohort2_n: int
    genes: list[dict[str, str | float | None]]
    heatmap_genes: list[str]
    heatmap_samples: list[str]
    heatmap_values: list[list[float | None]]
    heatmap_groups: list[str]
    all_heatmap_samples: list[str]
    all_heatmap_values: list[list[float | None]]
    all_heatmap_groups: list[str]
    pca: list[dict[str, str | float]]
    pca_variance: list[float]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global SAMPLES, POINTS, VARIANCE, EXTENT, TOP, LOADINGS, GENES, GENE_INDEX
    global EXPRESSION, COLUMN, SINGLE_CELL_EXPRESSION, SINGLE_CELL_COLUMN
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
    if (DERIVED / "single_cell_expression.npy").exists():
        SINGLE_CELL_EXPRESSION = np.load(
            DERIVED / "single_cell_expression.npy", mmap_mode="r"
        )
        ids = pl.read_parquet(DERIVED / "single_cell_samples.parquet")["run_accession"]
        SINGLE_CELL_COLUMN = {sample: i for i, sample in enumerate(ids)}
    yield


app = FastAPI(
    title="CancerLike", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan
)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=1)
logger = logging.getLogger(__name__)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, error: Exception) -> JSONResponse:
    logger.error(
        "Unhandled API error for %s %s",
        request.method,
        request.url.path,
        exc_info=(type(error), error, error.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "Internal API error ("
                f"{type(error).__name__}). Check the server function logs for details."
            )
        },
    )


def matching(
    filters: CohortFilter, skip: str | None = None, assay: str | None = None
) -> pl.Series:
    selected_assay = assay or filters.assay
    keep = SAMPLES["single_bulk"].eq(selected_assay)
    for field, values in filters.model_dump(exclude={"assay"}).items():
        if values and field != skip:
            keep = keep & SAMPLES[FACET_COLUMNS[field]].is_in(values)
    return keep


def assay_data(assay: Literal["bulk", "single-cell"]):
    if assay == "single-cell":
        return SINGLE_CELL_EXPRESSION, SINGLE_CELL_COLUMN
    return EXPRESSION, COLUMN


FILTER_FACET_COLUMNS = {key: value for key, value in FACET_COLUMNS.items() if key != "assay"}


def tally(column: str, keep: pl.Series) -> dict[str, int]:
    counts = SAMPLES[column].filter(keep).drop_nulls().value_counts()
    counts = counts.sort("count", column, descending=[True, False])
    return dict(zip(counts[column], counts["count"], strict=True))


def facet_counts(filters: CohortFilter) -> dict[str, dict[str, int]]:
    return {
        field: tally(column, matching(filters, skip=field))
        for field, column in FILTER_FACET_COLUMNS.items()
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


@app.get("/api/differential-expression/options")
def differential_expression_options(
    assay: Literal["bulk", "single-cell"] = "bulk",
) -> dict[str, dict[str, int]]:
    _, columns = assay_data(assay)
    keep = SAMPLES["run_accession"].is_in(list(columns))
    return {
        field: tally(column, keep)
        for field, column in FILTER_FACET_COLUMNS.items()
    }


def differential_expression_sample_ids(
    filters: CohortFilter, assay: Literal["bulk", "single-cell"] | None = None
) -> list[str]:
    """Return selected samples with the bulk expression and PCA data used here."""
    _, columns = assay_data(assay or filters.assay)
    return (
        SAMPLES.filter(matching(filters, assay=assay))
        .filter(pl.col("run_accession").is_in(list(columns)))
        .get_column("run_accession")
        .to_list()
    )


@app.post("/api/differential-expression/cohorts")
def differential_expression_cohorts(
    request: DifferentialExpressionRequest,
) -> dict[str, int | bool]:
    ids1 = set(differential_expression_sample_ids(request.cohort1, request.assay))
    ids2 = set(differential_expression_sample_ids(request.cohort2, request.assay))
    return {
        "cohort1_n": len(ids1),
        "cohort2_n": len(ids2),
        "identical": ids1 == ids2,
        "overlap": len(ids1 & ids2),
    }


@app.post("/api/differential-expression")
def differential_expression(
    request: DifferentialExpressionRequest,
) -> DifferentialExpressionResponse:
    expression_matrix, expression_columns = assay_data(request.assay)
    if POINTS is None or expression_matrix is None or not GENES:
        raise HTTPException(
            status_code=503,
            detail="no prepared expression matrix or PCA coordinates, run make prep first",
        )
    ids1 = differential_expression_sample_ids(request.cohort1, request.assay)
    ids2 = differential_expression_sample_ids(request.cohort2, request.assay)
    overlap = set(ids1) & set(ids2)
    if not ids1 or not ids2:
        raise HTTPException(
            status_code=422,
            detail="Each cohort must contain bulk samples with expression data",
        )
    if overlap:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Cohorts share {len(overlap)} samples. "
                "Adjust filters so the cohorts do not overlap."
            ),
        )
    if request.top_genes < 1 or request.top_genes > 200:
        raise HTTPException(status_code=422, detail="top_genes must be between 1 and 200")
    try:
        import pandas as pd

        from analysis.diff_expression import diff_exp, generate_heatmap_df

        sample_ids = ids1 + ids2
        expression = pd.DataFrame(
            expression_matrix[:, [expression_columns[sample] for sample in sample_ids]],
            index=GENES,
            columns=sample_ids,
        )
        cohort1_ids = set(ids1)
        labels = ["Reference" if sample in cohort1_ids else "Comparison" for sample in sample_ids]
        label_series = pd.Series(labels, index=sample_ids)
        results = diff_exp(expression, label_series, "Reference", "Comparison")
        significant = results.loc[results["padj"] <= 0.05].copy()
        metadata = pd.DataFrame({"cohort": label_series}, index=sample_ids)
        heatmap, groups = generate_heatmap_df(
            expression, metadata, "cohort", significant, top_n=request.top_genes,
            max_samples_per_group=25, groups_to_include=["Reference", "Comparison"],
        )
        all_heatmap, all_groups = generate_heatmap_df(
            expression,
            metadata,
            "cohort",
            significant,
            top_n=request.top_genes,
            max_samples_per_group=len(sample_ids),
            groups_to_include=["Reference", "Comparison"],
        )
    except ImportError as error:
        raise HTTPException(
            status_code=503,
            detail=f"Differential-expression dependencies unavailable: {error}",
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    # Refit the same unscaled, per-gene-centered PCA used by the PCA tab, on
    # these selected samples only. The atlas coordinates are intentionally unused.
    pca_matrix = expression_matrix[
        :, [expression_columns[sample] for sample in sample_ids]
    ].T.astype(np.float64)
    pca_coords, _, pca_ratio = decompose(pca_matrix, 2)
    pca_coords = np.nan_to_num(pca_coords, nan=0.0, posinf=0.0, neginf=0.0)
    pca_ratio = np.nan_to_num(pca_ratio, nan=0.0, posinf=0.0, neginf=0.0)
    sample_metadata = {
        row["run_accession"]: row
        for row in POINTS.filter(pl.col("run_accession").is_in(sample_ids))
        .select("run_accession", "study", *FACET_COLUMNS.keys())
        .to_dicts()
    }
    cohort_by_id = {sample: "Reference" for sample in ids1}
    cohort_by_id.update({sample: "Comparison" for sample in ids2})
    pca_points = [
        {
            "run_accession": sample,
            "cohort": cohort_by_id[sample],
            **{facet: str(sample_metadata[sample][facet] or "Unknown") for facet in FACET_COLUMNS},
            "study": str(sample_metadata[sample]["study"] or "Unknown"),
            "pc1": float(pca_coords[index, 0]),
            "pc2": float(pca_coords[index, 1]),
        }
        for index, sample in enumerate(sample_ids)
    ]
    clean_genes = [
        {
            key: value if key == "gene" else float(value) if np.isfinite(value) else None
            for key, value in row.items()
        }
        for row in results.to_dict(orient="records")
    ]
    heatmap_values = [
        [float(value) if np.isfinite(value) else None for value in row]
        for row in heatmap.to_numpy(dtype=float)
    ]
    all_heatmap_values = [
        [float(value) if np.isfinite(value) else None for value in row]
        for row in all_heatmap.to_numpy(dtype=float)
    ]
    return DifferentialExpressionResponse(
        cohort1_n=len(ids1), cohort2_n=len(ids2), genes=clean_genes,
        heatmap_genes=heatmap.index.astype(str).tolist(),
        heatmap_samples=heatmap.columns.astype(str).tolist(),
        heatmap_values=heatmap_values,
        heatmap_groups=groups.tolist(), pca=pca_points,
        all_heatmap_samples=all_heatmap.columns.astype(str).tolist(),
        all_heatmap_values=all_heatmap_values,
        all_heatmap_groups=all_groups.tolist(),
        pca_variance=[float(value) for value in pca_ratio],
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
    if filters.assay == "single-cell":
        return single_cell_pca_view(filters, fit="global")
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
    if filters.assay == "single-cell":
        return single_cell_pca_view(filters, fit="cohort")
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


def single_cell_pca_view(filters: CohortFilter, fit: Literal["global", "cohort"]) -> PcaView:
    if SINGLE_CELL_EXPRESSION is None or POINTS is None or not SINGLE_CELL_COLUMN:
        raise HTTPException(
            status_code=503,
            detail="no prepared single-cell expression matrix; run make prep first",
        )
    selected_rows = POINTS.filter(matching(filters))
    selected_ids = [
        sample for sample in selected_rows["run_accession"].to_list()
        if sample in SINGLE_CELL_COLUMN
    ]
    fit_ids = list(SINGLE_CELL_COLUMN) if fit == "global" else selected_ids
    if len(fit_ids) < MIN_FIT:
        raise HTTPException(
            status_code=422,
            detail=f"{len(fit_ids)} single-cell samples is too few to decompose, {MIN_FIT} needed",
        )
    matrix = SINGLE_CELL_EXPRESSION[
        :, [SINGLE_CELL_COLUMN[sample] for sample in fit_ids]
    ].T.astype(np.float64)
    coords, weights, ratio = decompose(matrix, len(PCS))
    coords = np.nan_to_num(coords, nan=0.0, posinf=0.0, neginf=0.0)
    selected_indices = {sample: index for index, sample in enumerate(fit_ids)}
    metadata = {
        row["run_accession"]: row
        for row in POINTS.filter(pl.col("run_accession").is_in(fit_ids)).to_dicts()
    }
    points = []
    for sample in selected_ids:
        point = dict(metadata[sample])
        point.update(
            {pc: round(float(coords[selected_indices[sample], i]), 2) for i, pc in enumerate(PCS)}
        )
        points.append(PcaPoint(**{field: point[field] for field in PcaPoint.model_fields}))
    loading_frame = pl.DataFrame(
        {"gene": GENES, **{pc: weights[:, i] for i, pc in enumerate(PCS)}}
    )
    top_rows = POINTS.filter(pl.col("run_accession").is_in(fit_ids))
    return PcaView(
        points=points,
        variance=[round(float(value), 4) for value in ratio],
        extent={
            pc: [round(float(coords[:, i].min()), 2), round(float(coords[:, i].max()), 2)]
            for i, pc in enumerate(PCS)
        },
        top={facet: leading(top_rows, facet) for facet in FACET_COLUMNS},
        excluded=selected_rows.height - len(selected_ids),
        fit=fit,
        loadings={pc: extremes(loading_frame, pc) for pc in PCS},
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
    assay: Literal["bulk", "single-cell"] = "bulk",
    species: Annotated[list[str] | None, Query()] = None,
    system: Annotated[list[str] | None, Query()] = None,
    cancer: Annotated[list[str] | None, Query()] = None,
    subtype: Annotated[list[str] | None, Query()] = None,
    tissue: Annotated[list[str] | None, Query()] = None,
    sex: Annotated[list[str] | None, Query()] = None,
    clade: Annotated[list[str] | None, Query()] = None,
) -> GeneExpressionView:
    expression_matrix, expression_columns = assay_data(assay)
    if expression_matrix is None:
        raise HTTPException(status_code=503, detail="no expression matrix, run make prep first")
    if gene1 not in GENE_INDEX or gene2 not in GENE_INDEX:
        raise HTTPException(status_code=404, detail="gene not found")
    filters = CohortFilter(
        species=species or [], system=system or [], cancer=cancer or [], subtype=subtype or [],
        tissue=tissue or [], sex=sex or [], assay=assay, clade=clade or [],
    )
    return expression_view(gene1, gene2, scope, filters, expression_matrix, expression_columns)


def expression_view(
    gene1: str,
    gene2: str,
    scope: str,
    filters: CohortFilter,
    expression_matrix: NDArray[np.float32],
    expression_columns: dict[str, int],
) -> GeneExpressionView:
    selected_filters = filters if scope == "cohort" else CohortFilter(assay=filters.assay)
    selected = SAMPLES.filter(matching(selected_filters))
    selected_profiles = selected.filter(pl.col("run_accession").is_in(expression_columns))
    samples = selected_profiles.select(
        "run_accession", "bioproject", *FACET_COLUMNS.values()
    ).to_dicts()
    x_index, y_index = GENE_INDEX[gene1], GENE_INDEX[gene2]
    points = [
        GenePoint(
            run_accession=row["run_accession"],
            study=row["bioproject"],
            **{facet: row[column] for facet, column in FACET_COLUMNS.items()},
            x=float(expression_matrix[x_index, expression_columns[row["run_accession"]]]),
            y=float(expression_matrix[y_index, expression_columns[row["run_accession"]]]),
        )
        for row in samples
    ]
    return GeneExpressionView(
        points=points,
        top=top_facets(selected_profiles),
        excluded=selected.height - selected_profiles.height,
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
