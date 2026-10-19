# Audit Report: hebrew_sacrobosco_project

*Read-only audit made on 2026-10-18. No project files were changed. Statements like "works" or "broken" come from reading the code, checking syntax, testing imports and comparing outputs on disk. Most scripts were **not** run.*

**Summary.** Stages 1 (catalogue harvest) and 2 (image download) work and have produced real data. Stage 5 (the visualizer) works for the catalogue, map and reader tabs. Stages 3 (illustration extraction) and 4 (clustering) are sketches: there are five or more competing attempts, none of them has produced usable output, and two of the files don't parse. The project is **not under version control** and has **no reproducible environment**: the image-processing libraries live only in the system Python, not in the project venv.

---

## 1. Folder tree (max depth 3)

```text
hebrew_sacrobosco_project/                     (~580 MB total, incl. .venv)
├── README.md, requirements.txt, .gitignore
├── auto_detect_illustrations.py               stage 3 driver (root level)
├── extract_cluster_images.py                  stage 4 (root level, the one actually used)
├── yolov5su.pt                                18 MB, generic Ultralytics COCO weights
├── code -> scripts                            symlink
├── scripts/                                   7 .py
│   ├── sphaera_harvest.py, download_manuscripts.py, build_visualizer.py
│   └── coredeep_extraction.py, run_extractor.py, test_one_folder.py, debug_one_image.py
├── src/
│   ├── scraping/download_manuscripts.py       near-duplicate of scripts/ version
│   ├── preprocessing/                         detect_illustrations.py, extract_illustrations.py, extract_illustrations_hf.py
│   └── clustering/cluster_images.py           near-duplicate of extract_cluster_images.py
├── illustrations_extractor/                   package: __init__.py, extractor.py, fallback_extractor.py (identical pair)
├── notebooks/                                 01_explore_harvest.ipynb (84 KB), 02_view_images.ipynb (4.6 MB, embedded images)
│   └── .ipynb_checkpoints/
├── data/                                      8.8 MB
│   ├── raw/          10 files, 6.2 MB         MARCXML, one per search term (Hebrew filenames)
│   ├── csv/           9 files, 2.6 MB         catalogue + image index tables
│   ├── illustrations/ 1 empty sub-folder (990000463750205171_NLI_…)
│   ├── clusters/      empty
│   └── viz/           empty
├── images/                                    234 MB, 11 folders, 1,082 JPGs + 10 metadata.json
│   ├── 990001314250205171_BnF_Ms._hebr._1092/   371 pages, 78 MB
│   ├── 990001283830205171_BSB_Cod.hebr._394/    335 pages, 87 MB
│   ├── 990001309470205171_BnF_Ms._hebr._1005/   144 pages, 24 MB
│   ├── 990001379080205171_University_Ms._Oct._62/ 106 pages, 27 MB
│   ├── 990001314740205171_BnF_Ms._hebr._1105/    94 pages, 12 MB
│   ├── 990000463750205171_NLI_Ms._Heb._6694_28/  20 pages
│   ├── 990001467840205171_RSL_Ms._Guenzburg_1067/ 12 pages
│   ├── JTS_9121/                                  3 pages, no metadata.json (manual workaround)
│   └── HUC_Ms._900, EtsHaim_47_D_20, The_Nation_Ms._EVR_I_355   0 pages (metadata.json only)
├── visualizer/                                1.2 MB: index.html, app.js, visuals.js, style.css, data.js (840 KB), visuals_clusters.json (270 KB)
│   └── assets/images/990000945290205171/      empty
└── .venv/                                     315 MB
```

---

## 2. Scripts

| Path | What it does | Inputs | Outputs | Libraries | Status |
|---|---|---|---|---|---|
| `scripts/sphaera_harvest.py` | Runs 10 search terms against NLI Alma SRU, pages through the results, flattens MARC to one column per subfield, removes duplicates by MMS ID and flags manuscripts (Leader/06 ∈ `t,d,f`). Also has an optional `download_pages()` with the JTS image workaround. | NLI SRU endpoint | `data/raw/<term>__marcxml.xml`, `data/csv/ALL__deduped.csv`, `MANUSCRIPTS_ONLY.csv`, `_SUMMARY.csv` | requests, xml.etree | **Works** |
| `scripts/download_manuscripts.py` | Batch-downloads page images for the "open" manuscripts using IIIF manifests, with retry, resume and per-manuscript CSV checkpoints. | `ALL_OPEN_MANUSCRIPTS.csv` + `MANUSCRIPTS_ONLY.csv`; NLI IIIF | `images/<mms>_<lib>_<shelfmark>/NNNN.jpg`, `metadata.json`, `MANUSCRIPTS_IMAGES_INDEX.csv`, `PAGE_LEVEL_METADATA.csv` | requests, pandas | **Works** (this produced `images/`) |
| `src/scraping/download_manuscripts.py` | Copy of the above, but writes images into `data/raw/` and drops the NaN-safe string handling. | same | `data/raw/<folder>/…` | requests, pandas | **Abandoned fork.** If run, it would mix images into the MARCXML folder and write `"nan"` strings. |
| `scripts/build_visualizer.py` | Joins the catalogue with the page index, extracts people, centuries, scripts and places (from a hard-coded coordinate table), and writes the data bundle for the website. | `MANUSCRIPTS_ONLY.csv`, `PAGE_LEVEL_METADATA.csv`, `images/` | `visualizer/data.js` (`window.SPHAERA_DATA`). Its docstring says it also writes `index.html`; it doesn't. | pandas | **Works** |
| `src/preprocessing/detect_illustrations.py` | Labels each whole page as illustration or not, by edge density (a hand-written Sobel filter in pure Python loops). | `images/` | `data/csv/ILLUSTRATIONS_DETECTED.csv` | numpy, Pillow | **Partial.** Capped at 200 images, has debug prints, and the per-pixel Python loop is extremely slow (minutes per page). The current CSV is header-only. |
| `auto_detect_illustrations.py` | Re-runs the detector with lower and lower thresholds until something is flagged, then calls `extract_illustrations.py`. | detector + CSV | same as those two scripts | subprocess | **Partial.** Calls bare `python3`, not the venv. |
| `src/preprocessing/extract_illustrations.py` | Copies the pages flagged as illustrations into `data/illustrations/<folder>/`. | `ILLUSTRATIONS_DETECTED.csv`, `images/` | full-page copies | stdlib | **Works, but nothing to do** (the CSV is empty) |
| `src/preprocessing/extract_illustrations_hf.py` | Planned Grounding-DINO + SAM crop-and-mask pipeline. | detector CSV, Hugging Face Hub | `data/illustrations/…_illust_N.png` | torch, transformers, groundingdino, segment_anything | **Broken.** `AutoProcessor` and `GroundingDinoForObjectDetection` are never imported, it mixes two incompatible Grounding-DINO APIs, and it downloads about 3 GB of models on import. Never ran. |
| `illustrations_extractor/` (`extractor.py` = `fallback_extractor.py`) | OpenCV: Otsu threshold, then external contours, then crops any box covering 0.1–50% of the page. | a folder of pages | `<out>/<page>_figNNN.png` | opencv, tqdm | **Partial.** On manuscripts this will mostly crop text blocks and words. **It deletes every file in the output folder before writing.** The two files are byte-for-byte the same apart from comments. |
| `scripts/run_extractor.py` | Runs the package above over every `images/` sub-folder. | `images/` | `data/illustrations/<folder>/` | the package | **Partial.** Created one empty folder, then stopped or failed. |
| `scripts/test_one_folder.py` | Runs the extractor on one manuscript. | cwd-relative path | `data/illustrations/…` | the package | **Broken.** `parents[2]` points above the project, so the import fails unless it is run with PYTHONPATH set. |
| `scripts/debug_one_image.py` | Prints the contour boxes found on one page. | cwd-relative image | stdout | opencv | Works if run from the project root |
| `scripts/coredeep_extraction.py` | YOLO detection, then crops plus a CSV manifest, with filters on area and class. | `--input-dir`, `--model-path` | crops + `extraction_manifest.csv` | ultralytics, opencv | **Does not parse** (IndentationError at line 97). The only weights present are generic COCO `yolov5su.pt`, not a "CoreDeep / Sphaera" model. |
| `extract_cluster_images.py` (root) | Computes a pHash of every **full page** and greedily groups pages within Hamming distance ≤ 5. | `images/` | `visualizer/visuals_clusters.json` | Pillow, imagehash, tqdm | **Works** (produced the current JSON), but the result isn't meaningful: 882 of 951 clusters contain a single page. |
| `src/clustering/cluster_images.py` | Same algorithm, different paths. | `data/raw/` (no images there) | `data/viz/visuals_clusters.json` | same | **Abandoned.** It points at the wrong input folder, so the output folder stays empty. |
| `visualizer/index.html` + `app.js` + `style.css` | A static site with tabs: Home, Catalogue (filters), Reader (page viewer), Persons, Map (Leaflet/OSM), Queries, All Visuals & Clusters. | `data.js`, `../images/…` | — | Leaflet 1.9.4 (unpkg CDN) | **Works** for the catalogue, reader and map tabs |
| `visualizer/visuals.js` | Gallery and cluster tab logic. | `data.js`, `fetch('../data/viz/visuals_clusters.json')` | — | — | **Broken.** It has a syntax error (a stray uncommented line 44), `index.html` never loads it, it fetches from the empty `data/viz/` rather than `visualizer/`, and `fetch` is blocked when the page is opened as `file://`. The "Visual Elements" section sits **after `</html>`**. |
| `notebooks/01_explore_harvest.ipynb` | Query metrics, a check of the Leader/06 filter, a MARC field inventory, and a field-by-field look at JTS Ms. 9121. | `data/csv/*` | — | pandas | Works (ran cleanly, documents the MARC tag mapping) |
| `notebooks/02_view_images.ipynb` | Browses downloaded pages inline. | `images/`, index CSVs | — | pandas, Pillow | Works; saved with image outputs (4.6 MB) |

---

## 3. Data flow

```text
[1] sphaera_harvest.py ──► data/raw/*.xml, ALL__deduped.csv, MANUSCRIPTS_ONLY.csv, _SUMMARY.csv
        │
        │   ?? unknown step (no script in project) ──► OPEN_MANUSCRIPTS_SURVEY.csv,
        │                                               TRULY_OPEN_MANUSCRIPTS.csv, ALL_OPEN_MANUSCRIPTS.csv
        ▼
[2] scripts/download_manuscripts.py  (reads ALL_OPEN_MANUSCRIPTS.csv ⋈ MANUSCRIPTS_ONLY.csv on mms_id = ms_mms_id)
        ──► images/<mms>_<lib>_<shelfmark>/NNNN.jpg + metadata.json
        ──► MANUSCRIPTS_IMAGES_INDEX.csv, PAGE_LEVEL_METADATA.csv
    + manual: images/JTS_9121/ (via sphaera_harvest.download_pages, folder renamed or passed by hand)
        ▼
[3] detect_illustrations.py ──► ILLUSTRATIONS_DETECTED.csv (currently empty)
        ├─► extract_illustrations.py ──► data/illustrations/ (full-page copies)
        ├─► extract_illustrations_hf.py (reads same CSV) ──► data/illustrations/*.png   [broken]
    parallel, unconnected attempts reading images/ directly:
        ├─► run_extractor.py → illustrations_extractor ──► data/illustrations/<folder>/*_figNNN.png
        └─► coredeep_extraction.py ──► <any dir> + extraction_manifest.csv               [doesn't parse]
        ▼
[4] extract_cluster_images.py   reads images/ (NOT stage-3 output) ──► visualizer/visuals_clusters.json
    src/clustering/cluster_images.py reads data/raw/ ──► data/viz/visuals_clusters.json   [wrong input]
        ▼
[5] build_visualizer.py ──► visualizer/data.js ; index.html/app.js (hand-written) read data.js + ../images/
```

**Mismatches**
- **Stage 4 skips stage 3.** Clustering hashes whole pages from `images/`, not the extracted illustrations, so stage 3's output isn't used anywhere.
- **The cluster JSON is in one place and read from another.** `visuals.js` reads it from `data/viz/`, but the working clusterer writes it to `visualizer/`. And `visuals.js` isn't loaded at all.
- **Three different extraction outputs, no shared schema.** Copying writes full pages as `NNNN.jpg`, the OpenCV extractor writes `NNNN_figNNN.png`, YOLO writes `NNNN_cropNNN_<class>.png`, and only YOLO keeps bounding boxes. None of them keeps the MMS ID in the crop's filename; they rely on the folder name.
- **The page index lists pages that don't exist.** `PAGE_LEVEL_METADATA.csv` has 1,526 rows, but only 1,082 images exist. The extra rows are HUC 900, Ets Haim 47 D 20 and EVR I 355: their manifests listed canvases, but every download failed, and the rows are still written.
- **The "open" lists disagree.** `ALL_OPEN_MANUSCRIPTS.csv` lists 148 "open" manuscripts (22,150 canvases), while the survey marks 143 as `RESTRICTED_EMPTY_SEQUENCES` and 3 as `OPEN_IIIF`. None of the 4 distinct manuscripts in `TRULY_OPEN_MANUSCRIPTS.csv` (Berlin ×2, IOM, Budapest) has been downloaded. That file also has duplicate MMS IDs under different titles.
- **The visualizer's totals are typed in by hand.** `build_visualizer.py` hard-codes `total_open_in_catalog: 148` and `total_pages_in_catalog: 22150` instead of reading them from the CSV.
- **`_SUMMARY.csv` is older than the other harvest tables.** It is dated Oct 15 while `ALL__deduped.csv` and `MANUSCRIPTS_ONLY.csv` are dated Oct 16, even though the same `main()` writes all three.

---

## 4. NLI access

- **Catalogue search:** `https://nli.alma.exlibrisgroup.com/view/sru/972NNL_INST`. This is public SRU 1.2 (`operation=searchRetrieve`, `recordSchema=marcxml`), and **no API key** is used.
  - The query is CQL `alma.all_for_ui all "<term>"`, a keyword search across all fields, run for 10 hard-coded Hebrew and Latin terms.
  - Results are fetched 50 per request until `numberOfRecords` is reached.
  - Filtering happens on the client side: Leader/06 ∈ `t,d,f` means manuscript. Notebook 01 confirms that all 235 are `t`.
- **Viewer link built per record:** `https://www.nli.org.il/he/discover/manuscripts/hebrew-manuscripts/viewerpage?vid=MANUSCRIPTS&docid=PNX_MANUSCRIPTS<mms>`.
- **IIIF manifest (Presentation 2.1):** the code tries `https://iiif.nli.org.il/IIIFv21/<mms>/manifest` first, then `…/IIIFv21/DOCID/PNX_MANUSCRIPTS<mms>/manifest`. It accepts IIIF v2 `sequences[0].canvases` or v3 `items`.
- **Images:** IIIF Image API, `<service @id>/full/1200,/0/default.jpg`. The service IDs look like `https://iiif.nli.org.il/IIIFv21/FL<number>`. Images are 1200 px wide, not full resolution.
- **What failed with IIIF:**
  - For most catalogue records, the manifest comes back with **empty `sequences`**. The survey records 143 of 147 as `RESTRICTED_EMPTY_SEQUENCES`, plus one `HTTP_500`.
  - The license field points to an NLI "pages-for-…" page, meaning on-site-only viewing under the partner library's agreement (for example JTS).
  - Some records are analytical (a text *within* a codex), so the manifest belongs to the parent record.
  - For HUC, Ets Haim and EVR, the manifest listed canvases but every image request failed.
- **The workarounds:**
  1. **Two manifest URL forms**, as above.
  2. **Fall back to the parent record:** if there are no canvases, the code retries with the MMS ID in MARC `773$w`.
  3. **Bypass the manifest entirely (JTS Ms. 9121 only, hard-coded):** MARC `907$d` revealed that the Rosetta file ID `FL155318969` is f. 8a. The code assumes file IDs run in sequence through the codex, so page *n* = `FL(155318962 + n − 1)`. It then requests those IDs straight from the IIIF **Image** API, which still serves them even though the manifest is restricted. This produced 3 pages in `images/JTS_9121/`.
     - It is fragile: it is hard-coded to two MMS IDs, assumes the IDs are contiguous, and has no check that a returned image really is the expected folio.
     - It may also go beyond the access terms the library intended (see Open questions).
- **Politeness and robustness:**
  - **Delays:** 0.5 s sleep between SRU pages and between images.
  - **Requests:** sequential, with a custom User-Agent in the batch downloader only.
  - **Timeouts:** 120 s on SRU calls, 60 s on manifest and image calls.
  - **Retries:** 3 per image, 1 s apart, in the batch downloader. The harvester and `download_pages()` have none: a single failure raises.
  - **Errors swallowed silently:** manifest errors (`except: pass`).
  - **No limit handling:** no backoff on HTTP 429 or 5xx.
- **Resume:**
  - **Image downloader:** yes. It skips files over 1 KB, takes `--start/--limit`, and rewrites both index CSVs after each manuscript. It does not check that an existing file is a valid JPEG.
  - **Harvester:** no resume. It re-runs everything and overwrites its outputs.

---

## 5. Data formats

- **Catalogue tables (`ALL__deduped.csv`, `MANUSCRIPTS_ONLY.csv`):** UTF-8-with-BOM CSV, one row per MMS ID. They have 361 and 191 columns respectively.
  - Readable columns come first: `ms_mms_id, ms_title, ms_author, ms_added_names, ms_date_place, ms_extent, ms_notes, ms_subjects, ms_ktiv_link, ms_iiif_manifest, ms_is_manuscript, query_terms`.
  - Then one column per raw MARC subfield (`LDR`, `001`, `245$a`, `942$z`, …). Repeated values are joined with ` | `.
  - Key NLI tags (from notebook 01): shelfmark `942$z`/`907$e`, microfilm `090$a`, holding library `710$a`/`942$a`, script `958$a`, colophon `957$a`, place of writing `751$a`, parent record `773$w`, Rosetta file pointer `907$d`.
  - Example (abridged): `ms_mms_id=990001314740205171 · ms_title="איל טראטאדו דילא איספירא." · ms_author="יוהאנס דה סאקרו בוסקו" · ms_date_place="מאה ט"ז." · ms_subjects="Astronomy -- Early works to 1800" · ms_notes="בספרדית || …"`
- **Raw:** a MARCXML `<collection>` per search term in `data/raw/`, with filenames like `סאקרו_בוסקו__marcxml.xml`.
- **Image folders:** `images/<mms_id>_<libcode>_<sanitised shelfmark, max 40 chars>/`, for example `990001283830205171_BSB_Cod.hebr._394/`.
  - Pages are named `0001.jpg …` in **manifest canvas order**, which is not foliation. The real folio label is kept in `PAGE_LEVEL_METADATA.canvas_label`, but every value seen so far is just "Page N".
  - Exception: `JTS_9121/` doesn't follow the pattern and has no `metadata.json`.
- **`metadata.json` (per folder):** `mms_id, title, shelfmark, holding_library, library_code, date_place, script, colophon, total_pages, downloaded_pages, manifest_url, folder_name`.
- **`PAGE_LEVEL_METADATA.csv`:** `mms_id, library_code, shelfmark, page_number, canvas_label, file_name, relative_path, width, height, iiif_image_url`.
- **Cluster JSON:** `[{cluster_hash, images:[{src:"../images/<folder>/<file>", manuscript_id:<folder name>, filename}]}]`.
- **Linking key:** the **NLI MMS ID** (18 digits, starting `99…05171`) runs through every table, folder name and `metadata.json`.
  - Scripts recover it by splitting the folder name on `_`. This fails for `JTS_9121`, so `build_visualizer.py` maps it by hand to `990000846580205171`.
  - In the cluster JSON, `manuscript_id` is the whole folder name, not the MMS ID.

---

## 6. Environment

- **Project venv:** `.venv`, Python **3.9.6** from Apple Command Line Tools (`/Library/Developer/CommandLineTools/usr/bin/python3`). It has a Jupyter kernel named `sphaera`.
- **`requirements.txt`** (no version pins): requests, pandas, openpyxl, jupyter, ipykernel, pillow.
  - Installed in the venv: pandas 2.3.3, numpy 2.0.2, requests 2.32.5, pillow 11.3.0, openpyxl, jupyterlab 4.5.
- **Imported by the code but missing from the venv and from requirements:** `opencv-python (cv2)`, `imagehash`, `tqdm`, `ultralytics`, `torch`, `transformers`, `huggingface_hub`, `segment_anything`, `groundingdino`.
  - cv2, imagehash, tqdm, ultralytics 8.4 and torch 2.8 *are* installed in the **system Python's user site-packages** (`~/Library/Python/3.9/…`). That is how the clustering and YOLO experiments were run.
  - `segment_anything` and `groundingdino` are not installed anywhere that was checked.
  - The result is a split environment: stage 1–2 and 5 scripts run in the venv, stage 3–4 scripts only under bare `python3`.
- **No conda, no lock file.** `pyproject.toml` is absent.
- **OS assumptions:** macOS. There are `.DS_Store` files, the venv points at the Apple CLT Python, and `README.md` contains a `/Users/…` absolute path (docs only, not in code). Paths otherwise use `pathlib` and should be portable.
- **GPU:** none is used. `extract_illustrations_hf.py` checks for CUDA, which this machine doesn't have. Torch reports **MPS (Apple GPU) available**, but no code uses it, and every extractor defaults to `device="cpu"`.
- **Web:** the visualizer loads Leaflet from unpkg and map tiles from OpenStreetMap, so the map needs internet access.

---

## 7. Version control

- **Not a git repository**, and no parent folder is one either. So there is **no remote and no commit history**: the "recent history" below comes only from file modification times.
  - Oct 15: catalogue harvest and the open-access survey.
  - Oct 16: image download and visualizer build; whole-page clustering in the evening.
  - Oct 17: forks under `src/`, edge-density detector, auto-threshold loop.
  - Oct 18 (today): HF/SAM attempt, YOLO weights, CoreDeep script, OpenCV extractor package and its test/debug scripts.
- **A `.gitignore` exists:** it ignores `.venv/`, `images/`, `__pycache__/`, `*.pyc`, `.ipynb_checkpoints/`, `.DS_Store`.
- **If someone runs `git init` as things stand, these would be committed:**
  - `yolov5su.pt` (18 MB)
  - `data/raw` (6.2 MB)
  - `visualizer/data.js` (840 KB)
  - `notebooks/02_view_images.ipynb` (4.6 MB, embedded images)

---

## 8. Code health observations

- **Duplication:**
  - Two downloaders.
  - Two pHash clusterers.
  - Two identical extractor modules.
  - Three copies of the OpenCV `_find_figures` function (two modules + `debug_one_image.py`).
  - Manifest-fetch logic in both `sphaera_harvest.py` and the downloaders.
  - Two parallel layouts (`scripts/` vs `src/`, plus root-level scripts and the `code` symlink), with no clear canonical entry point.
- **Inconsistent paths:**
  - Images are expected in `images/`, `data/raw/` or `data/images/`, depending on the script.
  - Docstrings still say `data/raw` where the code says `images/`.
  - `PROJECT_ROOT` is computed four different ways (`parent.parent`, `parents[1]`, `parents[2]`, `Path.cwd()`). One of them is wrong (`test_one_folder.py`).
- **Hard-coded values:**
  - The 10 search terms.
  - The JTS MMS IDs and FL base number.
  - A sample manuscript folder in two debug scripts.
  - Catalogue totals in `build_visualizer.py`, plus its ~40-entry coordinate table, which matches by substring and so can mis-match.
  - Thresholds: edge density 0.1, Hamming distance 5, area ratios.
  - `max_images = 200` debug cap left in the detector.
- **Risky behaviour:**
  - The OpenCV extractor **deletes every file** in its output folder, with no prompt.
  - `extract_illustrations_hf.py` downloads multi-GB models at *import* time.
  - `auto_detect` shells out to `python3`, so it can pick up a different interpreter.
- **Errors swallowed silently:**
  - `fetch_manifest` uses a bare `except: pass`.
  - Image-download failures are printed but still indexed as pages.
  - Grabbing a parent manifest via `773$w` downloads the **whole parent codex** under the child's MMS ID, and nothing records that this happened.
- **Doesn't parse or run:**
  - `coredeep_extraction.py`: IndentationError.
  - `visuals.js`: JS SyntaxError.
  - `extract_illustrations_hf.py`: missing imports, would fail with NameError.
  - The visualizer's "Visual Elements" tab is outside `</html>`.
- **Method concerns (stages 3–4):**
  - Whole-page pHash clustering is dominated by text layout and mostly produces single-page clusters.
  - Otsu thresholding plus contours will crop words and text blocks.
  - COCO YOLO weights have no "diagram" class, which is why the script excludes the `book` class.
  - None of these approaches has been checked against a labelled sample.
- **Tests:** none. `test_one_folder.py` is a manual smoke script, not a test.
- **Documentation:**
  - `README.md` covers stages 1–2 and the notebooks only. It doesn't mention `download_manuscripts.py`, the visualizer, or stages 3–4, and it describes `download_pages` as the image route.
  - Notebook 01 is good documentation of the MARC mapping.
- **Credentials:** **none found** in code, notebooks or config.

---

## 9. Open questions

1. **Where do the open-access lists come from?** Which script or notebook produced `OPEN_MANUSCRIPTS_SURVEY.csv`, `TRULY_OPEN_MANUSCRIPTS.csv` and `ALL_OPEN_MANUSCRIPTS.csv`? None in the project does. And why does "ALL_OPEN" list 148 manuscripts when the survey marks 143 of them as restricted?
2. **Why were the 4 "truly open" manuscripts never downloaded?** These are Berlin ×2, IOM St Petersburg and Budapest, while restricted-looking BnF, BSB and others were downloaded.
3. **Has NLI approved the JTS bypass?** Fetching images by guessing sequential FL numbers works around an access restriction ("on-site viewing" per the manifest). Do you have permission from NLI or JTS? If not, this should be reviewed before scaling it up.
4. **Which extraction approach is the intended one?** Edge-density + copy, Grounding-DINO/SAM, OpenCV contours, or YOLO/"CoreDeep"? And do real CoreDeep weights trained on Sphaera exist somewhere outside this folder?
5. **What does "illustration" mean here?** Should stage 3 mark whole pages or produce cropped diagrams? Should tables, initials or marginal drawings count?
6. **Should clustering run on crops or whole pages?** Should it stay perceptual hashing, or use learned embeddings?
7. **What happened to the HUC 900, Ets Haim 47 D 20 and EVR I 355 downloads?** Their manifests listed 128, 302 and 14 canvases but 0 images arrived. Are they restricted at the image level, or did the requests error out?
8. **Was any of `images/` fetched from the parent record via `773$w`?** If so, which folders, since it isn't recorded?
9. **Which interpreter is canonical?** Should the image-processing libraries move into `.venv`? Should the Python version be newer than 3.9 (needed for current torch/transformers)?
10. **Should `_SUMMARY.csv` be regenerated?** It is a day older than the tables it summarises.
11. **How should the visualizer be served?** Through a local web server, or opened as a file? (`fetch()` won't work from `file://`.)
12. **Was `visualizer/assets/images/990000945290205171/` meant for something?** It is empty; that manuscript is in the catalogue but has no images.
13. **Is there a version-control plan?** Is there an intended remote? Should data and images be versioned separately (Git LFS, DVC, or archived outside git)?
