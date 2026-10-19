#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the interactive Web Visualizer for the Hebrew Sacrobosco Manuscripts project.
Scans the CSV tables and the images/ folder, extracts prosopography, chronology, 
geography, and page manifests, and outputs visualizer/data.js and visualizer/index.html.
"""

import json
import re
import sys
from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_DIR = PROJECT_ROOT / "data" / "csv"
IMAGES_DIR = PROJECT_ROOT / "images"
VIS_DIR = PROJECT_ROOT / "visualizer"

VIS_DIR.mkdir(parents=True, exist_ok=True)

# Coordinates dictionary for historical places and library cities
COORDINATES = {
    # Places of writing / origin
    "Venice (Italy)": {"lat": 45.4408, "lon": 12.3155, "label": "Venice, Italy (ונציה)"},
    "Vienna (Austria)": {"lat": 48.2082, "lon": 16.3738, "label": "Vienna, Austria (וינה)"},
    "Prague (Czech Republic)": {"lat": 50.0755, "lon": 14.4378, "label": "Prague, Czech Republic (פראג)"},
    "Mantua (Italy)": {"lat": 45.1564, "lon": 10.7914, "label": "Mantua, Italy (מנטובה)"},
    "Mantua": {"lat": 45.1564, "lon": 10.7914, "label": "Mantua, Italy (מנטובה)"},
    "Thessalonikē (Greece)": {"lat": 40.6401, "lon": 22.9444, "label": "Thessaloniki, Greece (שאלוניקי)"},
    "Ascoli Piceno (Italy)": {"lat": 42.8548, "lon": 13.5750, "label": "Ascoli Piceno, Italy (אסקולי פיצ'נו)"},
    "Worms (Germany)": {"lat": 49.6341, "lon": 8.3615, "label": "Worms, Germany (וורמס)"},
    "Frankfurt (Oder) (Germany)": {"lat": 52.3424, "lon": 14.5505, "label": "Frankfurt (Oder), Germany (פרנקפורט דאודר)"},
    "Benevento (Italy)": {"lat": 41.1306, "lon": 14.7818, "label": "Benevento, Italy (בנוונטו)"},
    "Budapest (Hungary)": {"lat": 47.4979, "lon": 19.0402, "label": "Budapest, Hungary (בודפשט)"},
    "Nușeni (Romania)": {"lat": 47.1000, "lon": 24.3167, "label": "Nuşeni, Romania (נושני)"},
    "Krakow (Poland)": {"lat": 50.0647, "lon": 19.9450, "label": "Krakow, Poland (קרקוב)"},
    "Constantinople": {"lat": 41.0082, "lon": 28.9784, "label": "Constantinople / Istanbul (קושטא)"},
    "Rome (Italy)": {"lat": 41.9028, "lon": 12.4964, "label": "Rome, Italy (רומא)"},
    "Paris (France)": {"lat": 48.8566, "lon": 2.3522, "label": "Paris, France (פריז)"},
    
    # Holding library locations
    "Oxford": {"lat": 51.7520, "lon": -1.2577, "label": "Oxford, UK (Bodleian Library)"},
    "Paris": {"lat": 48.8566, "lon": 2.3522, "label": "Paris, France (BnF)"},
    "Jerusalem": {"lat": 31.7683, "lon": 35.2137, "label": "Jerusalem (National Library of Israel)"},
    "Moscow": {"lat": 55.7558, "lon": 37.6173, "label": "Moscow, Russia (Russian State Library)"},
    "New York, NY": {"lat": 40.7128, "lon": -74.0060, "label": "New York, NY (JTS / Columbia)"},
    "London": {"lat": 51.5074, "lon": -0.1278, "label": "London, UK (British Library)"},
    "Florence": {"lat": 43.7696, "lon": 11.2558, "label": "Florence, Italy (Biblioteca Medicea Laurenziana)"},
    "Munich": {"lat": 48.1351, "lon": 11.5820, "label": "Munich, Germany (Bayerische Staatsbibliothek)"},
    "Parma": {"lat": 44.8015, "lon": 10.3279, "label": "Parma, Italy (Biblioteca Palatina)"},
    "Berlin": {"lat": 52.5200, "lon": 13.4050, "label": "Berlin, Germany (Staatsbibliothek zu Berlin)"},
    "Cambridge": {"lat": 52.2053, "lon": 0.1218, "label": "Cambridge, UK (Cambridge University Library)"},
    "Vatican City": {"lat": 41.9029, "lon": 12.4534, "label": "Vatican City (Biblioteca Apostolica Vaticana)"},
    "St. Petersburg": {"lat": 59.9343, "lon": 30.3351, "label": "St. Petersburg, Russia (IOM / NLR)"},
    "Vienna": {"lat": 48.2082, "lon": 16.3738, "label": "Vienna, Austria (ÖNB)"},
    "Budapest": {"lat": 47.4979, "lon": 19.0402, "label": "Budapest, Hungary (HAS Library)"},
    "Leipzig": {"lat": 51.3397, "lon": 12.3731, "label": "Leipzig, Germany (Leipzig University)"},
    "Hamburg": {"lat": 53.5511, "lon": 9.9937, "label": "Hamburg, Germany (SUB Hamburg)"},
    "Frankfurt am Main": {"lat": 50.1109, "lon": 8.6821, "label": "Frankfurt am Main, Germany (UB Frankfurt)"},
    "Philadelphia, PA": {"lat": 39.9526, "lon": -75.1652, "label": "Philadelphia, PA (Katz Center / UPenn)"},
    "Amsterdam": {"lat": 52.3676, "lon": 4.9041, "label": "Amsterdam, Netherlands (Ets Haim)"},
}


def parse_century(date_str: str) -> str:
    """Classify date string into historical century buckets."""
    if not date_str or pd.isna(date_str):
        return "Unknown Era"
    s = str(date_str)
    
    # Check Gregorian years if present
    match_year = re.search(r'\((\d{4})\)', s)
    if match_year:
        yr = int(match_year.group(1))
        if yr <= 1400: return "14th Century (1301–1400)"
        if yr <= 1500: return "15th Century (1401–1500)"
        if yr <= 1600: return "16th Century (1501–1600)"
        if yr <= 1700: return "17th Century (1601–1700)"
        if yr <= 1800: return "18th Century (1701–1800)"
        return "19th Century (1801–1900)"
        
    # Check Hebrew century notations
    if 'י"ד' in s: return "14th Century (1301–1400)"
    if 'ט"ו' in s: return "15th Century (1401–1500)"
    if 'ט"ז' in s: return "16th Century (1501–1600)"
    if 'י"ז' in s: return "17th Century (1601–1700)"
    if 'י"ח' in s: return "18th Century (1701–1800)"
    if 'י"ט' in s: return "19th Century (1801–1900)"
    
    return "Unknown Era"


def extract_year(date_str: str):
    """Extract 4-digit Gregorian year if found."""
    if not date_str or pd.isna(date_str):
        return None
    match = re.search(r'\((\d{4})\)', str(date_str))
    return int(match.group(1)) if match else None


def clean_field(val):
    if pd.isna(val) or val is None:
        return ""
    return str(val).strip()


def build_data():
    print("Reading catalogue and image data...")
    ms_csv = CSV_DIR / "MANUSCRIPTS_ONLY.csv"
    if not ms_csv.exists():
        print("MANUSCRIPTS_ONLY.csv not found!")
        sys.exit(1)
        
    df = pd.read_csv(ms_csv, dtype=str)
    
    # Read page level metadata if present
    page_meta_csv = CSV_DIR / "PAGE_LEVEL_METADATA.csv"
    df_pages = pd.read_csv(page_meta_csv, dtype=str) if page_meta_csv.exists() else pd.DataFrame()
    
    # Index pages by MMS ID
    pages_by_mms = {}
    if not df_pages.empty:
        for mms_id, group in df_pages.groupby("mms_id"):
            pages_by_mms[str(mms_id)] = group.to_dict("records")
            
    # Also inspect images/ folder directly
    local_manuscript_dirs = {}
    if IMAGES_DIR.exists():
        for f in IMAGES_DIR.iterdir():
            if f.is_dir() and not f.name.startswith("."):
                mms_part = f.name.split("_")[0]
                local_manuscript_dirs[mms_part] = f
                
    # Also handle JTS_9121
    if (IMAGES_DIR / "JTS_9121").exists():
        local_manuscript_dirs["990000846580205171"] = IMAGES_DIR / "JTS_9121"
        
    manuscripts = []
    persons_map = {}
    places_writing_map = {}
    places_holding_map = {}
    queries_map = {}
    century_map = {}
    script_map = {}

    for _, row in df.iterrows():
        mms_id = clean_field(row.get("ms_mms_id"))
        if not mms_id:
            continue
            
        title = clean_field(row.get("ms_title"))
        author = clean_field(row.get("ms_author"))
        added_names = clean_field(row.get("ms_added_names"))
        date_place = clean_field(row.get("ms_date_place"))
        extent = clean_field(row.get("ms_extent"))
        notes = clean_field(row.get("ms_notes"))
        subjects = clean_field(row.get("ms_subjects"))
        script = clean_field(row.get("958$a")) or "Not Specified"
        colophon = clean_field(row.get("957$a"))
        shelfmark = clean_field(row.get("942$z")) or clean_field(row.get("090$a")) or "Shelfmark Not Recorded"
        library = clean_field(row.get("710$a")) or clean_field(row.get("942$a")) or "Library Unknown"
        library_city = clean_field(row.get("710$x"))
        place_writing = clean_field(row.get("751$a"))
        query_terms = [q.strip() for q in clean_field(row.get("query_terms")).split("|") if q.strip()]
        
        century = parse_century(date_place)
        year = extract_year(date_place)
        
        # Check local images
        has_images = mms_id in local_manuscript_dirs
        img_folder = ""
        img_list = []
        
        if has_images:
            folder_path = local_manuscript_dirs[mms_id]
            img_folder = f"images/{folder_path.name}"
            # Load page info
            if mms_id in pages_by_mms:
                for p in pages_by_mms[mms_id]:
                    img_list.append({
                        "file_name": p.get("file_name"),
                        "page_number": int(p.get("page_number", 1)),
                        "canvas_label": p.get("canvas_label", f"Page {p.get('page_number')}"),
                        "relative_path": f"{img_folder}/{p.get('file_name')}",
                        "width": p.get("width"),
                        "height": p.get("height")
                    })
            else:
                # Discover files directly in directory
                jpgs = sorted(folder_path.glob("*.jpg"))
                for i, jpg in enumerate(jpgs, 1):
                    img_list.append({
                        "file_name": jpg.name,
                        "page_number": i,
                        "canvas_label": f"Page {i}",
                        "relative_path": f"{img_folder}/{jpg.name}",
                        "width": None,
                        "height": None
                    })
                    
        ms_obj = {
            "mms_id": mms_id,
            "title": title,
            "author": author,
            "added_names": added_names,
            "shelfmark": shelfmark,
            "library": library,
            "library_city": library_city,
            "place_writing": place_writing,
            "date_place": date_place,
            "century": century,
            "year": year,
            "extent": extent,
            "script": script,
            "colophon": colophon,
            "notes": notes,
            "subjects": subjects,
            "query_terms": query_terms,
            "has_local_images": has_images,
            "image_folder": img_folder,
            "downloaded_pages_count": len(img_list),
            "pages": img_list,
            "manifest_url": f"https://iiif.nli.org.il/IIIFv21/{mms_id}/manifest",
            "ktiv_link": clean_field(row.get("ms_ktiv_link"))
        }
        
        manuscripts.append(ms_obj)
        
        # Aggregate Query Terms
        for q in query_terms:
            queries_map.setdefault(q, []).append(mms_id)
            
        # Aggregate Century
        century_map.setdefault(century, []).append(mms_id)
        
        # Aggregate Script
        for sc in script.split("|"):
            sc = sc.strip()
            if sc:
                script_map.setdefault(sc, []).append(mms_id)
                
        # Aggregate Persons (from author and added_names)
        raw_people = []
        if author:
            for a in author.split("|"):
                a = a.strip()
                if a and "PreferredLanguageHeading" not in a and a != "heb" and a != "lat":
                    raw_people.append((a, "Author"))
        if added_names:
            for an in added_names.split("|"):
                an = an.strip()
                if an and "PreferredLanguageHeading" not in an and an != "heb" and an != "lat":
                    role = "Associated Person / Owner"
                    if "מתרגם" in an or "translator" in an.lower():
                        role = "Translator"
                    elif "מעתיק" in an or "scribe" in an.lower():
                        role = "Scribe / Copyist"
                    elif "מפרש" in an or "commentator" in an.lower():
                        role = "Commentator"
                    raw_people.append((an, role))
                    
        for p_name, p_role in raw_people:
            # Clean name
            clean_name = re.sub(r'\b(מתרגם|מחבר|עורך|מעתיק|מפרש)\b', '', p_name).strip(' ,;')
            if len(clean_name) > 2:
                if clean_name not in persons_map:
                    persons_map[clean_name] = {
                        "name": clean_name,
                        "role": p_role,
                        "manuscripts": []
                    }
                persons_map[clean_name]["manuscripts"].append(mms_id)
                
        # Aggregate Places of Writing
        if place_writing:
            for pw in place_writing.split("|"):
                pw = pw.strip()
                if pw:
                    places_writing_map.setdefault(pw, []).append(mms_id)
                    
        # Aggregate Library Cities
        if library_city:
            for lc in library_city.split("|"):
                lc = lc.strip()
                if lc:
                    places_holding_map.setdefault(lc, []).append(mms_id)

    # Format map locations with coordinates
    map_places = []
    
    # 1. Places of writing
    for place_name, ms_ids in places_writing_map.items():
        coord = None
        for k, v in COORDINATES.items():
            if k.lower() in place_name.lower() or place_name.lower() in k.lower():
                coord = v
                break
        if coord:
            map_places.append({
                "type": "writing",
                "name": place_name,
                "label": coord["label"],
                "lat": coord["lat"],
                "lon": coord["lon"],
                "count": len(ms_ids),
                "manuscripts": ms_ids
            })
            
    # 2. Holding library cities
    for city_name, ms_ids in places_holding_map.items():
        coord = None
        for k, v in COORDINATES.items():
            if k.lower() in city_name.lower() or city_name.lower() in k.lower():
                coord = v
                break
        if coord:
            map_places.append({
                "type": "holding",
                "name": city_name,
                "label": coord["label"],
                "lat": coord["lat"],
                "lon": coord["lon"],
                "count": len(ms_ids),
                "manuscripts": ms_ids
            })

    # Convert persons to sorted list by frequency
    sorted_persons = sorted(
        [v for v in persons_map.values() if len(v["manuscripts"]) >= 1],
        key=lambda x: len(x["manuscripts"]),
        reverse=True
    )
    for p in sorted_persons:
        p["count"] = len(p["manuscripts"])

    output_data = {
        "stats": {
            "total_manuscripts": len(manuscripts),
            "downloaded_manuscripts": len([m for m in manuscripts if m["has_local_images"]]),
            "total_downloaded_pages": sum(m["downloaded_pages_count"] for m in manuscripts),
            "total_open_in_catalog": 148,
            "total_pages_in_catalog": 22150
        },
        "query_terms": {k: len(v) for k, v in queries_map.items()},
        "centuries": {k: len(v) for k, v in century_map.items()},
        "scripts": {k: len(v) for k, v in script_map.items()},
        "places": map_places,
        "persons": sorted_persons,
        "manuscripts": manuscripts
    }

    # Write visualizer/data.js
    data_js_path = VIS_DIR / "data.js"
    with open(data_js_path, "w", encoding="utf-8") as f:
        f.write("// Hebrew Sacrobosco Manuscripts Data Store\n")
        f.write("window.SPHAERA_DATA = ")
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"Generated {data_js_path} ({data_js_path.stat().st_size / 1024:.1f} KB)")
    print(f"  Total manuscripts: {len(manuscripts)}")
    print(f"  Manuscripts with images: {output_data['stats']['downloaded_manuscripts']}")
    print(f"  Pages indexed: {output_data['stats']['total_downloaded_pages']}")
    print(f"  Map locations: {len(map_places)}")
    print(f"  Persons indexed: {len(sorted_persons)}")


if __name__ == "__main__":
    build_data()
