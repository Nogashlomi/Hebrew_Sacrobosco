#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automatic illustration detection loop.
Runs `detect_illustrations.py` with decreasing thresholds until at least one
page is flagged as an illustration.

Usage:
    python auto_detect_illustrations.py
"""

import subprocess
import csv
import sys
from pathlib import Path
import time

PROJECT_ROOT = Path(__file__).resolve().parent
DETECT_SCRIPT = PROJECT_ROOT / "src" / "preprocessing" / "detect_illustrations.py"
CSV_PATH = PROJECT_ROOT / "data" / "csv" / "ILLUSTRATIONS_DETECTED.csv"

# thresholds to try (high to low)
thresholds = [0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1]

def run_detection(thresh: float) -> bool:
    """Run the detection script with the given threshold.
    Returns True if the script exits with code 0, else False."""
    cmd = ["python3", str(DETECT_SCRIPT), "--threshold", str(thresh)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[ERROR] detection failed (threshold={thresh})", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        return False
    return True

def count_illustrations() -> int:
    """Count rows where illustration column is True."""
    if not CSV_PATH.is_file():
        return 0
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return sum(1 for row in reader if row.get("illustration", "").strip().lower() == "true")

def main():
    for th in thresholds:
        print(f"[INFO] Running detection with threshold={th}")
        ok = run_detection(th)
        if not ok:
            continue
        # give a short pause for the file to be written
        time.sleep(0.5)
        cnt = count_illustrations()
        print(f"[INFO] Found {cnt} illustration(s) at threshold={th}")
        if cnt > 0:
            print(f"[SUCCESS] Illustrations detected with threshold={th}. CSV saved at {CSV_PATH}")
            # now copy them
            subprocess.run(["python3", str(PROJECT_ROOT / "src" / "preprocessing" / "extract_illustrations.py")])
            return
    print("[FAIL] No illustrations detected with any tested threshold.")

if __name__ == "__main__":
    main()
