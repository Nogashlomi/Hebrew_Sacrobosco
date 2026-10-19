# -*- coding: utf-8 -*-
"""Illustration extraction using only OpenCV.
This fallback does not require Detectron2 or LayoutParser models.
It looks for large dark/colored blobs that are typical of manuscript figures.
"""

import pathlib
from typing import List
import cv2
import tqdm


def _find_figures(bgr, min_area_ratio=0.001, max_area_ratio=0.5):
    """Return a list of bounding boxes (x1, y1, x2, y2) for candidate figures.
    Uses simple thresholding and contour filtering.
    """
    h, w = bgr.shape[:2]
    page_area = w * h
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # Invert: figures often darker than background
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        box_area = bw * bh
        area_ratio = box_area / page_area if page_area else 0
        if min_area_ratio <= area_ratio <= max_area_ratio:
            boxes.append((x, y, x + bw, y + bh))
    return boxes


def extract_illustrations(
    input_dir: str,
    output_dir: str,
    *,
    confidence: float = 0.5,  # kept for API compatibility, not used
    min_area_ratio: float = 0.001,
    max_area_ratio: float = 0.5,
    device: str = "cpu",  # kept for API compatibility, not used
) -> List[pathlib.Path]:
    """Scan a folder of manuscript page images and save cropped figures.
    Parameters are compatible with the previous version so existing code
    (e.g., run_extractor.py) does not need changes.
    """
    input_path = pathlib.Path(input_dir).expanduser().resolve()
    output_path = pathlib.Path(output_dir).expanduser().resolve()
    if not input_path.is_dir():
        raise FileNotFoundError(f"Input directory not found: {input_path}")
    # Prepare output folder
    if output_path.exists():
        for f in output_path.iterdir():
            f.unlink()
    else:
        output_path.mkdir(parents=True)

    image_files = sorted(
        [p for p in input_path.rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}]
    )
    if not image_files:
        raise FileNotFoundError(f"No image files found in {input_path}")

    saved: List[pathlib.Path] = []
    for img_path in tqdm.tqdm(image_files, desc="Scanning pages"):
        bgr = cv2.imread(str(img_path))
        if bgr is None:
            tqdm.tqdm.write(f"[WARN] Could not read {img_path}")
            continue
        boxes = _find_figures(bgr, min_area_ratio, max_area_ratio)
        for idx, (x1, y1, x2, y2) in enumerate(boxes, start=1):
            crop = bgr[y1:y2, x1:x2]
            out_name = f"{img_path.stem}_fig{idx:03d}.png"
            out_path = output_path / out_name
            cv2.imwrite(str(out_path), crop)
            saved.append(out_path)
    return saved
