#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract illustration patches from manuscript images using modern foundation models.

Workflow (inspired by arXiv:2309.01674):
1. Load each page image marked as illustration in the CSV.
2. Run Grounding‑DINO with a text prompt (e.g. "illustration") to obtain bounding boxes.
3. Refine each box with Segment‑Anything (SAM) to get a pixel‑accurate mask.
4. Crop the region, apply the mask (transparent background), and save as PNG.

All models are available on Hugging Face:
- Grounding‑DINO: IDEA-Research/grounding-dino-base
- SAM (Segment‑Anything): facebook/sam-vit-huge (or sam-vit-base for lighter GPU)

Requirements (install once):
    pip install torch torchvision transformers pillow tqdm
    pip install git+https://github.com/facebookresearch/segment-anything.git
"""

import csv
import pathlib
import sys
from tqdm import tqdm
import numpy as np
import torch
from PIL import Image
from groundingdino.util import SLConfig
from groundingdino.models import build_model
from segment_anything import SamPredictor, sam_model_registry
from huggingface_hub import hf_hub_download

# ---------------------------------------------------------------------------
# Configuration – adjust if you move the project layout
# ---------------------------------------------------------------------------
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW_DIR = (PROJECT_ROOT / "images") if (PROJECT_ROOT / "images").exists() else (PROJECT_ROOT / "data" / "raw")
CSV_PATH = PROJECT_ROOT / "data" / "csv" / "ILLUSTRATIONS_DETECTED.csv"
OUT_DIR = PROJECT_ROOT / "data" / "illustrations"

# ---------------------------------------------------------------------------
# Model loading (once)
# ---------------------------------------------------------------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Grounding‑DINO – text‑prompted object detector
PROCESSOR = AutoProcessor.from_pretrained("IDEA-Research/grounding-dino-base")
# Grounding‑DINO model – download config & weights via huggingface_hub
# The model repo provides a pytorch checkpoint named 'groundingdino_swint_ogc.pth'
# We'll download it to a cache directory and load with the dedicated class.
checkpoint_path = hf_hub_download(repo_id="ShilongLiu/GroundingDINO", filename="groundingdino_swint_ogc.pth")
checkpoint = torch.load(checkpoint_path, map_location=DEVICE)
DETECTOR = GroundingDinoForObjectDetection.from_pretrained("IDEA-Research/grounding-dino-base").to(DEVICE)
DETECTOR.load_state_dict(checkpoint["model"])

# SAM – pixel‑level segmentation (use vit_h for best quality)
# SAM model – download the checkpoint file from the official repo on HuggingFace
sam_checkpoint = hf_hub_download(repo_id="facebook/sam-vit-huge", filename="sam_vit_h_4b8939.pth")
SAM_MODEL = sam_model_registry["vit_h"](checkpoint=sam_checkpoint)
SAM_MODEL.to(DEVICE)
SAM_PRED = SamPredictor(SAM_MODEL)

PROMPT = "illustration"  # you can add synonyms like "diagram, map, figure"

def detect_boxes(image: Image.Image):
    """Run Grounding‑DINO on a PIL image and return bounding boxes (pixel coordinates)."""
    inputs = PROCESSOR(text=PROMPT, images=image, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        outputs = DETECTOR(**inputs)
    results = PROCESSOR.post_process_object_detection(
        outputs, threshold=0.3, target_sizes=[image.size[::-1]]
    )[0]["boxes"].cpu().numpy()
    return results

def segment_masks(image_np: np.ndarray, boxes):
    """Given an RGB numpy array and a list of boxes, return binary masks (H×W)."""
    SAM_PRED.set_image(image_np)
    masks = []
    for box in boxes:
        mask, _, _ = SAM_PRED.predict(point_coords=None, point_labels=None, box=box, multimask_output=False)
        masks.append(mask[0])
    return masks

def crop_and_save(img_path: pathlib.Path, boxes, masks):
    img = Image.open(img_path).convert("RGB")
    for i, (box, mask) in enumerate(zip(boxes, masks)):
        if mask.sum() < 0.05 * mask.size:
            continue
        x0, y0, x1, y1 = map(int, box)
        cropped_img = img.crop((x0, y0, x1, y1))
        cropped_mask = Image.fromarray((mask[y0:y1, x0:x1] * 255).astype("uint8"))
        cropped_img.putalpha(cropped_mask)
        dst_folder = OUT_DIR / img_path.parent.name
        dst_folder.mkdir(parents=True, exist_ok=True)
        dst_path = dst_folder / f"{img_path.stem}_illust_{i}.png"
        cropped_img.save(dst_path)

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in tqdm(reader, desc="Scanning CSV"):
            if row["illustration"].strip().lower() != "true":
                continue
            img_name = f"{row['mms_id']}_{int(row['page_number']):04d}.jpg"
            img_path = RAW_DIR / img_name
            if not img_path.is_file():
                candidates = list(RAW_DIR.glob(f"{row['mms_id']}_*/{int(row['page_number']):04d}.jpg"))
                if not candidates:
                    print(f"⚠️  Image not found for {row['mms_id']} page {row['page_number']}")
                    continue
                img_path = candidates[0]
            try:
                pil_img = Image.open(img_path).convert("RGB")
                boxes = detect_boxes(pil_img)
                if len(boxes) == 0:
                    continue
                masks = segment_masks(np.array(pil_img), boxes)
                crop_and_save(img_path, boxes, masks)
            except Exception as e:
                print(f"⚠️  Failed on {img_path}: {e}")

if __name__ == "__main__":
    main()
