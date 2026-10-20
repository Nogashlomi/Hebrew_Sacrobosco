# -*- coding: utf-8 -*-
"""Debug the OpenCV fallback on a single image.
Prints how many candidate figure boxes are detected and their sizes.
"""

import pathlib
import cv2
import numpy as np

def _find_figures(bgr, min_area_ratio=0.001, max_area_ratio=0.5):
    h, w = bgr.shape[:2]
    page_area = w * h
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        box_area = bw * bh
        area_ratio = box_area / page_area if page_area else 0
        if min_area_ratio <= area_ratio <= max_area_ratio:
            boxes.append((x, y, x + bw, y + bh, area_ratio))
    return boxes

# Choose a sample image
sample_path = pathlib.Path.cwd() / "images" / "990000463750205171_NLI_Ms._Heb._6694_28" / "0001.jpg"
print(f"Loading {sample_path}")
img = cv2.imread(str(sample_path))
if img is None:
    raise RuntimeError("Could not read sample image")
boxes = _find_figures(img)
print(f"Found {len(boxes)} candidate figure boxes")
for i, (x1, y1, x2, y2, ratio) in enumerate(boxes, start=1):
    print(f"  Box {i}: ({x1},{y1})‑({x2},{y2})  ratio={ratio:.4f}")
