"""Fetch public source files and prepare the compact data bundle for Vercel."""

import os
from pathlib import Path

import gdown

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
FILES = {
    "Paipu_deduplicated_metadata.tsv": "1MTXCLt7fglAKMtZDhDmDySF7JDhCfLqN",
    "Paipu_deduplicated_expression.tsv": "1wzyiUDGz2TI8UX2EGrc_KnHa2Kts_UxF",
}


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    downloaded_expression = False
    for name, default_id in FILES.items():
        kind = "METADATA" if "metadata" in name else "EXPRESSION"
        file_id = os.environ.get(f"DRIVE_{kind}_FILE_ID", default_id)
        destination = RAW_DIR / name
        if not destination.is_file() or destination.stat().st_size == 0:
            gdown.download(
                f"https://drive.google.com/uc?id={file_id}", str(destination), quiet=False
            )
            if name == "Paipu_deduplicated_expression.tsv":
                downloaded_expression = True
        if not destination.is_file() or destination.stat().st_size == 0:
            raise RuntimeError(f"Google Drive download did not produce {destination}")

    os.environ["CANCERLIKE_DATA_DIR"] = str(DATA_DIR)
    # Import only after setting the data directory because prep and server share it.
    import sys

    sys.path.insert(0, str(ROOT / "src"))
    from cancerlike.prep import run

    run()
    # The runtime uses the prepared NumPy matrix, not the raw 622 MB TSV.
    if downloaded_expression:
        (RAW_DIR / "Paipu_deduplicated_expression.tsv").unlink()


if __name__ == "__main__":
    main()
