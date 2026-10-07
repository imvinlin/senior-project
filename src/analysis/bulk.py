from pathlib import Path
from scipy import stats
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

EXPRESSION_PATH = Path("data/raw/Paipu_deduplicated_expression.tsv")
METADATA_PATH = Path("data/raw/Paipu_deduplicated_metadata.tsv")


def load_samples(
        filter_field: str | None,
        filter_vals: list[str],
        expression_path: Path = EXPRESSION_PATH,
        metadata_path: Path = METADATA_PATH,
        sample_id_column: str = "run_accession"
) -> tuple[pd.DataFrame, pd.DataFrame]:
    metadata = pd.read_csv(metadata_path, sep="\t",
                           dtype=str, low_memory=False)

    # filter for only bulk samples
    for field in (sample_id_column, "single_bulk"):
        if field not in metadata:
            raise ValueError(
                f"Metadata does not contain required column {field!r}")
    metadata = metadata.loc[metadata["single_bulk"].eq("bulk")]

    # filter samples by user input
    if filter_field:
        if filter_field not in metadata:
            raise ValueError(
                f"Metadata does not contain filter column {filter_field!r}")
        # TODO: make this case-insensitive
        metadata = metadata.loc[metadata[filter_field].isin(filter_vals)]

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


# using Welch two-sample test
# effect = comparison mean - reference mean
def diff_exp(
        expression: pd.DataFrame,
        labels: pd.Series,
        reference: str,
        comparison: str,
        min_replicates: int = 2
) -> pd.DataFrame:
    ref_ids = labels.index[labels.eq(
        reference)].intersection(expression.columns)
    cmp_ids = labels.index[labels.eq(
        comparison)].intersection(expression.columns)
    if len(ref_ids) < min_replicates or len(cmp_ids) < min_replicates:
        raise ValueError(
            f"Need at least {min_replicates} samples per group; found "
            f"{reference}={len(ref_ids)}, {comparison}={len(cmp_ids)}"
        )
    ref = expression[ref_ids].to_numpy(dtype=float)
    cmp = expression[cmp_ids].to_numpy(dtype=float)
    mean_ref = np.nanmean(ref, axis=1)
    mean_cmp = np.nanmean(cmp, axis=1)
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
            "log2fc": mean_cmp - mean_ref,
            "statistic": np.asarray(test.statistic),
            "pval": pval,
            "padj": padj,
        }
    ).sort_values("padj", kind="stable")


def generate_pca_data(expression: pd.DataFrame, metadata: pd.DataFrame, group_field: str, output: Path) -> pd.DataFrame:
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
    # fig, ax = plt.subplots(figsize=(9, 7))
    # sns.scatterplot(data=frame, x="PC1", y="PC2", hue=group_field, s=25, alpha=0.8, ax=ax)
    # ax.set_title(f"PCA of bulk samples ({n_genes} most variable genes)")
    # fig.tight_layout()
    # fig.savefig(output, dpi=180)
    # plt.close(fig)


def main() -> int:
    expression, metadata = load_samples(
        filter_field="disease", filter_vals=["melanoma", "Melanoma"])
    labels = metadata["disease"]
    # print(labels.index)
    # print(labels.head)
    print(expression.columns)
    print(expression.index)
    # print(expression.columns.head)
    # print(metadata.head)
    # print(expression.shape)
    # print(metadata.shape)
    return 0


if __name__ == "__main__":
    main()
