#!/usr/bin/env python3
"""coredeep_extraction.py

YOLO‑based image extraction (CoreDeep) for historical book pages.

Usage:
    python3 scripts/coredeep_extraction.py \
        --input-dir /path/to/page_images \
        --output-dir /path/to/extracted_illustrations \
        --model-path /path/to/coredeep_yolo_weights.pt

The script scans each image in ``--input-dir``, runs the CoreDeep YOLO model
to locate visual elements (illustrations, diagrams, printer’s marks, etc.),
crops the detected regions, and saves them as separate PNG files in
``--output-dir`` preserving a simple CSV manifest with metadata.

Dependencies:
    pip install "ultralytics>=8.0" tqdm pillow opencv-python

The CoreDeep model weights should be a YOLOv8/YOLOv5 ``.pt`` checkpoint
trained on the Sphaera corpus. Place the weights file at the path supplied
via ``--model-path``.
"""

import argparse
import csv
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
from tqdm import tqdm
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def load_model(model_path: str) -> YOLO:
    """Load a YOLO model.

    If *model_path* points to an existing .pt file we load that checkpoint.
    If the file does not exist we fall back to a built‑in Ultralytics model name
    (e.g. "yolov5s.pt"). Ultralytics will download the weights automatically.
    """
    if Path(model_path).is_file():
        return YOLO(model_path)
    # Ensure the fallback name ends with .pt so Ultralytics knows to download
    if not model_path.lower().endswith('.pt'):
        model_path = f"{model_path}.pt"
    print(f"[INFO] Model file not found – falling back to built‑in model '{model_path}'.")
    return YOLO(model_path)


def detect_boxes(model: YOLO, image: np.ndarray) -> List[Tuple[int, int, int, int, str, float]]:
    """Run the YOLO model on a single image.

    Returns a list of tuples ``(x1, y1, x2, y2, class_name, confidence)``.
    """
    results = model(image)[0]
    boxes = []
    for box in results.boxes:
        xyxy = box.xyxy.cpu().numpy().flatten().astype(int).tolist()
        conf = float(box.conf.cpu().numpy())
        cls_id = int(box.cls.cpu().numpy())
        class_name = results.names.get(cls_id, "unknown")
        boxes.append((*xyxy, class_name, conf))
    return boxes


def crop_and_save(image: np.ndarray, box: Tuple[int, int, int, int], out_path: Path) -> None:
    """Crop a region defined by ``box`` and write it as PNG.

    ``box`` is ``(x1, y1, x2, y2)``. Creates parent directories if needed.
    """
    x1, y1, x2, y2 = box
    crop = image[y1:y2, x1:x2]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), crop)

# ---------------------------------------------------------------------------
# Main CLI workflow
# ---------------------------------------------------------------------------

def main() -> None:
    # New CLI options for size‑based filtering
    parser = argparse.ArgumentParser(description="CoreDeep YOLO image extraction with size filtering")
    parser.add_argument("--max-area-ratio", type=float, default=0.9,
                        help="Maximum fraction of the image area a detection may cover (default 0.9)")
    parser.add_argument("--min-area-ratio", type=float, default=0.01,
                        help="Minimum fraction of the image area a detection must cover (default 0.01)")
    parser.add_argument("--input-dir", type=Path, required=True, help="Folder with page images (JPG/PNG)")
    parser.add_argument("--output-dir", type=Path, required=True, help="Folder where crops will be stored")
    parser.add_argument("--model-path", type=Path, required=True, help="Path to CoreDeep YOLO .pt checkpoint")
    parser.add_argument("--confidence", type=float, default=0.35, help="Minimum confidence to keep a detection")
    args = parser.parse_args()
EXCLUDE_CLASSES = {"book"}

    model = load_model(str(args.model_path))

    manifest_path = args.output_dir / "extraction_manifest.csv"
    with open(manifest_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["source_image", "crop_path", "class", "confidence", "x1", "y1", "x2", "y2"])

        image_files = sorted([p for p in args.input_dir.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
        for img_path in tqdm(image_files, desc="Processing pages"):
            bgr = cv2.imread(str(img_path))
            if bgr is None:
                tqdm.write(f"[WARN] Unable to read {img_path}")
                continue
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            detections = detect_boxes(model, rgb)
            img_h, img_w = bgr.shape[:2]
            img_area = img_w * img_h
            for idx, (x1, y1, x2, y2, cls_name, conf) in enumerate(detections, start=1):
                if conf < args.confidence:
                    continue
                if cls_name in EXCLUDE_CLASSES:
                    continue
                # Compute detection area ratio
                box_area = max(0, (x2 - x1)) * max(0, (y2 - y1))
                area_ratio = box_area / img_area if img_area > 0 else 0
                if area_ratio > args.max_area_ratio or area_ratio < args.min_area_ratio:
                    continue
                crop_name = f"{img_path.stem}_crop{idx:03d}_{cls_name}.png"
                crop_path = args.output_dir / crop_name
                crop_and_save(bgr, (x1, y1, x2, y2), crop_path)
                writer.writerow([img_path.name, crop_name, cls_name, f"{conf:.4f}", x1, y1, x2, y2])


    print(f"\nExtraction complete. Manifest written to {manifest_path}")

if __name__ == "__main__":
    main()
