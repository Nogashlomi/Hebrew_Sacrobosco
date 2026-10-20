#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STEP 4 - Extract illustrations (diagrams, figures) from the manuscript pages.   [TO BE DEVELOPED]

Input:  data/manuscripts/<manuscript folder>/NNNN.jpg (+ metadata.json)
Output: data/illustrations/<manuscript folder>/<page>_illNN.png   one cropped image per illustration
        data/illustrations/illustrations.csv                      one row per crop, columns ILLUSTRATION_COLUMNS

The input/output plumbing below is done; only detect_illustrations() still has to be written.
Earlier attempts (edge density, OpenCV contours, YOLO with COCO weights, Grounding-DINO + SAM)
are in git history (commit ce3442a) and documented in docs/AUDIT_REPORT_2026-10-18.md.

Usage:  python code/04_extract_illustrations.py [--only <folder name>]
"""
import argparse
import csv
import json
from pathlib import Path
from typing import List, Tuple

from PIL import Image

from paths import PROJECT_ROOT, MANUSCRIPTS_DIR, ILLUSTRATIONS_DIR

ILLUSTRATIONS_CSV = ILLUSTRATIONS_DIR / "illustrations.csv"
ILLUSTRATION_COLUMNS = [
    "illustration_id",   # <mms_id>_<page>_<NN>, unique across the project
    "mms_id",
    "manuscript_folder",
    "page_number",
    "page_file",         # path of the source page, relative to the project root
    "crop_file",         # path of the cropped image, relative to the project root
    "x", "y", "width", "height",   # bounding box in page pixels
    "score",             # detector confidence (0-1), if the method gives one
    "method",            # name/version of the detector that produced the crop
]

Box = Tuple[int, int, int, int, float]   # x, y, width, height, score


def detect_illustrations(page: Image.Image) -> List[Box]:
    """Return the bounding boxes of the illustrations on one page.  TODO: implement."""
    raise NotImplementedError("Illustration detection still has to be developed.")


def process_manuscript(folder: Path, method: str) -> List[dict]:
    meta = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
    mms_id = meta["mms_id"]
    out_dir = ILLUSTRATIONS_DIR / folder.name
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for page_file in sorted(folder.glob("*.jpg")):
        page_number = int(page_file.stem)
        with Image.open(page_file) as page:
            for n, (x, y, w, h, score) in enumerate(detect_illustrations(page), 1):
                crop_file = out_dir / f"{page_file.stem}_ill{n:02d}.png"
                page.crop((x, y, x + w, y + h)).save(crop_file)
                rows.append({
                    "illustration_id": f"{mms_id}_{page_file.stem}_{n:02d}",
                    "mms_id": mms_id,
                    "manuscript_folder": folder.name,
                    "page_number": page_number,
                    "page_file": page_file.relative_to(PROJECT_ROOT).as_posix(),
                    "crop_file": crop_file.relative_to(PROJECT_ROOT).as_posix(),
                    "x": x, "y": y, "width": w, "height": h,
                    "score": round(score, 4),
                    "method": method,
                })
    print(f"{folder.name}: {len(rows)} illustrations")
    return rows


def main():
    parser = argparse.ArgumentParser(description="Extract illustrations from downloaded manuscripts.")
    parser.add_argument("--only", help="Process a single manuscript folder (by name).")
    parser.add_argument("--method", default="todo", help="Label stored in the 'method' column.")
    args = parser.parse_args()

    folders = sorted(f for f in MANUSCRIPTS_DIR.iterdir() if f.is_dir() and any(f.glob("*.jpg")))
    if args.only:
        folders = [f for f in folders if f.name == args.only]

    rows = []
    for folder in folders:
        rows.extend(process_manuscript(folder, args.method))

    ILLUSTRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    with ILLUSTRATIONS_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ILLUSTRATION_COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {ILLUSTRATIONS_CSV.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
