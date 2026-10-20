#!/usr/bin/env python3
"""
Extract all manuscript images, compute perceptual hashes, and cluster similar images.

The script scans the project's top‑level `images/` directory (where the scraped
manuscripts are stored), builds a JSON file `visualizer/visuals_clusters.json`
that the front‑end can consume.
"""

import os
import json
from pathlib import Path
from collections import defaultdict

from PIL import Image
import imagehash
from tqdm import tqdm

# ---------------------------------------------------------------------------
# CONFIGURATION – adjust only if your folder layout changes
# ---------------------------------------------------------------------------
# Root folder that contains a sub‑folder per manuscript (e.g. 990001314250205171_...)
CORPUS_ROOT = Path(__file__).parent / "images"

# Where the JSON will be written – inside the visualizer folder
OUTPUT_JSON = Path(__file__).parent / "visualizer" / "visuals_clusters.json"

# Maximum Hamming distance between two perceptual hashes to consider them the
# same cluster. 0 = identical hash, larger values allow near‑duplicates.
HASH_TOLERANCE = 5
# ---------------------------------------------------------------------------

def is_image(p: Path) -> bool:
    return p.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".tif", ".tiff"}

def collect_images(root: Path) -> list[Path]:
    return [p for p in root.rglob("*") if p.is_file() and is_image(p)]

def hash_image(img_path: Path) -> str:
    with Image.open(img_path) as img:
        img = img.convert("RGB")
        return str(imagehash.phash(img))

def cluster_hashes(hash_map: dict[Path, str], tolerance: int) -> dict[str, list[Path]]:
    clusters = {}
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
    hash_map = {}
    for img_path in tqdm(images, desc="Hashing"):
        try:
            hash_map[img_path] = hash_image(img_path)
        except Exception as e:
            print(f"⚠️ Failed to hash {img_path}: {e}")

    print(f"🔀 Clustering (tolerance={HASH_TOLERANCE})…")
    clusters = cluster_hashes(hash_map, HASH_TOLERANCE)

    # Build JSON that visualizer can fetch directly.  The `src` attribute must be
    # relative to the visualizer folder, i.e. "../images/<manuscript>/<file>".
    out = []
    for rep_hash, paths in clusters.items():
        out.append({
            "cluster_hash": rep_hash,
            "images": [
                {
                    "src": f"../images/{p.parent.name}/{p.name}",
                    "manuscript_id": p.parent.name,
                    "filename": p.name
                }
                for p in paths
            ]
        })

    OUTPUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"✅ Wrote {len(out)} clusters to {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
