#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STEP 4b - Apply the manual extraction review to the detector's output.

Input:  data/illustrations/illustrations.csv      the detector's crops (step 4), never changed here
        data/review/extraction_review.json         your decisions, written by the review tool (code/review_tool):
            deleted          {illustration_id: {...}}          wrong detections (crop files are kept, rows dropped)
            class_changes    {illustration_id: class}          detections with a corrected class
            added            {illustration_id: {page, box ...}}  boxes you drew; id <mms_id>_<page>_manual_NN
            pages_checked    {manuscript folder: [page numbers]} progress only
            manuscripts_done {manuscript folder: timestamp}      progress only
Output: data/illustrations/illustrations_reviewed.csv   same columns as illustrations.csv; later steps read this
        data/illustrations/<folder>/<page>_<class>_mNN.jpg crops for the boxes you drew (method "manual")

Usage:  python code/04b_apply_extraction_review.py
"""
import csv
import json

from PIL import Image

from paths import PROJECT_ROOT, ILLUSTRATIONS_DIR, ILLUSTRATIONS_DETECTED_CSV, ILLUSTRATIONS_REVIEWED_CSV, \
    EXTRACTION_REVIEW_JSON

COLUMNS = ["illustration_id", "mms_id", "manuscript_folder", "page_number", "page_file", "crop_file", "class",
           "x", "y", "width", "height", "score", "method"]


def load_review():
    if EXTRACTION_REVIEW_JSON.exists():
        review = json.loads(EXTRACTION_REVIEW_JSON.read_text(encoding="utf-8"))
    else:
        review = {}
    for key in ("deleted", "class_changes", "added", "pages_checked", "manuscripts_done"):
        review.setdefault(key, {})
    return review


def crop_drawn_box(iid, box):
    """Cut the crop for a box drawn in the review tool; returns its path relative to the project root."""
    page = int(box["page_number"])
    slug = box["class"].replace(" ", "_").replace("'", "")
    n = iid.rsplit("_", 1)[-1]
    out = ILLUSTRATIONS_DIR / box["manuscript_folder"] / f"{page:04d}_{slug}_m{n}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    x, y, w, h = (int(round(float(box[k]))) for k in ("x", "y", "width", "height"))
    with Image.open(PROJECT_ROOT / box["page_file"]) as im:
        im.convert("RGB").crop((x, y, x + w, y + h)).save(out, quality=95)
    return out.relative_to(PROJECT_ROOT).as_posix()


def apply_review():
    review = load_review()
    with ILLUSTRATIONS_DETECTED_CSV.open(encoding="utf-8-sig", newline="") as f:
        detected = list(csv.DictReader(f))
    rows = []
    for r in detected:
        if r["illustration_id"] in review["deleted"]:
            continue
        if r["illustration_id"] in review["class_changes"]:
            r = {**r, "class": review["class_changes"][r["illustration_id"]]}
        rows.append(r)
    for iid, box in sorted(review["added"].items()):
        rows.append({"illustration_id": iid, "mms_id": box["mms_id"], "manuscript_folder": box["manuscript_folder"],
                     "page_number": str(int(box["page_number"])), "page_file": box["page_file"],
                     "crop_file": crop_drawn_box(iid, box), "class": box["class"],
                     "x": int(round(float(box["x"]))), "y": int(round(float(box["y"]))),
                     "width": int(round(float(box["width"]))), "height": int(round(float(box["height"]))),
                     "score": "", "method": "manual"})
    with ILLUSTRATIONS_REVIEWED_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return len(detected), len(review["deleted"]), len(review["class_changes"]), len(review["added"]), len(rows)


def main():
    n_det, n_del, n_cls, n_add, n_out = apply_review()
    print(f"{n_det} detected - {n_del} marked wrong, {n_cls} class changes, + {n_add} drawn = {n_out} illustrations "
          f"-> {ILLUSTRATIONS_REVIEWED_CSV.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
