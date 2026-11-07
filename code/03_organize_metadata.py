#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STEP 3 - Organize the metadata into what the visualizer needs.

Joins the catalogue with the page index and the downloaded folders, extracts people, centuries,
scripts and places (from the coordinate table below), and writes one clean JSON file.

Input:  data/metadata/raw/MANUSCRIPTS_ONLY.csv, PAGE_LEVEL_METADATA.csv, ALL_OPEN_MANUSCRIPTS.csv,
        MANUSCRIPTS_IMAGES_INDEX.csv (same_codex_as: records that share a downloaded codex)
        data/manuscripts/
Output: data/metadata/clean/visualizer_data.json
        (incl. subject_tags: Ktiv subjects from the 500 "נושא נוסף" note and LC subjects, counted per codex)
"""

import json
import re
import sys
from pathlib import Path
import pandas as pd

from paths import PROJECT_ROOT, RAW_METADATA_DIR as CSV_DIR, MANUSCRIPTS_DIR as IMAGES_DIR, CLEAN_METADATA_DIR, \
    MARCXML_DIR, METADATA_DIR
import xml.etree.ElementTree as ET

# hand-curated places where a person lived or worked (the catalogue does not record them); edit freely
PERSON_PLACES_CSV = METADATA_DIR / "person_places.csv"

OUTPUT_JSON = CLEAN_METADATA_DIR / "visualizer_data.json"

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
    "Città di Castello (Italy)": {"lat": 43.4575, "lon": 12.2404, "label": "Città di Castello, Italy"},
    "Livorno (Italy)": {"lat": 43.5485, "lon": 10.3106, "label": "Livorno, Italy (ליוורנו)"},
    "Montagnana (Italy)": {"lat": 45.2323, "lon": 11.4658, "label": "Montagnana, Italy (מונטניאנה)"},
    "Casale Monferrato (Italy)": {"lat": 45.1336, "lon": 8.4520, "label": "Casale Monferrato, Italy"},
    "Urbino (Italy)": {"lat": 43.7262, "lon": 12.6365, "label": "Urbino, Italy (אורבינו)"},
    "Lʹviv (Ukraine)": {"lat": 49.8397, "lon": 24.0297, "label": "Lviv, Ukraine (למברג)"},
    "Porcia (Italy)": {"lat": 45.9636, "lon": 12.6169, "label": "Porcia, Italy"},
    "Tunisia": {"lat": 36.8065, "lon": 10.1815, "label": "Tunisia (Tunis)"},
    
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
    "Cambridge, MA": {"lat": 42.3736, "lon": -71.1097, "label": "Cambridge, MA (Harvard)"},
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


def coord_for(name: str):
    """Coordinates for a place name: exact key, or the same city with/without "(Country)".
    No loose substring matching, so a region ("Italy") is not placed on a city."""
    name = (name or "").strip()
    if name in COORDINATES:
        return COORDINATES[name]
    city = name.split(" (")[0].strip()
    for k, v in COORDINATES.items():
        if "," not in name and k.split(" (")[0].strip() == city:
            return v
    return None


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


def normalize_text_title(title: str):
    """'מראה האופנים (קטע).' -> ('מראה האופנים', True). Returns (None, False) for miscellany titles."""
    t = re.sub(r"[\s.:;,/]+$", "", title.strip())
    fragment = "קטע" in t
    t = re.sub(r"\s*\([^)]*\)", "", t).strip(" .:;,")
    if not t or t.startswith(("קובץ", "קבץ")):
        return None, False
    return t, fragment


def build_codices_and_texts(manuscripts, index_csv):
    """Group catalogue records into physical manuscripts (codices) and list the texts each contains.

    Records belong to one codex when one is the parent volume of the other (MARC 773$w), when they share
    downloaded page images (step 2's same_codex_as), or when they have the same library and shelfmark.
    Texts come from each record's own title (a work inside the volume) and its added titles (MARC 740$a);
    miscellany titles ('קובץ ...') describe the volume, not a text.
    """
    parent = {m["mms_id"]: m["mms_id"] for m in manuscripts}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    by_mark = {}
    for m in manuscripts:
        if m["parent_mms"] and m["parent_mms"] != m["mms_id"]:
            union(m["parent_mms"], m["mms_id"])
        mark = (m["library"].split("|")[0].strip(), m["shelfmark"].split("|")[0].strip())
        if mark[1] and mark[1] != "Shelfmark Not Recorded":
            if mark in by_mark:
                union(by_mark[mark], m["mms_id"])
            else:
                by_mark[mark] = m["mms_id"]
    if index_csv.exists():
        idx = pd.read_csv(index_csv, dtype=str).fillna("")
        if "same_codex_as" in idx.columns:
            for _, r in idx[idx["same_codex_as"] != ""].iterrows():
                union(r["same_codex_as"], r["mms_id"])

    groups = {}
    for m in manuscripts:
        groups.setdefault(find(m["mms_id"]), []).append(m)

    codices, texts = [], {}
    for members in groups.values():
        # the volume record (no parent of its own) describes the codex best; else the first record
        main = next((m for m in members if not m["parent_mms"]), members[0])
        codex_id = main["mms_id"]
        years = [m["year"] for m in members if m["year"]]
        centuries = [m["century"] for m in members if m["century"] and m["century"] != "Unknown Era"]
        with_images = next((m for m in members if m["has_local_images"]), None)
        codex_texts = {}
        for m in members:
            m["codex_id"] = codex_id
            for raw in [m["title"]] + m["added_titles"]:
                name, fragment = normalize_text_title(raw)
                if name:
                    entry = codex_texts.setdefault(name, {"title": name, "fragment": fragment, "records": []})
                    entry["fragment"] = entry["fragment"] and fragment
                    if m["mms_id"] not in entry["records"]:
                        entry["records"].append(m["mms_id"])
        codices.append({
            "codex_id": codex_id,
            "shelfmark": main["shelfmark"].split("|")[0].strip(),
            "library": main["library"].split("|")[0].strip(),
            "library_city": main["library_city"],
            "title": main["title"],
            "century": centuries[0] if centuries else "Unknown Era",
            "year": min(years) if years else None,
            "place_writing": next((m["place_writing"] for m in members if m["place_writing"]), ""),
            "script": next((m["script"] for m in members if m["script"] and m["script"] != "Not Specified"), ""),
            "records": [m["mms_id"] for m in members],
            "has_images": with_images is not None,
            "image_record": with_images["mms_id"] if with_images else "",
            "texts": sorted(codex_texts),
            "contents": next((m["contents"] for m in members if m["contents"]), ""),
        })
        for name, entry in codex_texts.items():
            t = texts.setdefault(name, {"title": name, "codices": [], "fragment_in": []})
            t["codices"].append(codex_id)
            if entry["fragment"]:
                t["fragment_in"].append(codex_id)

    text_list = sorted(texts.values(), key=lambda t: (-len(t["codices"]), t["title"]))
    for t in text_list:
        t["count"] = len(t["codices"])
    codices.sort(key=lambda c: (c["year"] or 9999, c["shelfmark"]))
    return codices, text_list


def _ktiv_levels(heading: str):
    """Ktiv heading 'A. B. C' -> ['A', 'A. B']: the full two-level heading and its top level."""
    heading = heading.strip().rstrip(".").strip()
    dated = re.match(r"^(\D+?)\s+\d{4}$", heading)      # "צנזורה 1618" -> also "צנזורה"
    if dated:
        return [dated.group(1), heading]
    parts = [x.strip() for x in heading.split(". ") if x.strip()]
    return [". ".join(parts[:i]) for i in range(1, min(2, len(parts)) + 1)]


def build_subject_tags(manuscripts, codices):
    """Subject tags per physical manuscript, as in the manuscript_context project.

    Ktiv subjects come from the 500 note "נושא נוסף: A. B; C" (each heading and its top level, so
    "מדעים. אסטרונומיה" also counts under "מדעים"); LC subjects from MARC 650 (the "subjects" field).
    A codex carries a tag when any of its catalogue records does. Adds ktiv_subjects / lc_subjects to
    each codex and returns [{tag, source, top, parent, codices, records, count}] sorted by count.
    """
    tags = {}
    by_codex = {}
    for m in manuscripts:
        found = []
        for note in (m["notes"] or "").split("||"):
            note = note.strip()
            if note.startswith("נושא נוסף"):
                for heading in note.split(":", 1)[-1].split(";"):
                    found += [("Ktiv", level) for level in _ktiv_levels(heading)]
        for subject in (m["subjects"] or "").split("|"):
            if subject.strip():
                found.append(("LC", subject.strip()))
        for source, tag in found:
            parent = ""
            if source == "Ktiv":
                levels = _ktiv_levels(tag)
                parent = levels[0] if len(levels) > 1 else ""
            t = tags.setdefault((source, tag), {"tag": tag, "source": source, "top": not parent, "parent": parent,
                                                "codices": [], "records": []})
            if m["mms_id"] not in t["records"]:
                t["records"].append(m["mms_id"])
            if m["codex_id"] not in t["codices"]:
                t["codices"].append(m["codex_id"])
            by_codex.setdefault(m["codex_id"], set()).add((source, tag))
    for c in codices:
        own = by_codex.get(c["codex_id"], set())
        c["ktiv_subjects"] = sorted(t for s, t in own if s == "Ktiv")
        c["lc_subjects"] = sorted(t for s, t in own if s == "LC")
    out = sorted(tags.values(), key=lambda t: (t["source"], -len(t["codices"]), t["tag"]))
    for t in out:
        t["count"] = len(t["codices"])
    return out


def build_funnel(codices, n_records, queries_map, index_csv):
    """Home-page counts, from the searches down to what is on disk, counted per physical manuscript.

    Each catalogue record has an image status from step 2 (MANUSCRIPTS_IMAGES_INDEX.csv):
    complete = open IIIF images, downloaded here; restricted = digitized, but Ktiv does not serve the images
    openly; no_pages_in_manifest = no images. A codex takes the best status of its records; it also gets
    image_status ("open" | "restricted" | "none") and image_pages (pages of its digitized copy).
    """
    found = CSV_DIR / "ALL__deduped.csv"
    n_found = len(pd.read_csv(found, usecols=[0])) if found.exists() else None
    status, pages = {}, {}
    if index_csv.exists():
        idx = pd.read_csv(index_csv, dtype=str).fillna("")
        rank = {"complete": 3, "restricted": 2, "no_pages_in_manifest": 1}
        codex_of = {r: c["codex_id"] for c in codices for r in c["records"]}
        for r in idx.itertuples():
            cid = codex_of.get(r.mms_id)
            if not cid:
                continue
            if rank.get(r.status, 0) > rank.get(status.get(cid, ""), 0):
                status[cid] = r.status
            n = pd.to_numeric(r.downloaded_pages if r.status == "complete" else r.total_canvases, errors="coerce")
            if r.status in ("complete", "restricted") and not r.same_codex_as and n == n:
                pages[cid] = pages.get(cid, 0) + int(n)
    name = {"complete": "open", "restricted": "restricted"}
    for c in codices:
        c["image_status"] = name.get(status.get(c["codex_id"], ""), "none")
        c["image_pages"] = pages.get(c["codex_id"], 0)
    count = lambda st: sum(c["image_status"] == st for c in codices)
    pages_of = lambda st: sum(c["image_pages"] for c in codices if c["image_status"] == st)
    return {
        "search_terms": len(queries_map),
        "records_found": n_found,                      # every record the searches returned (incl. printed books)
        "manuscript_records": n_records,
        "physical_manuscripts": len(codices),
        "digitized": count("open") + count("restricted"),
        "open": count("open"), "open_pages": pages_of("open"),
        "restricted": count("restricted"), "restricted_pages": pages_of("restricted"),
        "not_digitized": count("none"),
        "downloaded": sum(c["has_images"] for c in codices),
    }


# MARC $e (relator) -> role; 100 without $e = author, 600 = person as subject
ROLE_OF = {"מחבר": "Author", "מחבר משוער": "Author", "מיוחס לו": "Author (attributed)",
           "מתרגם": "Translator", "מעתיק": "Scribe", "מעתיק משוער": "Scribe",
           "בעלים קודמים": "Former owner", "former owner": "Former owner", "censor": "Censor",
           "ממנו": "Excerpts by", "ממנו?": "Excerpts by", "מוזכר": "Mentioned", "מעיר": "Annotator",
           "חותם": "Signatory", "מלקט": "Compiler", "אליו": "Addressee"}
ROLE_ORDER = ["Author", "Author (attributed)", "Translator", "Scribe", "Annotator", "Compiler", "Former owner",
              "Censor", "Signatory", "Addressee", "Author of an included text", "Excerpts by", "Mentioned",
              "Subject", "Other"]
MARC = "{http://www.loc.gov/MARC21/slim}"


def parse_life_dates(d: str):
    """MARC $d -> (born, died, floruit_from, floruit_to); BCE years negative, None where unknown."""
    d = (d or "").strip().rstrip(".")
    bce = 'לפנה"ס' in d or "B.C" in d
    sign = -1 if bce else 1
    cent = re.search(r"(\d{1,2})(?:th|st|nd|rd) cent|במאה ה-?(\d{1,2})", d)
    if cent:
        c = int(cent.group(1) or cent.group(2))
        return None, None, (c - 1) * 100, (c - 1) * 100 + 99
    died = re.search(r"נפטר\D*(\d{3,4})|d\.\s*(\d{3,4})", d)
    if died:
        return None, sign * int(died.group(1) or died.group(2)), None, None
    years = re.findall(r"\d{3,4}", d)
    if len(years) >= 2:
        return sign * int(years[0]), sign * int(years[1]), None, None
    if len(years) == 1 and "-" in d:
        return (sign * int(years[0]), None, None, None) if d.find(years[0]) < d.find("-") else (None, sign * int(years[0]), None, None)
    return None, None, None, None


def build_persons(manuscripts, codices):
    """Persons from the MARC name fields (100/700/600) of the manuscript records.

    Name = $a (+ $c), dates = $d, role = $e (see ROLE_OF); a 700 with a title ($t) and no role is the author
    of a text inside the codex. Holding libraries (710 "current owner") are skipped. For every person:
    life dates (born/died, or a floruit century), their roles, their codices with each codex's date and
    place of writing, and any hand-curated place of activity from person_places.csv.
    """
    ids = {m["mms_id"] for m in manuscripts}
    codex_of = {r: c for c in codices for r in c["records"]}
    curated = pd.read_csv(PERSON_PLACES_CSV, dtype=str).fillna("") if PERSON_PLACES_CSV.exists() else pd.DataFrame()
    people, seen = {}, set()
    for f in sorted(MARCXML_DIR.glob("*.xml")):
        for rec in ET.parse(f).iter(MARC + "record"):
            mms = next((c.text for c in rec.iter(MARC + "controlfield") if c.get("tag") == "001"), None)
            if mms not in ids or mms in seen:
                continue
            seen.add(mms)
            for df in rec.iter(MARC + "datafield"):
                tag = df.get("tag")
                if tag not in ("100", "700", "600"):
                    continue
                sub = {}
                for sf in df.findall(MARC + "subfield"):
                    sub.setdefault(sf.get("code"), []).append((sf.text or "").strip())
                name = " ".join(x.strip(" ,.;:") for x in sub.get("a", [])[:1] + sub.get("c", [])[:1] if x).strip()
                if not name:
                    continue
                relator = (sub.get("e") or [""])[0].strip(" .,()")
                if tag == "600":
                    role = "Subject"
                elif relator:
                    role = ROLE_OF.get(relator, "Other")
                elif tag == "100":
                    role = "Author"
                elif sub.get("t"):
                    role = "Author of an included text"
                else:
                    role = "Other"
                dates = (sub.get("d") or [""])[0].strip(" .,")
                key = (name, dates)
                p = people.setdefault(key, {"name": name, "dates": dates, "roles": {}, "records": []})
                p["roles"].setdefault(role, [])
                if mms not in p["roles"][role]:
                    p["roles"][role].append(mms)
                if mms not in p["records"]:
                    p["records"].append(mms)

    out = []
    for p in people.values():
        born, died, fl_from, fl_to = parse_life_dates(p["dates"])
        role = min(p["roles"], key=lambda r: (ROLE_ORDER.index(r), -len(p["roles"][r])))
        codex_ids = list(dict.fromkeys(codex_of[r]["codex_id"] for r in p["records"] if r in codex_of))
        ms_items = []
        for cid in codex_ids:
            c = next(c for c in codices if c["codex_id"] == cid)
            year, approx = c.get("year"), False
            if not year:
                span = re.search(r"\((\d{4})\D+(\d{4})\)", c.get("century") or "")
                year, approx = (round((int(span[1]) + int(span[2])) / 2), True) if span else (None, False)
            places = [x.strip() for x in (c.get("place_writing") or "").split("|") if x.strip()]
            place = next((x for x in places if coord_for(x)), places[0] if places else "")
            coord = coord_for(place) if place else None
            ms_items.append({"codex_id": cid, "shelfmark": c["shelfmark"], "year": year, "year_approx": approx,
                             "place": re.sub(r"\s*\([^()]*\)$", "", place),
                             "lat": coord["lat"] if coord else None, "lon": coord["lon"] if coord else None,
                             "roles": sorted({r for r, recs in p["roles"].items() if any(codex_of.get(x, {}).get("codex_id") == cid for x in recs)})})
        known = []
        for row in curated.itertuples() if len(curated) else []:
            if row.name_starts_with and p["name"].startswith(row.name_starts_with):
                known.append({"place": row.place, "lat": float(row.lat), "lon": float(row.lon),
                              "from": int(float(row._5)) if row._5 else None, "to": int(float(row.to)) if row.to else None,
                              "kind": row.kind, "source": row.source, "note": row.note})
        out.append({"name": p["name"], "dates": p["dates"], "born": born, "died": died,
                    "floruit_from": fl_from, "floruit_to": fl_to, "role": role,
                    "roles": {r: len(v) for r, v in p["roles"].items()},
                    "manuscripts": p["records"], "codices": codex_ids, "count": len(codex_ids),
                    "ms": ms_items, "known_places": known})
    out.sort(key=lambda x: (-x["count"], x["name"]))
    return out


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
            
    # Also inspect data/manuscripts/ directly (folder names start with the MMS ID)
    local_manuscript_dirs = {}
    if IMAGES_DIR.exists():
        for f in IMAGES_DIR.iterdir():
            if f.is_dir() and not f.name.startswith("."):
                mms_part = f.name.split("_")[0]
                local_manuscript_dirs[mms_part] = f

    # Records that share a codex with a downloaded record (step 2's same_codex_as) use its folder and pages
    index_csv = CSV_DIR / "MANUSCRIPTS_IMAGES_INDEX.csv"
    if index_csv.exists():
        df_index = pd.read_csv(index_csv, dtype=str).fillna("")
        if "same_codex_as" in df_index.columns:
            for _, r in df_index[df_index["same_codex_as"] != ""].iterrows():
                owner = r["same_codex_as"]
                if owner in local_manuscript_dirs:
                    local_manuscript_dirs[r["mms_id"]] = local_manuscript_dirs[owner]
                    pages_by_mms[r["mms_id"]] = pages_by_mms.get(owner, [])

        
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
            img_folder = folder_path.relative_to(PROJECT_ROOT).as_posix()
            # Load page info
            if mms_id in pages_by_mms:
                for p in pages_by_mms[mms_id]:
                    if not (folder_path / str(p.get("file_name"))).exists():
                        continue  # listed in the manifest but the download failed
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
            "has_local_images": len(img_list) > 0,
            "image_folder": img_folder,
            "downloaded_pages_count": len(img_list),
            "pages": img_list,
            "manifest_url": f"https://iiif.nli.org.il/IIIFv21/{mms_id}/manifest",
            "ktiv_link": clean_field(row.get("ms_ktiv_link")),
            "parent_mms": clean_field(row.get("773$w")).split("|")[0].strip(),
            "added_titles": [t.strip() for t in clean_field(row.get("740$a")).split("|") if t.strip()],
            "contents": clean_field(row.get("505$a"))
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

    open_df = pd.read_csv(CSV_DIR / "ALL_OPEN_MANUSCRIPTS.csv", dtype=str).drop_duplicates("mms_id")

    # Physical books: catalogue records that share a codex (same_codex_as) are counted once
    books_df = pd.DataFrame()
    index_csv = CSV_DIR / "MANUSCRIPTS_IMAGES_INDEX.csv"
    if index_csv.exists():
        books_df = pd.read_csv(index_csv, dtype=str).fillna("")
        if "status" in books_df.columns:   # step 2 checks every record live: count those with pages in Ktiv
            open_df = books_df[books_df["status"] != "no_pages_in_manifest"].rename(columns={"total_canvases": "canvases"})
        if "same_codex_as" in books_df.columns:
            books_df = books_df[books_df["same_codex_as"] == ""]
        if "status" in books_df.columns:
            books_df = books_df[books_df["status"] != "no_pages_in_manifest"]
    def book_pages(df, col):
        return int(pd.to_numeric(df[col], errors="coerce").sum()) if not df.empty else 0
    downloaded_books = books_df[books_df["status"] == "complete"] if "status" in books_df.columns else books_df

    # Format map locations with coordinates
    map_places = []
    
    # 1. Places of writing
    for place_name, ms_ids in places_writing_map.items():
        coord = coord_for(place_name)
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
        coord = coord_for(city_name)
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

    codices, texts = build_codices_and_texts(manuscripts, CSV_DIR / "MANUSCRIPTS_IMAGES_INDEX.csv")
    subject_tags = build_subject_tags(manuscripts, codices)
    persons = build_persons(manuscripts, codices)
    funnel = build_funnel(codices, len(manuscripts), queries_map, index_csv)

    output_data = {
        "stats": {
            "physical_manuscripts": len(codices),
            "distinct_texts": len(texts),
            "total_manuscripts": len(manuscripts),
            "downloaded_manuscripts": len([m for m in manuscripts if m["has_local_images"]]),
            "total_downloaded_pages": sum(m["downloaded_pages_count"] for m in manuscripts),
            "total_open_in_catalog": int(open_df["mms_id"].nunique()),
            "total_pages_in_catalog": int(pd.to_numeric(open_df["canvases"], errors="coerce").sum()),
            "open_books": len(books_df),
            "open_book_pages": book_pages(books_df, "total_canvases"),
            "downloaded_books": len(downloaded_books),
            "downloaded_book_pages": book_pages(downloaded_books, "downloaded_pages")
        },
        "funnel": funnel,
        "query_terms": {k: len(v) for k, v in queries_map.items()},
        "centuries": {k: len(v) for k, v in century_map.items()},
        "scripts": {k: len(v) for k, v in script_map.items()},
        "places": map_places,
        "persons": persons,
        "manuscripts": manuscripts,
        "codices": codices,
        "texts": texts,
        "subject_tags": subject_tags
    }

    CLEAN_METADATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"Generated {OUTPUT_JSON.relative_to(PROJECT_ROOT)} ({OUTPUT_JSON.stat().st_size / 1024:.1f} KB)")
    print(f"  Total manuscripts: {len(manuscripts)}")
    print(f"  Manuscripts with images: {output_data['stats']['downloaded_manuscripts']}")
    print(f"  Pages indexed: {output_data['stats']['total_downloaded_pages']}")
    print(f"  Map locations: {len(map_places)}")
    print(f"  Persons: {len(persons)} ({sum(1 for p in persons if p['born'] or p['died'] or p['floruit_from'] is not None)} with life dates, "
          f"{sum(1 for p in persons if p['known_places'])} with a curated place)")
    print(f"  Physical manuscripts: {len(codices)} | distinct texts: {len(texts)} | subject tags: "
          f"{sum(t['source'] == 'Ktiv' for t in subject_tags)} Ktiv, {sum(t['source'] == 'LC' for t in subject_tags)} LC")


if __name__ == "__main__":
    build_data()
