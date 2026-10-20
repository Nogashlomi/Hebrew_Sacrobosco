# -*- coding: utf-8 -*-
"""
STEP 1 - Scrape manuscript metadata from Ktiv / the NLI Alma catalogue (SRU) by search terms.

Outputs:
  data/metadata/raw/marcxml/<term>__marcxml.xml   raw MARCXML per search term
  data/metadata/raw/ALL__deduped.csv              all unique records, one row per MMS ID
  data/metadata/raw/MANUSCRIPTS_ONLY.csv          only manuscripts (Leader/06 in t,d,f)
  data/metadata/raw/_SUMMARY.csv                  counts per search term

Harvest of Hebrew Sphaera manuscripts from the NLI Alma catalogue (SRU),
adapted from the example script (import_csv.txt).

What changed compared to the example:
  1. QUERIES instead of NAMES: search terms for the texts, commentaries and commentators.
  2. A manuscript filter (MARC Leader position 06) – so books/articles are separated out.
  3. Extra columns: Ktiv link and IIIF manifest URL for every record.
Everything else (SRU paging, MARC parsing, CSV writing) is the original code, slightly shortened.
"""
import csv
import re
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import requests
import xml.etree.ElementTree as ET

from paths import MARCXML_DIR, RAW_METADATA_DIR

# ---------------------------------------------------------------
# 1. Settings (same SRU address as in the example – it works)
# ---------------------------------------------------------------
ALMA_DOMAIN = "nli.alma.exlibrisgroup.com"
INSTITUTION_CODE = "972NNL_INST"
BASE_SRU = f"https://{ALMA_DOMAIN}/view/sru/{INSTITUTION_CODE}"

# Search terms. Hebrew and Latin spellings, because the catalogue uses both.
QUERIES = [
    "Sacrobosco",
    "סאקרו בוסקו",
    "מראה האופנים",
    "ספר הגלגל",
    "אשפירא",
    "אישפירא",
    "תבנית האישפירה",
    "אלמושנינו בית אלהים",
    "דלקרוט",
    "ליסקר",
]

MARC_NS = {"marc": "http://www.loc.gov/MARC21/slim"}
SRU_NS = {"sru": "http://www.loc.gov/zing/srw/"}
MAX_PER_REQUEST = 50
SLEEP_S = 0.5   # a bit slower than the example, to be gentle with the server

RAW_DIR = MARCXML_DIR
CSV_DIR = RAW_METADATA_DIR


# ---------------------------------------------------------------
# 2. SRU helpers (from the example)
# ---------------------------------------------------------------
def sru_search(cql: str, start: int, max_records: int) -> str:
    params = {"version": "1.2", "operation": "searchRetrieve", "query": cql,
              "recordSchema": "marcxml", "startRecord": str(start),
              "maximumRecords": str(max_records)}
    r = requests.get(BASE_SRU, params=params, timeout=120)
    r.raise_for_status()
    return r.text


def parse_total(xml_text: str) -> int:
    n = ET.fromstring(xml_text).find(".//sru:numberOfRecords", SRU_NS)
    return int(n.text) if n is not None and n.text else 0


def extract_marc_records(xml_text: str) -> List[ET.Element]:
    return ET.fromstring(xml_text).findall(".//marc:record", MARC_NS)


def harvest(term: str) -> Tuple[str, int, List[ET.Element]]:
    cql = f'alma.all_for_ui all "{term}"'
    first = sru_search(cql, 1, MAX_PER_REQUEST)
    total = parse_total(first)
    records = extract_marc_records(first)
    start = 1 + len(records)
    while len(records) < total:
        batch = extract_marc_records(sru_search(cql, start, MAX_PER_REQUEST))
        if not batch:
            break
        records.extend(batch)
        start += len(batch)
        time.sleep(SLEEP_S)
    return cql, total, records


# ---------------------------------------------------------------
# 3. MARC helpers
# ---------------------------------------------------------------
def control(rec: ET.Element, tag: str) -> str:
    cf = rec.find(f"marc:controlfield[@tag='{tag}']", MARC_NS)
    return (cf.text or "").strip() if cf is not None else ""


def leader(rec: ET.Element) -> str:
    ld = rec.find("marc:leader", MARC_NS)
    return ld.text if ld is not None and ld.text else ""


def is_manuscript(rec: ET.Element) -> bool:
    """
    MARC Leader position 06 = type of record.
    t = manuscript language material, d = manuscript music, f = manuscript map.
    To check on the first run: do all the Ktiv records really have 't'?
    """
    ld = leader(rec)
    return len(ld) > 6 and ld[6] in "tdf"


def subfields(df: ET.Element, codes: str = None) -> List[str]:
    out = []
    for sf in df.findall("marc:subfield", MARC_NS):
        if codes is None or sf.attrib.get("code") in codes:
            v = (sf.text or "").strip()
            if v:
                out.append(v)
    return out


def field_text(rec: ET.Element, tag: str, codes: str = None, sep: str = " ") -> List[str]:
    return [sep.join(subfields(df, codes)) for df in rec.findall(f"marc:datafield[@tag='{tag}']", MARC_NS)]


def marc_to_flat_dict(rec: ET.Element) -> Dict[str, str]:
    """
    (a) every MARC field as its own column: '245$a', '500$a', ... (as in the example)
    (b) a few readable 'ms_*' columns.
    """
    out: Dict[str, List[str]] = {}
    out["LDR"] = [leader(rec)]
    for cf in rec.findall("marc:controlfield", MARC_NS):
        out.setdefault(cf.attrib.get("tag", ""), []).append((cf.text or "").strip())
    for df in rec.findall("marc:datafield", MARC_NS):
        tag = df.attrib.get("tag")
        for sf in df.findall("marc:subfield", MARC_NS):
            code = sf.attrib.get("code")
            if tag and code:
                out.setdefault(f"{tag}${code}", []).append((sf.text or "").strip())
    flat = {k: " | ".join(v) for k, v in out.items()}

    mms = control(rec, "001")
    flat["ms_mms_id"] = mms
    flat["ms_is_manuscript"] = "yes" if is_manuscript(rec) else "no"
    flat["ms_title"] = " | ".join(field_text(rec, "245", "abnp"))
    flat["ms_author"] = " | ".join(field_text(rec, "100", "aqde"))
    flat["ms_added_names"] = " | ".join(field_text(rec, "700", "aqdet"))
    flat["ms_date_place"] = " | ".join(field_text(rec, "260") + field_text(rec, "264"))
    flat["ms_extent"] = " | ".join(field_text(rec, "300"))
    flat["ms_notes"] = " || ".join(field_text(rec, "500", "a"))
    flat["ms_subjects"] = " | ".join(field_text(rec, "650", "axyzv", " -- "))
    flat["ms_ktiv_link"] = ("https://www.nli.org.il/he/discover/manuscripts/hebrew-manuscripts/"
                            f"viewerpage?vid=MANUSCRIPTS&docid=PNX_MANUSCRIPTS{mms}") if mms else ""
    flat["ms_iiif_manifest"] = f"https://iiif.nli.org.il/IIIFv21/{mms}/manifest" if mms else ""
    return flat


# ---------------------------------------------------------------
# 4. Output (from the example)
# ---------------------------------------------------------------
def write_csv(rows: List[Dict[str, str]], path: Path) -> None:
    # put the readable columns first, then the raw MARC columns
    keys = sorted({k for r in rows for k in r})
    first = [k for k in keys if k.startswith("ms_") or k.startswith("query")]
    fieldnames = first + [k for k in keys if k not in first]
    with path.open("w", encoding="utf-8-sig", newline="") as f:   # utf-8-sig = Hebrew opens well in Excel
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def write_marcxml_collection(records: List[ET.Element], path: Path) -> None:
    root = ET.Element("collection", xmlns=MARC_NS["marc"])
    for r in records:
        root.append(r)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


# ---------------------------------------------------------------
# 5. Main harvest
# ---------------------------------------------------------------
def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    combined, summary, seen = [], [], {}
    for term in QUERIES:
        print(f"\nHarvesting: {term}")
        cql, total, recs = harvest(term)
        safe = re.sub(r"\W+", "_", term)
        write_marcxml_collection(recs, RAW_DIR / f"{safe}__marcxml.xml")
        n_ms = 0
        for rec in recs:
            row = marc_to_flat_dict(rec)
            n_ms += row["ms_is_manuscript"] == "yes"
            mms = row["ms_mms_id"]
            if mms in seen:                      # same record found by another query
                seen[mms]["query_terms"] += " | " + term
                continue
            row["query_terms"] = term
            seen[mms] = row
            combined.append(row)
        summary.append({"term": term, "cql": cql, "reported_total": total,
                        "downloaded": len(recs), "manuscripts": n_ms})
        print(f"  total: {total}  downloaded: {len(recs)}  manuscripts: {n_ms}")
        time.sleep(SLEEP_S)

    write_csv(combined, CSV_DIR / "ALL__deduped.csv")
    write_csv([r for r in combined if r["ms_is_manuscript"] == "yes"], CSV_DIR / "MANUSCRIPTS_ONLY.csv")
    write_csv(summary, CSV_DIR / "_SUMMARY.csv")
    print(f"\nDone. {len(combined)} unique records; MARCXML in {RAW_DIR}, CSV in {CSV_DIR}")


if __name__ == "__main__":
    main()
