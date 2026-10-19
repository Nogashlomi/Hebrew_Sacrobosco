#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Detect illustration pages in downloaded manuscript images.

The script scans all page images under the project ``data/raw`` directory,
computes a lightweight visual‑complexity metric (edge density) and decides
whether a page most likely contains an illustration/figure rather than plain
text.

Results are written to ``data/csv/ILLUSTRATIONS_DETECTED.csv`` with the
columns:
    mms_id, page_number, illustration (bool), confidence (0‑1 float)

The detection is deliberately lightweight – it does not require heavy ML
models and works offline with only Pillow and NumPy.  Thresholds can be tuned
via CLI arguments.
"""

import argparse
import csv
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# CONFIGURATION – adjust only if folder layout changes
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # src/preprocessing -> project root
# Look for images in the top‑level "images" folder first; fall back to "data/images" if needed
if (PROJECT_ROOT / "images").exists():
    RAW_DIR = PROJECT_ROOT / "images"
elif (PROJECT_ROOT / "data" / "images").exists():
    RAW_DIR = PROJECT_ROOT / "data" / "images"
else:
    raise FileNotFoundError(f"No images folder found under {PROJECT_ROOT}")
CSV_OUTPUT = PROJECT_ROOT / "data" / "csv" / "ILLUSTRATIONS_DETECTED.csv"

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def load_grayscale(img_path: Path) -> np.ndarray:
    """Load an image and return a 2‑D uint8 grayscale array."""
    with Image.open(img_path) as img:
        gray = img.convert("L")
        return np.array(gray, dtype=np.uint8)


def edge_density(gray: np.ndarray) -> float:
    """Return a normalized edge‑density score (0‑1).

    Uses Sobel filters to approximate gradient magnitude and computes the
    proportion of pixels whose magnitude exceeds a small threshold.
    """
    Kx = np.array([[1, 0, -1], [2, 0, -2], [1, 0, -1]], dtype=int)
    Ky = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=int)
    padded = np.pad(gray, 1, mode="edge")
    gx = np.empty_like(gray, dtype=int)
    gy = np.empty_like(gray, dtype=int)
    for i in range(gray.shape[0]):
        for j in range(gray.shape[1]):
            region = padded[i:i+3, j:j+3]
            gx[i, j] = (Kx * region).sum()
            gy[i, j] = (Ky * region).sum()
    magnitude = np.hypot(gx, gy)
    edge_mask = magnitude > 20
    return edge_mask.mean()


def is_illustration(gray: np.ndarray, thresh: float) -> Tuple[bool, float]:
    """Return (is_illustration, confidence) where confidence is the edge density."""
    score = edge_density(gray)
    return (score >= thresh, score)


def parse_mms_page(img_path: Path) -> Tuple[str, int]:
    """Extract MMS ID and page number from the image path.

    Expected layout: .../data/raw/<mms_id>_<lib>_<shelfmark>/<page>.jpg
    """
    folder_name = img_path.parent.name
    mms_id = folder_name.split("_")[0]
    page_num = int(img_path.stem)
    return mms_id, page_num


def scan_directory(root: Path, edge_thresh: float) -> List[Tuple[str, int, bool, float]]:
    rows = []
    for img_path in root.rglob("*.*"):
        if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".gif", ".webp"}:
            continue
        gray = load_grayscale(img_path)
        is_illust, confidence = is_illustration(gray, edge_thresh)
        mms_id, page_num = parse_mms_page(img_path)
        rows.append((mms_id, page_num, "true" if is_illust else "false", round(confidence, 4)))
    return rows


def write_csv(rows: List[Tuple[str, int, bool, float]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["mms_id", "page_number", "illustration", "confidence"])
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect illustration pages in manuscript images.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.1,
        help="Edge‑density threshold (0‑1) above which a page is considered an illustration.",
    )
    args = parser.parse_args()
    print(f"Scanning images under {RAW_DIR} …")
    max_images = 200  # limit for quick run
    rows = []
    count = 0
    # DEBUG: process a limited number of files and print progress
    processed = 0
    for img_path in RAW_DIR.rglob('*.*'):
        if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".gif", ".webp"}:
            continue
        # Show first few paths for debugging
        if processed < 20:
            print(f"[DEBUG] processing {img_path}")
        try:
            gray = load_grayscale(img_path)
            is_illust, confidence = is_illustration(gray, args.threshold)
            mms_id, page_num = parse_mms_page(img_path)
            rows.append((mms_id, page_num, "true" if is_illust else "false", round(confidence, 4)))
        except Exception as e:
            print(f"[ERROR] failed processing {img_path}: {e}")
        processed += 1
        if processed >= max_images:
            break
    print(f"Processed {len(rows)} pages (limited to {max_images}), writing to {CSV_OUTPUT}")
    write_csv(rows, CSV_OUTPUT)
    print("Done.")

if __name__ == "__main__":
    main()
