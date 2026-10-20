#!/usr/bin/env python3
"""Run the illustration extractor on every manuscript subfolder.
Each subfolder in `images/` is treated as a separate corpus.
The extracted PNGs are written to `data/illustrations/<subfolder_name>/`.
"""

import sys
import pathlib
# Add project root to Python path so the package can be imported
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from illustrations_extractor import extract_illustrations

BASE_DIR = PROJECT_ROOT
IMAGES_ROOT = BASE_DIR / "images"
OUTPUT_ROOT = BASE_DIR / "data" / "illustrations"

for sub in sorted([d for d in IMAGES_ROOT.iterdir() if d.is_dir()]):
    out_dir = OUTPUT_ROOT / sub.name
    print(f"\nProcessing {sub.name} -> {out_dir}")
    try:
        extracted = extract_illustrations(
            input_dir=str(sub),
            output_dir=str(out_dir),
            confidence=0.4,
            min_area_ratio=0.003,
            max_area_ratio=0.5,
            device="cpu",
            use_contrast=False,
            debug=True,
        )
        print(f"Saved {len(extracted)} illustrations for {sub.name}")
    except FileNotFoundError as e:
        print(f"[INFO] Skipping {sub.name}: {e}")
    except Exception as e:
        print(f"[ERROR] Failed on {sub.name}: {e}")

print("\nAll done.")
