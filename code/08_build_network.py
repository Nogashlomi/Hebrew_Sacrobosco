#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
STEP 8 - Organise printed editions and manuscripts into one network of shared illustrations.

Data only; the visualizer (step 6) draws it.

Input:  data/print_corpus/print_images_clusters.csv   print images -> print cluster (SAC_SIL_...) + book (bid)
        data/print_corpus/print_books.csv              printed editions: title, authors, printers, place, year
        data/print_matches/print_matches.csv           (step 7) print cluster <-> manuscript illustration
        data/clusters/clusters.json                    (step 5) repeating groups among manuscript illustrations
        data/illustrations/illustrations[_reviewed].csv (step 4 / 4b) illustration -> manuscript record
        data/metadata/clean/visualizer_data.json       (step 3) codices, places (coordinates)
Output: data/network/
        nodes.csv        one row per book: node_id (P_<bid> | M_<codex_id>), kind, label, place, lat, lon, year, ...
        clusters.csv     one row per print cluster: cluster_id, image_file, keywords, n_print_books
        memberships.csv  which node contains which visual unit, the "bipartite" table everything else is derived from:
                         node_id, unit_id, unit_kind, n_images, tier, score
                         unit_kind = print_cluster (print book has images in that cluster, or a manuscript
                         illustration was matched to it in step 7, with tier/score) | ms_group (step-5 group)
        edges.csv        node pairs that share units: source, target, kind (print-print | print-ms | ms-ms),
                         shared (all units), shared_probable (manuscript matches of tier probable+ only),
                         shared_strong, units (semicolon list)
        network.json     nodes + clusters + memberships for the visualizer, which recomputes edges for its filters

Nodes are physical books: a printed edition (bid) or a manuscript codex (several catalogue records can
describe one codex; they are merged as in step 3). A manuscript's year is the catalogue year, or else the
middle of its century (year_source = "century"); its place is the first place of writing that has coordinates.

Usage:  python code/08_build_network.py
"""
import itertools
import json
import re
from collections import defaultdict

import pandas as pd

from paths import (illustrations_csv, PROJECT_ROOT, CLEAN_METADATA_DIR, ILLUSTRATIONS_DIR, CLUSTERS_DIR, PRINT_MATCHES_DIR,
                   PRINT_CLUSTERS_DIR, PRINT_CORPUS_DIR, NETWORK_DIR)

TIER_RANK = {"strong": 3, "probable": 2, "possible": 1}

# places of writing that step 3's place list has no coordinates for (lat, lon of the town; Tunisia = Tunis)
EXTRA_PLACES = {"Città di Castello (Italy)": (43.4575, 12.2404), "Livorno (Italy)": (43.5485, 10.3106),
                "Montagnana (Italy)": (45.2323, 11.4658), "Casale Monferrato (Italy)": (45.1336, 8.4520),
                "Urbino (Italy)": (43.7262, 12.6365), "Lʹviv (Ukraine)": (49.8397, 24.0297),
                "Tunisia": (36.8065, 10.1815), "Porcia (Italy)": (45.9636, 12.6169)}


def print_nodes_and_units():
    images = pd.read_csv(PRINT_CORPUS_DIR / "print_images_clusters.csv", low_memory=False)
    books = pd.read_csv(PRINT_CORPUS_DIR / "print_books.csv")
    coords = images.groupby("place")[["latitude", "longitude"]].first()

    keywords = (images.assign(ck=images["cks"].fillna("").str.replace("^CK_", "", regex=True))
                .groupby("cluster_name")["ck"].agg(lambda s: "; ".join(sorted({k for k in s if k}))))
    per_image = images.drop_duplicates("images")
    clusters = (per_image.groupby("cluster_name")
                .agg(n_images=("images", "size"), n_print_books=("bid", "nunique")).reset_index()
                .rename(columns={"cluster_name": "cluster_id"}))
    clusters["keywords"] = clusters["cluster_id"].map(keywords).fillna("")
    clusters["image_file"] = [f"{PRINT_CLUSTERS_DIR.relative_to(PROJECT_ROOT).as_posix()}/{c}.jpg" if (PRINT_CLUSTERS_DIR / f"{c}.jpg").exists() else ""
                              for c in clusters["cluster_id"]]

    n_images = per_image.groupby("bid")["images"].size()
    nodes = []
    for b in books.itertuples():
        place = b.place if isinstance(b.place, str) else ""
        nodes.append({"node_id": f"P_{b.bid}", "kind": "print", "label": b.label, "short_label": f"{place} {b.year}",
                      "place": place, "place_category": b.place_category,
                      "lat": coords.latitude.get(place), "lon": coords.longitude.get(place),
                      "year": int(b.year), "year_source": "imprint", "year_interval": b.year_interval,
                      "authors": b.authors, "makers": b.printers if isinstance(b.printers, str) else b.publishers,
                      "library": "", "link": b.book, "n_images": int(n_images.get(b.bid, 0))})

    units = (per_image.groupby(["bid", "cluster_name"]).size().reset_index(name="n_images"))
    memberships = [{"node_id": f"P_{r.bid}", "unit_id": r.cluster_name, "unit_kind": "print_cluster",
                    "n_images": int(r.n_images), "tier": "", "score": ""} for r in units.itertuples()]
    return nodes, clusters, memberships


def manuscript_nodes_and_units():
    meta = json.loads((CLEAN_METADATA_DIR / "visualizer_data.json").read_text(encoding="utf-8"))
    codex_of = {}
    for c in meta["codices"]:
        for r in c["records"]:
            codex_of[r] = c
    place_coords = {p["name"]: (p["lat"], p["lon"]) for p in meta["places"] if p["type"] == "writing"}
    place_coords.update(EXTRA_PLACES)
    ms_by_id = {m["mms_id"]: m for m in meta["manuscripts"]}

    ill = pd.read_csv(illustrations_csv(), dtype=str)
    ill["codex_id"] = [codex_of[m]["codex_id"] if m in codex_of else m for m in ill["mms_id"]]
    codex_of_ill = dict(zip(ill["illustration_id"], ill["codex_id"]))

    memberships = []
    matches = pd.read_csv(PRINT_MATCHES_DIR / "print_matches.csv")
    matches["codex_id"] = matches["illustration_id"].map(codex_of_ill)
    for (codex, cluster), g in matches.groupby(["codex_id", "print_id"]):
        best = g.loc[g["score"].idxmax()]
        memberships.append({"node_id": f"M_{codex}", "unit_id": cluster, "unit_kind": "print_cluster",
                            "n_images": len(g), "tier": best["tier"], "score": round(float(best["score"]), 4)})

    groups = json.loads((CLUSTERS_DIR / "clusters.json").read_text(encoding="utf-8"))["clusters"]
    for grp in groups:
        if not grp["label"].startswith("repeating"):
            continue
        per_codex = defaultdict(int)
        for iid in grp["illustration_ids"]:
            per_codex[codex_of_ill[iid]] += 1
        for codex, n in per_codex.items():
            memberships.append({"node_id": f"M_{codex}", "unit_id": f"MSG_{grp['cluster_id']}", "unit_kind": "ms_group",
                                "n_images": n, "tier": "", "score": ""})

    n_ill = ill[ill["class"] == "Content Illustration"].groupby("codex_id").size()
    nodes = []
    for codex_id in sorted({m["node_id"][2:] for m in memberships}):
        c = codex_of.get(codex_id)
        if c is None:          # illustration record without a codex: fall back to the catalogue record
            m = ms_by_id[codex_id]
            c = {"shelfmark": m["shelfmark"], "library": m["library"], "century": m["century"], "year": m["year"],
                 "place_writing": m["place_writing"], "title": m["title"], "image_record": codex_id}
        places = [p.strip() for p in (c.get("place_writing") or "").split("|") if p.strip()]
        # the first place of writing that has coordinates, else the first one
        place = next((p for p in places if p in place_coords), places[0] if places else "")
        year, source = c.get("year"), "catalogue"
        if not year:
            span = re.search(r"\((\d{4})\D+(\d{4})\)", c.get("century") or "")
            year, source = (round((int(span[1]) + int(span[2])) / 2), "century") if span else (None, "")
        lat, lon = place_coords.get(place, (None, None))
        nodes.append({"node_id": f"M_{codex_id}", "kind": "manuscript", "label": c.get("title", ""),
                      "short_label": c["shelfmark"].split(" | ")[0], "place": re.sub(r"\s*\([^()]*\)$", "", place),
                      "place_category": "", "lat": lat, "lon": lon, "year": year, "year_source": source,
                      "year_interval": "", "authors": "", "makers": c.get("script", ""),
                      "library": c.get("library", ""), "link": c.get("image_record", codex_id),
                      "n_images": int(n_ill.get(codex_id, 0))})
    return nodes, memberships


def edges_from(memberships):
    """Every pair of nodes that share a unit; counts per tier (print-print pairs are equal in all three)."""
    by_unit = defaultdict(list)
    for m in memberships:
        by_unit[m["unit_id"]].append(m)
    pairs = defaultdict(lambda: {"shared": 0, "shared_probable": 0, "shared_strong": 0, "units": []})
    for unit, members in by_unit.items():
        for a, b in itertools.combinations(sorted(members, key=lambda m: m["node_id"]), 2):
            rank = min(TIER_RANK.get(a["tier"], 3), TIER_RANK.get(b["tier"], 3))    # print side counts as certain
            e = pairs[(a["node_id"], b["node_id"])]
            e["shared"] += 1
            e["shared_probable"] += rank >= 2
            e["shared_strong"] += rank >= 3
            e["units"].append(unit)
    kinds = {"PP": "print-print", "MM": "ms-ms", "MP": "print-ms", "PM": "print-ms"}
    return [{"source": s, "target": t, "kind": kinds[s[0] + t[0]], **{k: v for k, v in e.items() if k != "units"},
             "units": ";".join(e["units"])} for (s, t), e in pairs.items()]


def main():
    NETWORK_DIR.mkdir(parents=True, exist_ok=True)
    p_nodes, clusters, p_members = print_nodes_and_units()
    m_nodes, m_members = manuscript_nodes_and_units()
    nodes = pd.DataFrame(p_nodes + m_nodes)
    memberships = p_members + m_members
    edges = pd.DataFrame(edges_from(memberships))

    nodes.to_csv(NETWORK_DIR / "nodes.csv", index=False, encoding="utf-8-sig")
    clusters.to_csv(NETWORK_DIR / "clusters.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(memberships).to_csv(NETWORK_DIR / "memberships.csv", index=False, encoding="utf-8-sig")
    edges.to_csv(NETWORK_DIR / "edges.csv", index=False, encoding="utf-8-sig")

    with (NETWORK_DIR / "network.json").open("w", encoding="utf-8") as f:
        json.dump({"nodes": json.loads(nodes.to_json(orient="records", force_ascii=False)),
                   "clusters": json.loads(clusters.to_json(orient="records", force_ascii=False)),
                   # compact: [node_id, unit_id, n_images, tier]
                   "memberships": [[m["node_id"], m["unit_id"], m["n_images"], m["tier"]] for m in memberships]},
                  f, ensure_ascii=False)

    counts = edges["kind"].value_counts().to_dict()
    print(f"{(nodes.kind == 'print').sum()} printed editions, {(nodes.kind == 'manuscript').sum()} manuscripts, "
          f"{len(memberships)} memberships, edges: {counts} -> {NETWORK_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
