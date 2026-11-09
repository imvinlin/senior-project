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
    for name, default_id in FILES.items():
        kind = "METADATA" if "metadata" in name else "EXPRESSION"
        file_id = os.environ.get(f"DRIVE_{kind}_FILE_ID", default_id)
        destination = RAW_DIR / name
        gdown.download(f"https://drive.google.com/uc?id={file_id}", str(destination), quiet=False)
        if not destination.is_file() or destination.stat().st_size == 0:
            raise RuntimeError(f"Google Drive download did not produce {destination}")

    os.environ["CANCERLIKE_DATA_DIR"] = str(DATA_DIR)
    # Import only after setting the data directory because prep and server share it.
    import sys

    sys.path.insert(0, str(ROOT / "src"))
    from cancerlike.prep import run

    run()


if __name__ == "__main__":
    main()
