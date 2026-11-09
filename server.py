"""Vercel entrypoint for the CancerLike FastAPI application."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from cancerlike.server import app as app
