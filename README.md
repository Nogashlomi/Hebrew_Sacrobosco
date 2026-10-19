# Hebrew Sacrobosco Manuscripts Project

This research project harvests and analyzes bibliographic catalogue records and digitized manuscript page images of Hebrew translations and commentaries on Johannes de Sacrobosco's *De sphaera* (including *Mar'eh ha-Ofanim*, *Sefer ha-Galgal*, and Moses Almosnino's commentary *Beit Elohim*).

Records are retrieved from the National Library of Israel (NLI) Alma catalogue via its public SRU endpoint, and digitized pages are downloaded through IIIF manifests.

---

## Directory Structure

```text
hebrew_sacrobosco_project/
├── code/ -> scripts/         # Harvesting scripts (symbolic link to scripts/)
├── scripts/
│   └── sphaera_harvest.py    # Main Alma SRU harvesting & IIIF download script
├── data/
│   ├── raw/                  # Raw MARCXML collection files per query term
│   └── csv/                  # Processed tables (deduplicated records & summary)
├── images/                   # Manuscript images organized by manuscript ID/shelfmark
├── notebooks/                # Jupyter analysis & visualization notebooks
│   ├── 01_explore_harvest.ipynb
│   └── 02_view_images.ipynb
├── requirements.txt          # Python dependencies
├── .gitignore                # Git ignore rules (.venv, images, checkpoints, etc.)
└── README.md                 # Project documentation and instructions
```

---

## Setup & Environment

1. **Activate the Python virtual environment:**
   ```bash
   cd /Users/nogashlomi/projects/hebrew_sacrobosco_project
   source .venv/bin/activate
   ```

2. **If setting up from scratch:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   python -m ipykernel install --user --name sphaera --display-name "sphaera"
   ```

---

## Running the Harvest Script

To run the SRU harvest against the NLI catalogue and generate data in `data/raw/` and `data/csv/`:
```bash
python code/sphaera_harvest.py
```

Outputs generated:
- `data/raw/<query>__marcxml.xml`: raw MARCXML records for each query term.
- `data/csv/ALL__deduped.csv`: all deduplicated catalogue records with parsed MARC fields.
- `data/csv/MANUSCRIPTS_ONLY.csv`: records filtered to manuscripts (MARC Leader pos 06 in `t`, `d`, `f`).
- `data/csv/_SUMMARY.csv`: query totals and manuscript breakdown per search term.

---

## Running the Jupyter Notebooks

1. Start Jupyter:
   ```bash
   jupyter notebook
   ```
   *(or `jupyter lab`)*

2. In the browser, navigate to the `notebooks/` folder and open:
   - `01_explore_harvest.ipynb`: Inspect query metrics, evaluate manuscript filter flags, review MARC field frequency, and inspect complete record fields.
   - `02_view_images.ipynb`: Browse manuscript image folders and view high-resolution page facsimiles inline.

3. Make sure the notebook kernel is set to **`sphaera`**.
