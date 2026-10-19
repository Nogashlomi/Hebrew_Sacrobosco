#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cluster manuscript images by perceptual similarity.
The script scans the folder containing all downloaded manuscript images (data/raw/),
computes a perceptual hash for each image and groups images whose Hamming distance
is within a configurable tolerance.
The resulting clusters are written to data/viz/visuals_clusters.json for the front‑end.
"""

import json
from pathlib import Path
from collections import defaultdict

from PIL import Image
import imagehash
from tqdm import tqdm

# ---------------------------------------------------------------------------
# CONFIGURATION – adjust only if your folder layout changes
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # src/clustering → project root
# Folder that contains a sub‑folder per manuscript (e.g. 990001314250205171_...)
CORPUS_ROOT = PROJECT_ROOT / "data" / "raw"
# Where the JSON will be written – inside the data/viz folder
OUTPUT_JSON = PROJECT_ROOT / "data" / "viz" / "visuals_clusters.json"
# Maximum Hamming distance between two perceptual hashes to consider them the same cluster.
HASH_TOLERANCE = 5

def is_image(p: Path) -> bool:
    return p.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".tif", ".tiff"}

def collect_images(root: Path) -> list[Path]:
    return [p for p in root.rglob("*") if p.is_file() and is_image(p)]

def hash_image(img_path: Path) -> str:
    with Image.open(img_path) as img:
        img = img.convert("RGB")
        return str(imagehash.phash(img))

def cluster_hashes(hash_map: dict[Path, str], tolerance: int) -> dict[str, list[Path]]:
    clusters: dict[str, list[Path]] = {}
    for img_path, h in hash_map.items():
        placed = False
        for rep_hash, imgs in clusters.items():
            dist = bin(int(h, 16) ^ int(rep_hash, 16)).count("1")
            if dist <= tolerance:
                imgs.append(img_path)
                placed = True
                break
        if not placed:
            clusters[h] = [img_path]
    return clusters

def main():
    if not CORPUS_ROOT.is_dir():
        print(f"❌ Corpus folder not found: {CORPUS_ROOT}")
        return

    print(f"🔎 Scanning {CORPUS_ROOT}")
    images = collect_images(CORPUS_ROOT)
    if not images:
        print("⚠️ No images discovered.")
        return

    print(f"📸 Found {len(images)} image files – hashing…")
    hash_map: dict[Path, str] = {}
    for img_path in tqdm(images, desc="Hashing"):
        try:
            hash_map[img_path] = hash_image(img_path)
        except Exception as e:
            print(f"⚠️ Failed to hash {img_path}: {e}")

    print(f"🔀 Clustering (tolerance={HASH_TOLERANCE})…")
    clusters = cluster_hashes(hash_map, HASH_TOLERANCE)

    # Build JSON that visualizer can fetch directly. The `src` attribute must be
    # relative to the visualizer folder, i.e. "../data/viz/<manuscript>/<file>".
    out = []
    for rep_hash, paths in clusters.items():
        out.append({
            "cluster_hash": rep_hash,
            "images": [
                {
                    "src": f"../{p.relative_to(PROJECT_ROOT).as_posix()}",
                    "manuscript_id": p.parent.name,
                    "filename": p.name
                }
                for p in paths
            ]
        })

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"✅ Wrote {len(out)} clusters to {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
