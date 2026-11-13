#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STEP 7 - Match the manuscript illustrations against the printed-editions corpus.

Input:  data/print_corpus/images/SAC_SIL_NNNNN.jpg      one representative crop per print illustration cluster
        data/illustrations/illustrations[_reviewed].csv  (step 4/4b; only "Content Illustration" crops are compared)
Output: data/print_matches/print_matches.csv      one row per (print cluster, manuscript illustration) match
        data/print_matches/print_matches.json     the same, grouped by print cluster, for the visualizer
        data/print_matches/print_embeddings.npy   cached print embeddings (manuscript ones: data/clusters/embeddings.npz)

How:
1. Both corpora are embedded with the same models and preparation as step 5 (greyscale, padded,
   CLIP ViT-B/32 + DINOv2-small), so print and manuscript crops are described the same way.
2. Plain cosine similarity is not enough here: almost every diagram is "circles and lines", and
   a few generic crops come out as the nearest neighbour of hundreds of others. We therefore score
   pairs with CSLS (cross-domain similarity local scaling, Conneau et al. 2018):
       score(p, m) = 2*cos(p, m) - mean cos of m to its K nearest prints - mean cos of p to its K nearest manuscript crops
   A pair scores high only when the two are closer to each other than to the rest of the other corpus.
3. Empty crops (blank parchment, a stray dot) look alike to the models and would "match" each other,
   so crops with almost no ink (MIN_INK) are left out.
4. Pairs above MIN_SCORE are kept and given a confidence tier (strong / probable / possible).
   Thresholds were set by inspecting the ranked pairs: the top ~150 are almost all true parallels,
   around 0.04 roughly half are.

These are candidates for a human to confirm, not proven derivations.

Usage:  python code/07_match_print_illustrations.py
"""
import csv
import importlib.util
import json

import numpy as np
import pandas as pd
from PIL import Image

from paths import PROJECT_ROOT, PRINT_CLUSTERS_DIR, PRINT_MATCHES_DIR, illustrations_csv

CLUSTERED_CLASS = "Content Illustration"
K = 10                       # neighbourhood size for the CSLS correction
MIN_SCORE = 0.04             # pairs below this are not kept
TIERS = [(0.06, "strong"), (0.05, "probable"), (MIN_SCORE, "possible")]
MAX_PER_PRINT = 12
MIN_INK = 0.001              # share of pixels clearly darker than the background; below = blank crop

# step 5's file name starts with a digit, so load it by path to reuse its embed()
_spec = importlib.util.spec_from_file_location("step5", PROJECT_ROOT / "code" / "05_cluster_illustrations.py")
step5 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(step5)


def cached_embeddings(name, paths):
    """Embed paths with step 5's models, reusing data/print_matches/<name>_embeddings.npy if it fits."""
    cache = PRINT_MATCHES_DIR / f"{name}_embeddings.npy"
    if cache.exists():
        features = np.load(cache)
        if len(features) == len(paths):
            return features
    features = step5.embed([str(p) for p in paths])
    np.save(cache, features)
    return features


def ink(path):
    """Share of pixels clearly darker than the crop's background (median grey)."""
    a = np.asarray(Image.open(path).convert("L").resize((128, 128)), dtype=float)
    return float(((np.median(a) - a) > 40).mean())


def tier(score):
    return next(name for limit, name in TIERS if score >= limit)


def main():
    PRINT_MATCHES_DIR.mkdir(parents=True, exist_ok=True)
    prints = sorted(p.name for p in PRINT_CLUSTERS_DIR.glob("*.jpg"))
    ill = pd.read_csv(illustrations_csv(), dtype=str)
    ms = ill[ill["class"] == CLUSTERED_CLASS].reset_index(drop=True)

    P = cached_embeddings("print", [PRINT_CLUSTERS_DIR / p for p in prints])
    M = step5.embeddings_for(ms["illustration_id"].tolist(), [str(PROJECT_ROOT / p) for p in ms["crop_file"]])

    cos = P @ M.T
    r_print = np.sort(cos, axis=0)[-K:].mean(axis=0)     # each ms crop: closeness to its K nearest prints
    r_ms = np.sort(cos, axis=1)[:, -K:].mean(axis=1)     # each print: closeness to its K nearest ms crops
    score = 2 * cos - r_print[None, :] - r_ms[:, None]
    blank_print = np.array([ink(PRINT_CLUSTERS_DIR / p) < MIN_INK for p in prints])
    blank_ms = np.array([ink(PROJECT_ROOT / p) < MIN_INK for p in ms["crop_file"]])
    score[blank_print, :] = -1
    score[:, blank_ms] = -1

    rows = []
    for i, name in enumerate(prints):
        hits = np.where(score[i] >= MIN_SCORE)[0]
        hits = hits[np.argsort(-score[i, hits])][:MAX_PER_PRINT]
        for j in hits:
            rows.append({"print_id": name.rsplit(".", 1)[0], "print_file": f"{PRINT_CLUSTERS_DIR.relative_to(PROJECT_ROOT).as_posix()}/{name}",
                         "illustration_id": ms.at[j, "illustration_id"],
                         "score": round(float(score[i, j]), 4), "cosine": round(float(cos[i, j]), 4),
                         "tier": tier(score[i, j])})

    with (PRINT_MATCHES_DIR / "print_matches.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    groups = {}
    for r in rows:
        g = groups.setdefault(r["print_id"], {"print_id": r["print_id"], "print_file": r["print_file"], "matches": []})
        g["matches"].append({k: r[k] for k in ("illustration_id", "score", "cosine", "tier")})
    ordered = sorted(groups.values(), key=lambda g: -g["matches"][0]["score"])
    with (PRINT_MATCHES_DIR / "print_matches.json").open("w", encoding="utf-8") as f:
        json.dump({"method": f"{step5.METHOD}; CSLS score (K={K})",
                   "min_score": MIN_SCORE, "tiers": {name: limit for limit, name in TIERS},
                   "n_print_clusters": len(prints), "n_ms_illustrations": len(ms),
                   "print_clusters": ordered}, f, ensure_ascii=False, indent=2)

    folder = dict(zip(ms["illustration_id"], ms["manuscript_folder"]))
    print(f"{len(prints)} print clusters x {len(ms)} manuscript diagrams: {len(ordered)} print clusters matched, "
          f"{len({r['illustration_id'] for r in rows})} manuscript diagrams in "
          f"{len({folder[r['illustration_id']] for r in rows})} manuscripts "
          f"({sum(r['tier'] == 'strong' for r in rows)} strong pairs; {blank_print.sum()} blank print and "
          f"{blank_ms.sum()} blank manuscript crops left out) -> {PRINT_MATCHES_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
