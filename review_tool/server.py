#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Review tool: check the illustration extraction and the clustering by hand, then rebuild the visualizer.

Run:   python review_tool/server.py             then open http://localhost:8766
       (standard library only, plus Pillow/numpy/pandas from requirements.txt)

1. Extraction - go through the manuscripts one by one: mark wrong detections, correct a class, draw boxes the
   detector missed, tick pages and manuscripts as checked.        -> data/review/extraction_review.json
2. Clusters - browse the computational clusters of step 5 (read only) and pick diagrams from them.
3. Groups - your own named groups: build them from clusters, from "similar" suggestions or one by one,
   name and describe them. A diagram can be in any number of groups; the rest is "not grouped".
                                                                   -> data/review/groups.json
"Apply & rebuild" runs steps 4b, 5, 7, 8 and 6, so the visualizer shows the reviewed data and your groups.

Every change is saved at once; the previous version of the file goes to data/review/history/ (Undo).
"""
import hashlib
import json
import mimetypes
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np
import pandas as pd
from PIL import Image

CODE_DIR = Path(__file__).resolve().parent.parent / "code"
sys.path.insert(0, str(CODE_DIR))
from paths import (PROJECT_ROOT, DATA_DIR, MANUSCRIPTS_DIR, CLUSTERS_DIR, CLEAN_METADATA_DIR, REVIEW_DIR,  # noqa: E402
                   EXTRACTION_REVIEW_JSON, GROUPS_JSON, EMBEDDINGS_NPZ, ILLUSTRATIONS_DETECTED_CSV)

import os  # noqa: E402

PORT = int(os.environ.get("REVIEW_PORT", 8766))
# REVIEW_TEST_DIR: keep decisions in another folder (for trying the tool without touching the real review)
if os.environ.get("REVIEW_TEST_DIR"):
    REVIEW_DIR = Path(os.environ["REVIEW_TEST_DIR"])
    EXTRACTION_REVIEW_JSON = REVIEW_DIR / "extraction_review.json"
    GROUPS_JSON = REVIEW_DIR / "groups.json"
STATIC_DIR = Path(__file__).resolve().parent / "static"
THUMB_DIR = REVIEW_DIR / "thumbs"
HISTORY_DIR = REVIEW_DIR / "history"
HISTORY_KEEP = 200  # undo steps kept on disk
CLASSES = ["Content Illustration", "Table", "Decoration", "Initial", "Printer's Mark"]
DIAGRAM = "Content Illustration"
REBUILD_STEPS = ["04b_apply_extraction_review.py", "05_cluster_illustrations.py",
                 "07_match_print_illustrations.py", "08_build_network.py", "06_build_visualizer.py"]

LOCK = threading.Lock()
REBUILD = {"running": False, "log": [], "started": None, "finished": None, "ok": None}


# ------------------------------------------------------------------ storage
def now():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def read_json(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def write_json(path, data):
    """Save, keeping the previous version in history/ so it can be undone."""
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    if path.exists():
        snap = HISTORY_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}-{int(time.time() * 1000) % 1000:03d}_{path.name}"
        snap.write_bytes(path.read_bytes())
        # keep only the latest HISTORY_KEEP snapshots (Undo steps back through these)
        for old in sorted(HISTORY_DIR.glob("*.json"))[:-HISTORY_KEEP]:
            old.unlink()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def undo():
    snaps = sorted(HISTORY_DIR.glob("*.json")) if HISTORY_DIR.exists() else []
    if not snaps:
        return None
    last = snaps[-1]
    target = REVIEW_DIR / last.name.split("_", 1)[1]
    target.write_bytes(last.read_bytes())
    last.unlink()
    return target.name


def extraction_review():
    r = read_json(EXTRACTION_REVIEW_JSON, {})
    for k in ("deleted", "class_changes", "added", "pages_checked", "manuscripts_done"):
        r.setdefault(k, {})
    return r


# ------------------------------------------------------------------ catalogue labels
_META = {}


def meta():
    if not _META:
        d = read_json(CLEAN_METADATA_DIR / "visualizer_data.json", {"manuscripts": []})
        by_folder, by_mms = {}, {}
        for m in d["manuscripts"]:
            label = (m.get("shelfmark") or m["mms_id"]).split(" | ")[0]
            info = {"shelfmark": label, "library": m.get("library", ""), "century": m.get("century", "")}
            by_mms[m["mms_id"]] = info
            if m.get("image_folder"):
                by_folder[Path(m["image_folder"]).name] = info
        _META.update(by_folder=by_folder, by_mms=by_mms)
    return _META


def shelfmark_of_folder(folder):
    info = meta()["by_folder"].get(folder)
    return info["shelfmark"] if info else folder.split("_", 1)[-1].replace("_", " ")


# ------------------------------------------------------------------ illustrations (detected + review, live)
def detected():
    return pd.read_csv(ILLUSTRATIONS_DETECTED_CSV, dtype=str).fillna("")


def all_boxes():
    """Every box with its current review status: detected rows + drawn boxes."""
    rev = extraction_review()
    rows = []
    for r in detected().to_dict("records"):
        rows.append({**r, "class": rev["class_changes"].get(r["illustration_id"], r["class"]),
                     "detected_class": r["class"], "drawn": False,
                     "wrong": r["illustration_id"] in rev["deleted"],
                     "replaced_by": rev["deleted"].get(r["illustration_id"], {}).get("replaced_by", "")})
    for iid, b in rev["added"].items():
        rows.append({"illustration_id": iid, "mms_id": b["mms_id"], "manuscript_folder": b["manuscript_folder"],
                     "page_number": str(b["page_number"]), "page_file": b["page_file"], "crop_file": "",
                     "class": b["class"], "detected_class": "", "x": b["x"], "y": b["y"],
                     "width": b["width"], "height": b["height"], "score": "", "method": "manual",
                     "drawn": True, "wrong": False, "replaced_by": "", "replaces": b.get("replaces", "")})
    return rows


def manuscript_list():
    rev = extraction_review()
    boxes = all_boxes()
    per = {}
    for b in boxes:
        p = per.setdefault(b["manuscript_folder"], {"detected": 0, "wrong": 0, "drawn": 0, "reclassed": 0})
        if b["drawn"]:
            p["drawn"] += 1
        else:
            p["detected"] += 1
            p["wrong"] += b["wrong"] and not b["replaced_by"]
            p["reclassed"] += b["class"] != b["detected_class"]
    out = []
    for folder in sorted(x.name for x in MANUSCRIPTS_DIR.iterdir() if x.is_dir()):
        n_pages = len(list((MANUSCRIPTS_DIR / folder).glob("*.jpg")))
        if not n_pages:
            continue
        out.append({"folder": folder, "shelfmark": shelfmark_of_folder(folder), "pages": n_pages,
                    **per.get(folder, {"detected": 0, "wrong": 0, "drawn": 0, "reclassed": 0}),
                    "pages_checked": len(rev["pages_checked"].get(folder, [])),
                    "done": rev["manuscripts_done"].get(folder)})
    return out


_SIZES = {}


def page_size(path):
    if path not in _SIZES:
        with Image.open(PROJECT_ROOT / path) as im:
            _SIZES[path] = im.size
    return _SIZES[path]


def manuscript_detail(folder):
    rev = extraction_review()
    pages = []
    for f in sorted((MANUSCRIPTS_DIR / folder).glob("*.jpg")):
        rel = f.relative_to(PROJECT_ROOT).as_posix()
        w, h = page_size(rel)
        pages.append({"page_number": int(f.stem) if f.stem.isdigit() else f.stem, "file": rel, "w": w, "h": h})
    boxes = [b for b in all_boxes() if b["manuscript_folder"] == folder]
    return {"folder": folder, "shelfmark": shelfmark_of_folder(folder),
            "mms_id": folder.split("_", 1)[0], "pages": pages, "boxes": boxes, "classes": CLASSES,
            "pages_checked": rev["pages_checked"].get(folder, []),
            "done": rev["manuscripts_done"].get(folder)}


def new_manual_id(rev, mms, page):
    """<mms>_<page>_manual_NN, never reusing a number (also not of boxes removed or replaced earlier)."""
    prefix = f"{mms}_{int(page):04d}_manual_"
    used = [k for k in list(rev["added"]) + list(rev["deleted"]) + rev.setdefault("retired", []) if k.startswith(prefix)]
    return f"{prefix}{1 + max([int(k.rsplit('_', 1)[1]) for k in used] or [0]):02d}"


def extraction_op(body):
    rev = extraction_review()
    op = body["op"]
    result = {}
    if op == "wrong":
        for iid in body["ids"]:
            if iid in rev["added"]:
                old = rev["added"].pop(iid)      # a drawn box marked wrong is simply removed
                rev.setdefault("retired", []).append(iid)
                if old.get("replaces"):          # ... and the detector's box it replaced is shown again as wrong
                    rev["deleted"][old["replaces"]] = {"at": now()}
            elif body.get("value", True):
                rev["deleted"][iid] = {"at": now()}
            else:
                rev["deleted"].pop(iid, None)
    elif op == "class":
        iid, cls = body["id"], body["class"]
        if iid in rev["added"]:
            rev["added"][iid]["class"] = cls
        else:
            orig = detected().set_index("illustration_id").at[iid, "class"]
            if cls == orig:
                rev["class_changes"].pop(iid, None)
            else:
                rev["class_changes"][iid] = cls
    elif op == "draw":
        folder, page = body["folder"], int(body["page_number"])
        mms = folder.split("_", 1)[0]
        iid = new_manual_id(rev, mms, page)
        rev["added"][iid] = {"mms_id": mms, "manuscript_folder": folder, "page_number": page,
                             "page_file": body["page_file"], "class": body.get("class", DIAGRAM),
                             **{k: int(round(float(body[k]))) for k in ("x", "y", "width", "height")}, "at": now()}
        result["id"] = iid
    elif op == "adjust":                 # moved / resized box: becomes a drawn box with a new id
        iid = body["id"]
        box = {k: int(round(float(body[k]))) for k in ("x", "y", "width", "height")}
        if iid in rev["added"]:
            old = rev["added"].pop(iid)
            rev.setdefault("retired", []).append(iid)
            replaces = old.get("replaces")
            base = {k: old[k] for k in ("mms_id", "manuscript_folder", "page_number", "page_file", "class")}
        else:
            d = detected().set_index("illustration_id").loc[iid]
            replaces = iid
            base = {"mms_id": d["mms_id"], "manuscript_folder": d["manuscript_folder"],
                    "page_number": int(d["page_number"]), "page_file": d["page_file"],
                    "class": rev["class_changes"].get(iid, d["class"])}
        mms, page = base["mms_id"], int(base["page_number"])
        new_id = new_manual_id(rev, mms, page)
        rev["added"][new_id] = {**base, "page_number": page, **box, "at": now(),
                                **({"replaces": replaces} if replaces else {})}
        if replaces:
            rev["deleted"][replaces] = {"at": now(), "replaced_by": new_id}
        result["id"] = new_id
    elif op == "page_checked":
        lst = set(rev["pages_checked"].get(body["folder"], []))
        (lst.add if body.get("value", True) else lst.discard)(int(body["page_number"]))
        rev["pages_checked"][body["folder"]] = sorted(lst)
    elif op == "done":
        if body.get("value", True):
            rev["manuscripts_done"][body["folder"]] = now()
        else:
            rev["manuscripts_done"].pop(body["folder"], None)
    else:
        raise ValueError(f"unknown op {op}")
    write_json(EXTRACTION_REVIEW_JSON, rev)
    return result


# ------------------------------------------------------------------ clusters (computational, read only) and your groups
_EMB = {"mtime": None}


def embeddings():
    if not EMBEDDINGS_NPZ.exists():
        return {}
    m = EMBEDDINGS_NPZ.stat().st_mtime
    if _EMB["mtime"] != m:
        z = np.load(EMBEDDINGS_NPZ, allow_pickle=False)
        _EMB.update(mtime=m, map=dict(zip(z["ids"].tolist(), z["vectors"])))
    return _EMB["map"]


def illustration_info():
    """id -> card info, for every diagram that is currently alive (not marked wrong, still a diagram)."""
    info = {}
    for b in all_boxes():
        if b["wrong"] or b["class"] != DIAGRAM:
            continue
        crop = b["crop_file"]
        if b["drawn"]:
            crop = ""        # cut by step 4b; shown from the page until then
        info[b["illustration_id"]] = {"id": b["illustration_id"], "crop": crop, "folder": b["manuscript_folder"],
                                      "shelfmark": shelfmark_of_folder(b["manuscript_folder"]),
                                      "page": b["page_number"], "page_file": b["page_file"],
                                      "box": [b["x"], b["y"], b["width"], b["height"]]}
    return info


def groups_data():
    g = read_json(GROUPS_JSON, {})
    g.setdefault("groups", {})
    g.setdefault("next_key", 1)
    return g


def group_list(alive):
    out = []
    for key, g in groups_data()["groups"].items():
        members = [i for i in g["members"] if i in alive]
        out.append({"key": key, "name": g.get("name", ""), "description": g.get("description", ""),
                    "members": members, "size": len(members), "created": g.get("created", ""),
                    "n_manuscripts": len({alive[i]["folder"] for i in members})})
    return sorted(out, key=lambda x: (not x["name"], x["name"].lower(), int(x["key"][1:])))


def computed_clusters(alive, grouped):
    """Clusters of the last step-5 run, without the diagrams that are in one of your groups
    (a diagram has one place: your group, or else its cluster)."""
    run = read_json(CLUSTERS_DIR / "clusters.json", {"clusters": []})
    clusters, clustered = [], set()
    for c in run["clusters"]:
        if not c["label"].startswith("repeating"):
            continue
        members = [i for i in c["illustration_ids"] if i in alive and i not in grouped]
        clustered |= set(members)
        if members:
            clusters.append({"number": c["cluster_id"], "members": members, "size": len(members),
                             "n_manuscripts": len({alive[i]["folder"] for i in members})})
    other = [i for i in alive if i not in clustered and i not in grouped]
    return clusters, other, run


def state():
    alive = illustration_info()
    groups = group_list(alive)
    seen, several = {}, set()
    for g in groups:
        for i in g["members"]:
            if i in seen:
                several.add(i)
            seen[i] = g["key"]
    clusters, other, run = computed_clusters(alive, set(seen))
    return alive, groups, clusters, other, sorted(several), run


def clusters_payload():
    alive, groups, clusters, other, several, run = state()
    return {"clusters": clusters, "other": other, "groups": groups, "several": several, "cards": alive,
            "n_in_groups": len({i for g in groups for i in g["members"]}),
            "last_run": {"n_clusters": len(clusters), "threshold": run.get("similarity_threshold"),
                         "run_id": run.get("run_id")}}


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n else v


def suggestions(ids):
    """Diagrams, groups and clusters closest to the centre of `ids` (one diagram, a selection, a group or a cluster)."""
    alive, groups, clusters, other, several, run = state()
    emb = embeddings()
    vecs = [emb[i] for i in ids if i in emb]
    if not vecs:
        return {"items": [], "units": []}
    centre = unit(np.mean(vecs, axis=0))
    skip = set(ids)
    place = {}
    for c in clusters:
        for i in c["members"]:
            place[i] = f"C:{c['number']}"
    for g in groups:
        for i in g["members"]:
            place[i] = f"G:{g['key']}"
    units = []
    for kind, lst in (("G", groups), ("C", clusters)):
        for u in lst:
            if set(u["members"]) <= skip:
                continue
            uv = [emb[i] for i in u["members"] if i in emb]
            if uv:
                uid = f"G:{u['key']}" if kind == "G" else f"C:{u['number']}"
                units.append((float(unit(np.mean(uv, axis=0)) @ centre), uid, u))
    units.sort(key=lambda t: -t[0])
    cand = sorted(((float(unit(emb[i]) @ centre), i) for i in alive if i in emb and i not in skip), key=lambda t: -t[0])
    return {"units": [{"uid": uid, "similarity": round(s, 3), "size": u["size"], "n_manuscripts": u["n_manuscripts"],
                       "name": u.get("name", ""), "members": u["members"][:4]} for s, uid, u in units[:12]],
            "items": [{"id": i, "similarity": round(s, 3), "place": place.get(i)} for s, i in cand[:60]]}


def groups_op(body):
    """Your groups. A diagram is in at most one group: adding it to a group takes it out of any other."""
    data = groups_data()
    groups = data["groups"]
    op = body["op"]
    key = body.get("key")

    def take_out(ids, except_key=None):
        ids = set(ids)
        for k, g in groups.items():
            if k != except_key:
                g["members"] = [i for i in g["members"] if i not in ids]

    if op != "new" and key not in groups:
        raise ValueError(f"no group {key}")
    if op == "new":                       # new group from some diagrams (they leave any other group)
        ids = list(dict.fromkeys(body.get("ids", [])))
        take_out(ids)
        key = f"G{data['next_key']}"
        data["next_key"] += 1
        groups[key] = {"name": body.get("name", "").strip(), "description": "", "members": ids, "created": now()}
    elif op == "add":                     # move diagrams into this group
        take_out(body["ids"], except_key=key)
        groups[key]["members"] = list(dict.fromkeys(groups[key]["members"] + body["ids"]))
    elif op == "remove":                  # back to "not grouped" (their cluster)
        drop = set(body["ids"])
        groups[key]["members"] = [i for i in groups[key]["members"] if i not in drop]
    elif op == "rename":
        groups[key]["name"] = body.get("name", "").strip()
    elif op == "describe":
        groups[key]["description"] = body.get("description", "").strip()
    elif op == "merge":                   # the other group joins this one and is deleted; a name is kept if this had none
        other = body["other"]
        if other == key or other not in groups:
            raise ValueError(f"cannot merge {other} into {key}")
        o = groups.pop(other)
        groups[key]["members"] = list(dict.fromkeys(groups[key]["members"] + o["members"]))
        if not groups[key].get("name") and o.get("name"):
            groups[key]["name"] = o["name"]
        if not groups[key].get("description") and o.get("description"):
            groups[key]["description"] = o["description"]
    elif op == "delete":
        del groups[key]
    else:
        raise ValueError(f"unknown op {op}")
    # a group that is emptied (all moved elsewhere) disappears, unless it has a name
    data["groups"] = {k: g for k, g in groups.items() if g["members"] or g.get("name") or k == key}
    write_json(GROUPS_JSON, data)
    return {"key": key if key in data["groups"] else None}


# ------------------------------------------------------------------ rebuild
def run_rebuild():
    REBUILD.update(running=True, log=[], started=now(), finished=None, ok=None)
    ok = True
    for step in REBUILD_STEPS:
        REBUILD["log"].append(f"$ python code/{step}")
        proc = subprocess.run([sys.executable, str(CODE_DIR / step)], cwd=str(CODE_DIR),
                              capture_output=True, text=True)
        lines = [ln for ln in (proc.stdout + proc.stderr).splitlines()
                 if ln.strip() and "warn" not in ln.lower() and "use_fast" not in ln]
        REBUILD["log"] += lines[-6:]
        if proc.returncode != 0:
            REBUILD["log"].append(f"!! {step} failed (exit {proc.returncode})")
            ok = False
            break
    _META.clear()
    REBUILD.update(running=False, finished=now(), ok=ok)


# ------------------------------------------------------------------ files
def thumb(rel, width):
    src = (PROJECT_ROOT / rel).resolve()
    if DATA_DIR not in src.parents:
        raise PermissionError(rel)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    out = THUMB_DIR / (hashlib.md5(f"{rel}|{width}".encode()).hexdigest() + ".jpg")
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        with Image.open(src) as im:
            im = im.convert("RGB")
            im.thumbnail((width, width * 3))
            im.save(out, quality=82)
    return out


def crop_preview(page_file, box, width):
    """A crop cut on the fly from the page (for boxes drawn but not yet cut by step 4b)."""
    src = (PROJECT_ROOT / page_file).resolve()
    if DATA_DIR not in src.parents:
        raise PermissionError(page_file)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    x, y, w, h = (int(float(v)) for v in box)
    out = THUMB_DIR / (hashlib.md5(f"{page_file}|{x},{y},{w},{h}|{width}".encode()).hexdigest() + ".jpg")
    if not out.exists():
        with Image.open(src) as im:
            c = im.convert("RGB").crop((x, y, x + w, y + h))
            c.thumbnail((width, width))
            c.save(out, quality=85)
    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, cache=True):
        data = Path(path).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            if url.path in ("/", "/index.html"):
                return self.send_file(STATIC_DIR / "index.html", cache=False)
            if url.path.startswith("/static/"):
                return self.send_file(STATIC_DIR / Path(url.path).name, cache=False)
            if url.path == "/file":
                src = (PROJECT_ROOT / q["p"]).resolve()
                if DATA_DIR not in src.parents:
                    return self.send_json({"error": "outside data/"}, 403)
                return self.send_file(src)
            if url.path == "/thumb":
                return self.send_file(thumb(q["p"], int(q.get("w", 220))))
            if url.path == "/crop":
                return self.send_file(crop_preview(q["p"], q["box"].split(","), int(q.get("w", 220))))
            if url.path == "/api/manuscripts":
                return self.send_json({"manuscripts": manuscript_list()})
            if url.path == "/api/manuscript":
                return self.send_json(manuscript_detail(q["folder"]))
            if url.path == "/api/clusters":
                return self.send_json(clusters_payload())
            if url.path == "/api/suggestions":
                return self.send_json(suggestions([i for i in q.get("ids", "").split(",") if i]))
            if url.path == "/api/rebuild":
                return self.send_json(REBUILD)
            # the built visualizer and the files it links (read only)
            if url.path.split("/")[1] in ("visualizer", "data"):
                src = (PROJECT_ROOT / unquote(url.path).lstrip("/")).resolve()
                if PROJECT_ROOT in src.parents and src.is_file():
                    return self.send_file(src, cache=not url.path.startswith("/visualizer/"))
            return self.send_json({"error": "not found"}, 404)
        except Exception as e:      # noqa: BLE001 - report any problem to the page
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)

    def do_POST(self):
        url = urlparse(self.path)
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        try:
            with LOCK:
                if url.path == "/api/extraction":
                    return self.send_json(extraction_op(body))
                if url.path == "/api/groups":
                    return self.send_json(groups_op(body))
                if url.path == "/api/undo":
                    return self.send_json({"undone": undo()})
                if url.path == "/api/rebuild":
                    if not REBUILD["running"]:
                        threading.Thread(target=run_rebuild, daemon=True).start()
                    return self.send_json({"started": True})
            return self.send_json({"error": "not found"}, 404)
        except Exception as e:      # noqa: BLE001
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(f"Port {PORT} is busy: the review tool is probably already running. "
                 f"Open http://localhost:{PORT}, or stop the other copy first.")
    print(f"Review tool: http://localhost:{PORT}   (Ctrl+C to stop)")
    server.serve_forever()


if __name__ == "__main__":
    main()
