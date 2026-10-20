# -*- coding: utf-8 -*-
"""Test extract_illustrations on a single manuscript folder and print results."""

import sys
import pathlib
# Add project root to Python path so the package can be imported
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.append(str(PROJECT_ROOT))

from illustrations_extractor import extract_illustrations

folder = pathlib.Path.cwd() / "images" / "990000463750205171_NLI_Ms._Heb._6694_28"
out_dir = pathlib.Path.cwd() / "data" / "illustrations" / folder.name

print(f"Input folder: {folder}")
print(f"Output folder: {out_dir}")

result = extract_illustrations(
    input_dir=str(folder),
    output_dir=str(out_dir),
    confidence=0.5,
    min_area_ratio=0.0005,
    max_area_ratio=0.5,
    device="cpu",
)

print(f"Returned {len(result)} file paths")
for p in result:
    print(p)
