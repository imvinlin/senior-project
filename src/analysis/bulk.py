import argparse
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

EXPRESSION_PATH = Path("data/raw/Paipu_deduplicated_expression.tsv")
METADATA_PATH = Path("data/raw/Paipu_deduplicated_metadata.tsv")


def group_values(values: str | Sequence[str]) -> list[str]:
    return [values] if isinstance(values, str) else list(values)


def folded_values(values: str | Sequence[str]) -> set[str]:
    return {value.strip().casefold() for value in group_values(values)}


def load_samples(
        filter_field: str | None,
        filter_vals: list[str],
        expression_path: Path = EXPRESSION_PATH,
        metadata_path: Path = METADATA_PATH,
        sample_id_column: str = "run_accession",
        extra_filters: dict[str, Sequence[str]] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    metadata = pd.read_csv(metadata_path, sep="\t",
                           dtype=str, low_memory=False)

    # filter for only bulk samples
    for field in (sample_id_column, "single_bulk"):
        if field not in metadata:
            raise ValueError(
                f"Metadata does not contain required column {field!r}")
    metadata = metadata.loc[metadata["single_bulk"].eq("bulk")]

    # Apply all metadata filters before reading expression columns.
    filters = dict(extra_filters or {})
    if filter_field:
        filters[filter_field] = filter_vals
    for field, allowed_values in filters.items():
        if field not in metadata:
            raise ValueError(
                f"Metadata does not contain filter column {field!r}")
        allowed = folded_values(allowed_values)
        values = metadata[field].astype("string").str.strip().str.casefold()
        metadata = metadata.loc[values.isin(allowed)]

    # index metadata by sample ID (run accession no.)
    metadata = metadata.drop_duplicates(
        sample_id_column).set_index(sample_id_column, drop=False)

    # load expression data for selected samples
    header = pd.read_csv(expression_path, sep="\t", nrows=0).columns.tolist()
    if not header or header[0] != "Genes":
        raise ValueError(
            "Expected the first expression matrix column to be named 'Genes'")
    samples = [sample for sample in header[1:] if sample in metadata.index]
    if len(samples) == 0:
        raise ValueError(
            f"No expression columns matched metadata key {sample_id_column!r}; "
            "check whether run_accession or another sample ID is used."
        )
    expression = pd.read_csv(expression_path, sep="\t",
                             usecols=["Genes", *samples],
                             index_col="Genes")
    expression = expression.apply(pd.to_numeric, errors="coerce")
    metadata = metadata.loc[samples]
    return expression, metadata


def diff_exp(
        expression: pd.DataFrame,
        labels: pd.Series,
        reference: str | Sequence[str],
        comparison: str | Sequence[str],
        min_replicates: int = 2,
) -> pd.DataFrame:
    """Compare groups with Welch's t-test and adjust p-values across genes."""
    # Effects are comparison minus reference on the input expression scale.
    reference_values = folded_values(reference)
    comparison_values = folded_values(comparison)
    if not reference_values or not comparison_values:
        raise ValueError("Reference and comparison groups cannot be empty")
    if reference_values & comparison_values:
        raise ValueError("Reference and comparison groups must be distinct")
    if min_replicates < 2:
        raise ValueError("min_replicates must be at least 2")
    if expression.empty or expression.columns.has_duplicates:
        raise ValueError(
            "Expression data must contain genes and unique sample columns"
        )

    folded_labels = labels.astype("string").str.strip().str.casefold()
    ref_ids = labels.index[folded_labels.isin(reference_values)].intersection(
        expression.columns
    )
    cmp_ids = labels.index[folded_labels.isin(comparison_values)].intersection(
        expression.columns
    )
    if len(ref_ids) < min_replicates or len(cmp_ids) < min_replicates:
        raise ValueError(
            f"Need at least {min_replicates} samples per group; found "
            f"reference ({', '.join(sorted(reference_values))})={len(ref_ids)}, "
            f"comparison ({', '.join(sorted(comparison_values))})={len(cmp_ids)}"
        )
    ref = expression[ref_ids].to_numpy(dtype=float)
    cmp = expression[cmp_ids].to_numpy(dtype=float)
    ref = np.where(np.isfinite(ref), ref, np.nan)
    cmp = np.where(np.isfinite(cmp), cmp, np.nan)
    mean_ref = _row_mean(ref)
    mean_cmp = _row_mean(cmp)
    with np.errstate(invalid="ignore", divide="ignore"):
        test = stats.ttest_ind(
            cmp, ref, axis=1, equal_var=False, nan_policy="omit")
    pval = np.asarray(test.pvalue, dtype=float)
    pval[~np.isfinite(pval)] = 1.0
    # Benjamini-Hochberg adjusted p-vals, monotone from largest p-val down
    order = np.argsort(pval)
    ranked = pval[order] * len(pval) / np.arange(1, len(pval) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    padj = np.empty_like(ranked)
    padj[order] = np.minimum(ranked, 1.0)
    return pd.DataFrame(
        {
            "gene": expression.index,
            "mean_reference": mean_ref,
            "mean_comparison": mean_cmp,
            "mean_difference": mean_cmp - mean_ref,
            "statistic": np.asarray(test.statistic),
            "pval": pval,
            "padj": padj,
        }
    ).sort_values("padj", kind="stable")


def _row_mean(values: np.ndarray) -> np.ndarray:
    valid = np.isfinite(values)
    counts = valid.sum(axis=1)
    totals = np.where(valid, values, 0).sum(axis=1)
    return np.divide(
        totals,
        counts,
        out=np.full(values.shape[0], np.nan),
        where=counts > 0,
    )


def generate_pca_df(expression: pd.DataFrame, metadata: pd.DataFrame, group_field: str) -> pd.DataFrame:
    """PCA of samples, using variable genes and row-wise gene standardization."""
    values = expression.to_numpy(dtype=float)
    variances = np.nanvar(values, axis=1)
    n_genes = min(2000, int(np.isfinite(variances).sum()))
    keep = np.argsort(np.nan_to_num(variances, nan=-np.inf))[-n_genes:]
    matrix = values[keep].T
    matrix = np.where(np.isfinite(matrix), matrix,
                      np.nanmedian(matrix, axis=0))
    matrix = StandardScaler().fit_transform(matrix)
    coords = PCA(n_components=2).fit_transform(matrix)
    frame = pd.DataFrame(
        coords, columns=["PC1", "PC2"], index=expression.columns)
    frame[group_field] = metadata.loc[frame.index,
                                      group_field].fillna("Unknown").to_numpy()
    return frame


def generate_heatmap_df(
    expression: pd.DataFrame,
    metadata: pd.DataFrame,
    group_field: str,
    result: pd.DataFrame,
    top_n: int = 50,
    max_samples_per_group: int = 40,
    groups_to_include: Sequence[str] | None = None,
) -> tuple[pd.DataFrame, pd.Series]:
    if group_field not in metadata:
        raise ValueError(f"Metadata does not contain group column {group_field!r}")
    if "gene" not in result:
        raise ValueError("Differential-expression result must contain a 'gene' column")
    if top_n < 1 or max_samples_per_group < 1:
        raise ValueError("top_n and max_samples_per_group must be positive")

    genes = result.head(top_n)["gene"].tolist()
    display_metadata = metadata
    if groups_to_include is not None:
        labels = metadata[group_field].astype("string").str.strip().str.casefold()
        display_metadata = metadata.loc[labels.isin(folded_values(groups_to_include))]

    # Share the sample cap across case variants of the same group label.
    chosen: list[str] = []
    counts: dict[str, int] = {}
    labels = display_metadata[group_field].astype("string").str.strip().str.casefold()
    for sample, label in labels.items():
        key = label if pd.notna(label) else "<missing>"
        if counts.get(key, 0) < max_samples_per_group:
            chosen.append(sample)
            counts[key] = counts.get(key, 0) + 1
    selected = set(chosen)
    chosen = [sample for sample in expression.columns if sample in selected]
    values = expression.loc[genes, chosen]
    # Z-score each gene for visualization only
    # do not use this matrix for tests
    z = values.sub(values.mean(axis=1), axis=0).div(
        values.std(axis=1).replace(0, np.nan), axis=0)
    groups = display_metadata.loc[z.columns, group_field].fillna("Unknown").astype(str)

    return z, groups


def run_analysis(
    filter_field: str,
    filter_values: list[str],
    group_field: str,
    reference: str | Sequence[str],
    comparison: str | Sequence[str],
    output_dir: Path,
    top_genes: int = 50,
    max_samples_per_group: int = 40,
    min_replicates: int = 2,
    species: str | None = None,
) -> int:
    extra_filters = {"organism_scientific_name": [species]} if species else None
    expression, metadata = load_samples(
        filter_field, filter_values, extra_filters=extra_filters
    )
    if group_field not in metadata:
        raise ValueError(f"Metadata does not contain group column {group_field!r}")
    labels = metadata[group_field].fillna("Unknown")
    result = diff_exp(
        expression,
        labels,
        reference,
        comparison,
        min_replicates=min_replicates,
    )
    heatmap, groups = generate_heatmap_df(
        expression,
        metadata,
        group_field,
        result,
        top_n=top_genes,
        max_samples_per_group=max_samples_per_group,
        groups_to_include=(*group_values(reference), *group_values(comparison)),
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    result.to_csv(output_dir / "differential_expression.csv", index=False)
    heatmap.to_csv(output_dir / "heatmap_values.csv", index_label="gene")
    groups.rename("group").rename_axis("sample").to_csv(
        output_dir / "heatmap_groups.csv"
    )
    return len(result)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two bulk sample groups")
    parser.add_argument(
        "--filter-field", required=True, help="Metadata field used to select samples"
    )
    parser.add_argument(
        "--filter-value",
        action="append",
        required=True,
        help="Allowed filter value; repeat as needed",
    )
    parser.add_argument(
        "--group-field", required=True, help="Metadata field defining the two groups"
    )
    parser.add_argument(
        "--reference", action="append", required=True,
        help="Reference label; repeat to combine labels",
    )
    parser.add_argument(
        "--comparison", action="append", required=True,
        help="Comparison label; repeat to combine labels",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("data/analysis"))
    parser.add_argument("--top-genes", type=int, default=50)
    parser.add_argument("--max-samples-per-group", type=int, default=40)
    parser.add_argument("--min-replicates", type=int, default=2)
    parser.add_argument(
        "--species",
        help="Optional organism_scientific_name value used to restrict samples",
    )
    args = parser.parse_args()

    try:
        gene_count = run_analysis(
            args.filter_field,
            args.filter_value,
            args.group_field,
            args.reference,
            args.comparison,
            args.output_dir,
            top_genes=args.top_genes,
            max_samples_per_group=args.max_samples_per_group,
            min_replicates=args.min_replicates,
            species=args.species,
        )
    except ValueError as error:
        parser.error(str(error))
    print(f"Wrote results for {gene_count} genes to {args.output_dir}")
    return 0


if __name__ == "__main__":
    main()
