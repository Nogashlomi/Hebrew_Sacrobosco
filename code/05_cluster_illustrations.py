#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STEP 5 - Cluster the extracted illustrations by visual similarity.   [TO BE DEVELOPED]

Input:  data/illustrations/illustrations.csv (+ the crop files it points to)
Output: data/clusters/clusters.csv    one row per illustration: illustration_id, cluster_id, distance
        data/clusters/clusters.json   {"method": ..., "clusters": [{"cluster_id": ..., "illustration_ids": [...]}]}
No image files are copied: clusters refer to illustrations by illustration_id.

The input/output plumbing below is done; embed() and cluster() still have to be written.
(The earlier whole-page pHash attempt, which put 882 of 951 pages in single-page clusters,
is in git history, commit ce3442a.)

Usage:  python code/05_cluster_illustrations.py
"""
import csv
import json
from typing import Dict, List

import pandas as pd

from paths import PROJECT_ROOT, ILLUSTRATIONS_DIR, CLUSTERS_DIR

ILLUSTRATIONS_CSV = ILLUSTRATIONS_DIR / "illustrations.csv"
CLUSTERS_CSV = CLUSTERS_DIR / "clusters.csv"
CLUSTERS_JSON = CLUSTERS_DIR / "clusters.json"
METHOD = "todo"


def embed(crop_paths: List[str]):
    """Return one feature vector per crop (e.g. a pretrained image embedding).  TODO: implement."""
    raise NotImplementedError("Visual features still have to be developed.")


def cluster(features) -> List[Dict]:
    """Return [{'cluster_id': int, 'distance': float}, ...] in the same order as features.  TODO: implement."""
    raise NotImplementedError("Clustering still has to be developed.")


def main():
    ill = pd.read_csv(ILLUSTRATIONS_CSV, dtype=str)
    features = embed([str(PROJECT_ROOT / p) for p in ill["crop_file"]])
    assignments = cluster(features)

    rows = [{"illustration_id": iid, **a} for iid, a in zip(ill["illustration_id"], assignments)]
    CLUSTERS_DIR.mkdir(parents=True, exist_ok=True)
    with CLUSTERS_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["illustration_id", "cluster_id", "distance"])
        w.writeheader()
        w.writerows(rows)

    groups: Dict[int, List[str]] = {}
    for r in rows:
        groups.setdefault(r["cluster_id"], []).append(r["illustration_id"])
    with CLUSTERS_JSON.open("w", encoding="utf-8") as f:
        json.dump({"method": METHOD,
                   "clusters": [{"cluster_id": k, "illustration_ids": v} for k, v in sorted(groups.items())]},
                  f, ensure_ascii=False, indent=2)
    print(f"{len(rows)} illustrations in {len(groups)} clusters -> {CLUSTERS_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
