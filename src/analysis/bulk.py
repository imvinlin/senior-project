from pathlib import Path
import pandas as pd

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


def diff_exp(
        expression: pd.DataFrame,
        labels: pd.Series,
        reference: str,
        comparison: str,
        min_samples: int = 2
) -> pd.DataFrame:
    return pd.DataFrame()


def main() -> int:
    expression, metadata = load_samples(
        filter_field="disease", filter_vals=["melanoma", "Melanoma"])
    print(expression.head())
    print(metadata.head())
    print(expression.shape)
    print(metadata.shape)
    return 0


if __name__ == "__main__":
    main()
