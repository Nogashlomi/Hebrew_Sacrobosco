#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract illustration pages (JPEG/PNG) identified by the detection script
and copy them to a dedicated folder for easy inspection.

Usage:
    python src/preprocessing/extract_illustrations.py [--csv PATH] [--out DIR]

* ``--csv`` – path to the CSV produced by ``detect_illustrations.py``
  (default: ``data/csv/ILLUSTRATIONS_DETECTED.csv``).
* ``--out`` – directory where the illustration images will be copied.
  The default creates ``data/illustrations/`` and mirrors the original
  manuscript folder structure, e.g. ``data/illustrations/<mms_id>_.../0005.jpg``.

The script reads each row where ``illustration`` is True, determines the
original image path (based on the ``images/`` or ``data/raw/`` layout) and
copies the file to the target location.
"""

import argparse
import csv
import shutil
from pathlib import Path
from typing import Tuple

# ---------------------------------------------------------------------------
# Configuration – adjust only if your folder layout changes
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # src/preprocessing -> project root
RAW_DIR = (PROJECT_ROOT / "images") if (PROJECT_ROOT / "images").exists() else (PROJECT_ROOT / "data" / "raw")
DEFAULT_CSV = PROJECT_ROOT / "data" / "csv" / "ILLUSTRATIONS_DETECTED.csv"
DEFAULT_OUT = PROJECT_ROOT / "data" / "illustrations"


def parse_row(row: dict) -> Tuple[str, int, bool]:
    """Return (mms_id, page_number, is_illustration) from a CSV row dict."""
    mms_id = row["mms_id"]
    page = int(row["page_number"])
    is_ill = row["illustration"].strip().lower() == "true"
    return mms_id, page, is_ill


def original_image_path(mms_id: str, page_number: int) -> Path:
    """Construct the original image path.

    The image files are stored under ``RAW_DIR/<folder>/<page>.jpg`` where
    ``<folder>`` follows the pattern ``{mms_id}_*`` (the part after the first
    underscore comes from the library code and shelfmark).  We locate the
    folder by globbing for a directory that starts with the MMS ID.
    """
    # Find the manuscript folder that starts with the MMS ID
    candidates = list(RAW_DIR.glob(f"{mms_id}_*"))
    if not candidates:
        raise FileNotFoundError(f"No folder found for MMS ID {mms_id} in {RAW_DIR}")
    folder = candidates[0]
    filename = f"{page_number:04d}.jpg"
    return folder / filename


def copy_illustrations(csv_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mms_id, page, is_ill = parse_row(row)
            if not is_ill:
                continue
            try:
                src = original_image_path(mms_id, page)
                # Preserve manuscript sub‑folder under the output directory
                target_folder = out_dir / src.parent.name
                target_folder.mkdir(parents=True, exist_ok=True)
                dst = target_folder / src.name
                shutil.copy2(src, dst)
                print(f"Copied {src} → {dst}")
            except Exception as e:
                print(f"⚠️  Failed for MMS {mms_id} page {page}: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy detected illustration images to a dedicated folder.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV,
                        help="Path to the CSV produced by detect_illustrations.py")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help="Destination directory for copied illustration images")
    args = parser.parse_args()
    print(f"Reading results from {args.csv}")
    copy_illustrations(args.csv, args.out)
    print(f"All illustrations have been copied to {args.out}")


if __name__ == "__main__":
    main()
