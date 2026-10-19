#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Robust batch downloader for Hebrew Sacrobosco manuscripts from NLI / Ktiv.
Features:
- Polite to server (0.5s pause, sequential, timeout/retries).
- Resume support (skips already downloaded pages).
- Clean human-readable folder naming: images/{mms_id}_{safe_shelfmark}/
- Generates comprehensive metadata linkage:
  * metadata.json inside each manuscript folder
  * data/csv/MANUSCRIPTS_IMAGES_INDEX.csv (manuscript-level summary & folder path)
  * data/csv/PAGE_LEVEL_METADATA.csv (page-level image index with canvas labels)
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_DIR = PROJECT_ROOT / "data" / "csv"
IMAGES_DIR = PROJECT_ROOT / "images"

SLEEP_S = 0.5
WIDTH = 1200
TIMEOUT = 60

# Ensure directories exist
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
CSV_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str) -> str:
    """Create clean, safe directory/file names from Hebrew/Latin strings."""
    if not name:
        return "unnamed"
    clean = re.sub(r'[\\/*?:"<>|#=]', '_', name)
    clean = re.sub(r'\s+', '_', clean).strip('_')
    return clean[:40]


def get_library_code(lib_name: str) -> str:
    """Short code for famous manuscript libraries."""
    lib = (lib_name or "").lower()
    if "france" in lib or "bnf" in lib or "paris" in lib:
        return "BnF"
    if "bavarian" in lib or "munich" in lib:
        return "BSB"
    if "israel" in lib or "national library of israel" in lib:
        return "NLI"
    if "british" in lib:
        return "BL"
    if "russian state" in lib or "guenzburg" in lib:
        return "RSL"
    if "palatina" in lib or "parma" in lib:
        return "Palatina"
    if "theological" in lib or "jts" in lib:
        return "JTS"
    if "hebrew union" in lib or "huc" in lib:
        return "HUC"
    if "ets haim" in lib:
        return "EtsHaim"
    if "berlin" in lib:
        return "Berlin"
    if "hungarian" in lib:
        return "Budapest"
    if "oriental" in lib or "petersburg" in lib:
        return "IOM"
    if "vatican" in lib:
        return "Vatican"
    if "bodleian" in lib or "oxford" in lib:
        return "Bodleian"
    return sanitize_filename(lib_name)[:10]


def fetch_manifest(mms_id: str):
    """Fetch IIIF manifest testing direct endpoint first, then DOCID."""
    urls = [
        f"https://iiif.nli.org.il/IIIFv21/{mms_id}/manifest",
        f"https://iiif.nli.org.il/IIIFv21/DOCID/PNX_MANUSCRIPTS{mms_id}/manifest"
    ]
    for url in urls:
        try:
            r = requests.get(url, timeout=TIMEOUT)
            if r.status_code == 200:
                man = r.json()
                seq = man.get("sequences", [])
                if seq and len(seq) > 0 and "canvases" in seq[0] and seq[0]["canvases"]:
                    return url, man, seq[0]["canvases"]
                elif "items" in man and man["items"]:
                    return url, man, man["items"]
        except Exception:
            pass
    return None, None, []


def download_single_manuscript(record: dict, session: requests.Session):
    mms_id = str(record["mms_id"])
    title = str(record.get("ms_title", "") or record.get("title", ""))
    shelfmark_raw = str(record.get("942$z") or record.get("090$a") or "ms")
    # Take first shelfmark if multiple separated by |
    first_shelfmark = shelfmark_raw.split("|")[0].strip()
    lib_raw = str(record.get("710$a") or record.get("942$a") or record.get("library", "Unknown"))
    first_lib = lib_raw.split("|")[0].strip()
    lib_code = get_library_code(first_lib)
    safe_sm = sanitize_filename(first_shelfmark)

    folder_name = f"{mms_id}_{lib_code}_{safe_sm}"
    target_dir = IMAGES_DIR / folder_name
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n========================================================")
    print(f"Manuscript: {mms_id} | {lib_code}: {first_shelfmark}")
    print(f"Title:      {title[:60]}")
    print(f"Folder:     {target_dir.relative_to(PROJECT_ROOT)}")
    print(f"========================================================")

    manifest_url, manifest_json, canvases = fetch_manifest(mms_id)
    if not canvases:
        # Check parent record if applicable
        parent_id = record.get("773$w")
        if pd.notna(parent_id) and parent_id != "" and parent_id != mms_id:
            manifest_url, manifest_json, canvases = fetch_manifest(parent_id)

    if not canvases:
        print(f"No canvases found for {mms_id}. Skipping.")
        return None, []

    total_pages = len(canvases)
    print(f"Found {total_pages} pages in manifest.")

    page_rows = []
    saved_count = 0

    for i, cv in enumerate(canvases, 1):
        canvas_label = cv.get("label", f"Page {i}")
        file_name = f"{i:04d}.jpg"
        file_path = target_dir / file_name

        # Extract image service base URL
        base = None
        if "images" in cv and cv["images"]:
            svc = cv["images"][0]["resource"].get("service", {})
            svc = svc[0] if isinstance(svc, list) else svc
            base = svc.get("@id") or svc.get("id")
        elif "items" in cv and cv["items"]:
            body = cv["items"][0]["items"][0]["body"]
            s = body.get("service", [{}])[0]
            base = s.get("id") or s.get("@id")

        if not base:
            continue

        img_url = f"{base}/full/{WIDTH},/0/default.jpg"

        # Check if already downloaded
        if file_path.exists() and file_path.stat().st_size > 1000:
            saved_count += 1
        else:
            # Download with up to 3 retries
            for attempt in range(1, 4):
                try:
                    resp = session.get(img_url, timeout=TIMEOUT)
                    resp.raise_for_status()
                    file_path.write_bytes(resp.content)
                    saved_count += 1
                    break
                except Exception as e:
                    if attempt == 3:
                        print(f"  Error downloading page {i}: {e}")
                    time.sleep(1.0)
            time.sleep(SLEEP_S)

        if i % 25 == 0 or i == total_pages:
            print(f"  Progress: {i}/{total_pages} pages processed ({saved_count} saved)")

        page_rows.append({
            "mms_id": mms_id,
            "library_code": lib_code,
            "shelfmark": first_shelfmark,
            "page_number": i,
            "canvas_label": canvas_label,
            "file_name": file_name,
            "relative_path": str(file_path.relative_to(PROJECT_ROOT)),
            "width": cv.get("width"),
            "height": cv.get("height"),
            "iiif_image_url": img_url
        })

    def safe_str(val, max_len=None):
        if pd.isna(val) or val is None:
            return ""
        s = str(val).strip()
        return s[:max_len] if max_len else s

    # Save local metadata.json inside the manuscript folder
    meta_doc = {
        "mms_id": mms_id,
        "title": title,
        "shelfmark": first_shelfmark,
        "holding_library": first_lib,
        "library_code": lib_code,
        "date_place": safe_str(record.get("ms_date_place")),
        "script": safe_str(record.get("958$a")),
        "colophon": safe_str(record.get("957$a")),
        "total_pages": total_pages,
        "downloaded_pages": saved_count,
        "manifest_url": manifest_url,
        "folder_name": folder_name
    }
    with open(target_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta_doc, f, ensure_ascii=False, indent=2)

    ms_summary = {
        "mms_id": mms_id,
        "library_code": lib_code,
        "shelfmark": first_shelfmark,
        "title": title,
        "folder_path": f"images/{folder_name}",
        "total_canvases": total_pages,
        "downloaded_pages": saved_count,
        "manifest_url": manifest_url,
        "date_place": safe_str(record.get("ms_date_place")),
        "script": safe_str(record.get("958$a")),
        "colophon": safe_str(record.get("957$a"), 100)
    }

    return ms_summary, page_rows


def main():
    parser = argparse.ArgumentParser(description="Download open Hebrew Sacrobosco manuscripts.")
    parser.add_argument("--limit", type=int, default=None, help="Number of manuscripts to download.")
    parser.add_argument("--start", type=int, default=0, help="Start index (0-based).")
    args = parser.parse_args()

    # Load open manuscripts list and merge with full MARC metadata
    open_df = pd.read_csv(CSV_DIR / "ALL_OPEN_MANUSCRIPTS.csv", dtype=str)
    all_ms_df = pd.read_csv(CSV_DIR / "MANUSCRIPTS_ONLY.csv", dtype=str)

    # Merge to get all rich MARC columns
    merged = open_df.merge(all_ms_df, left_on="mms_id", right_on="ms_mms_id", how="left", suffixes=("", "_full"))

    # De-duplicate by MMS ID to ensure one folder per manuscript
    merged = merged.drop_duplicates(subset=["mms_id"]).reset_index(drop=True)

    total_available = len(merged)
    start_idx = args.start
    end_idx = start_idx + args.limit if args.limit else total_available
    subset = merged.iloc[start_idx:end_idx]

    print(f"\n========================================================")
    print(f"BATCH DOWNLOAD INITIATED")
    print(f"Total open manuscripts in catalog: {total_available}")
    print(f"Processing range: [{start_idx} to {end_idx-1}] ({len(subset)} manuscripts)")
    print(f"Image width: {WIDTH}px | Pause: {SLEEP_S}s")
    print(f"========================================================")

    index_csv = CSV_DIR / "MANUSCRIPTS_IMAGES_INDEX.csv"
    pages_csv = CSV_DIR / "PAGE_LEVEL_METADATA.csv"

    # Load existing indices if present
    existing_ms_summaries = pd.read_csv(index_csv).to_dict("records") if index_csv.exists() else []
    existing_pages = pd.read_csv(pages_csv).to_dict("records") if pages_csv.exists() else []

    seen_mms = {str(r["mms_id"]) for r in existing_ms_summaries}

    session = requests.Session()
    session.headers.update({
        "User-Agent": "HebrewSacroboscoResearch/1.0 (academic research; polite requester)"
    })

    for idx, (_, row) in enumerate(subset.iterrows(), 1):
        mms_id = str(row["mms_id"])
        print(f"\n>>> Processing [{idx}/{len(subset)}] MMS: {mms_id} <<<")
        ms_summary, page_rows = download_single_manuscript(row.to_dict(), session)

        if ms_summary:
            # Update index
            if mms_id in seen_mms:
                existing_ms_summaries = [s for s in existing_ms_summaries if str(s["mms_id"]) != mms_id]
            existing_ms_summaries.append(ms_summary)
            seen_mms.add(mms_id)

            # Update page level rows
            existing_pages = [p for p in existing_pages if str(p["mms_id"]) != mms_id]
            existing_pages.extend(page_rows)

            # Persist updated CSVs after each manuscript finishes
            pd.DataFrame(existing_ms_summaries).to_csv(index_csv, index=False, encoding="utf-8-sig")
            pd.DataFrame(existing_pages).to_csv(pages_csv, index=False, encoding="utf-8-sig")
            print(f"Updated index tables: {index_csv.name} and {pages_csv.name}")

    print(f"\n========================================================")
    print(f"BATCH FINISHED!")
    print(f"Total manuscripts indexed: {len(existing_ms_summaries)}")
    print(f"Total pages indexed:       {len(existing_pages)}")
    print(f"========================================================")


if __name__ == "__main__":
    main()
