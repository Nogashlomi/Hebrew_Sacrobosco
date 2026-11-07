# -*- coding: utf-8 -*-
"""
Shared folder locations for every pipeline step.

code/01_scrape_metadata.py        -> data/metadata/raw/
code/02_download_manuscripts.py   -> data/manuscripts/   (+ index CSVs in data/metadata/raw/)
code/03_organize_metadata.py      -> data/metadata/clean/
code/04_extract_illustrations.py  -> data/illustrations/
code/05_cluster_illustrations.py  -> data/clusters/
code/06_build_visualizer.py       -> visualizer/
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CODE_DIR = PROJECT_ROOT / "code"
DATA_DIR = PROJECT_ROOT / "data"

# 1. metadata
METADATA_DIR = DATA_DIR / "metadata"
RAW_METADATA_DIR = METADATA_DIR / "raw"            # harvest + download CSVs, as produced
MARCXML_DIR = RAW_METADATA_DIR / "marcxml"         # one MARCXML collection per search term
CLEAN_METADATA_DIR = METADATA_DIR / "clean"        # tidied metadata used by the visualizer

# 2. digitized manuscripts: data/manuscripts/<mms_id>_<library>_<shelfmark>/NNNN.jpg + metadata.json
MANUSCRIPTS_DIR = DATA_DIR / "manuscripts"

# 3. extracted illustrations: data/illustrations/<manuscript folder>/<crop>.png + illustrations.csv
ILLUSTRATIONS_DIR = DATA_DIR / "illustrations"

# 4. clustering results (data only, no image copies)
CLUSTERS_DIR = DATA_DIR / "clusters"

# visualizer: template sources in code/, built site in visualizer/
VISUALIZER_TEMPLATE_DIR = CODE_DIR / "visualizer_template"
VISUALIZER_DIR = PROJECT_ROOT / "visualizer"

# printed-editions corpus: one representative crop per print illustration cluster (SAC_SIL_NNNNN.jpg)
PRINT_CLUSTERS_DIR = PROJECT_ROOT / "images_ck_flat"

# matches between the print representatives and the manuscript illustrations
PRINT_MATCHES_DIR = DATA_DIR / "print_matches"

# printed-editions metadata (copied from thesis_data/data, Feb 2025 exports):
#   print_images_clusters.csv  one row per image x keyword: image URL, cluster_name (SAC_SIL_...), book (bid), place, year, ...
#   print_books.csv            one row per printed edition (bid): title, authors, printers, place, year
PRINT_CORPUS_DIR = DATA_DIR / "print_corpus"

# network of printed editions and manuscripts that share illustrations
NETWORK_DIR = DATA_DIR / "network"

# manual review (code/review_tool): your decisions, kept apart from the automatic output so re-runs keep them
REVIEW_DIR = DATA_DIR / "review"
EXTRACTION_REVIEW_JSON = REVIEW_DIR / "extraction_review.json"   # wrong boxes, class changes, drawn boxes, checked pages
CLUSTERS_REVIEW_JSON = REVIEW_DIR / "clusters_review.json"       # fixed (reviewed) groups, items marked unique

# illustration tables: step 4 writes the detector's output; step 4b applies the extraction review
ILLUSTRATIONS_DETECTED_CSV = ILLUSTRATIONS_DIR / "illustrations.csv"
ILLUSTRATIONS_REVIEWED_CSV = ILLUSTRATIONS_DIR / "illustrations_reviewed.csv"

# image embeddings per illustration id (CLIP + DINOv2, step 5), reused by steps 5, 7 and the review tool
EMBEDDINGS_NPZ = CLUSTERS_DIR / "embeddings.npz"


def illustrations_csv():
    """The illustration table later steps should read: the reviewed one when step 4b has run, else the detector's."""
    return ILLUSTRATIONS_REVIEWED_CSV if ILLUSTRATIONS_REVIEWED_CSV.exists() else ILLUSTRATIONS_DETECTED_CSV
