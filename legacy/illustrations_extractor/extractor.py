# -*- coding: utf-8 -*-
"""
Illustration extraction using only OpenCV with a few heuristics to reject
front‑matter artefacts (titles, borders, headers, footers, etc.).
"""

import pathlib
from typing import List
import cv2
import tqdm

# Optional LayoutParser import – if unavailable we fall back to pure OpenCV heuristics.
try:
    import layoutparser as lp
except ImportError:
    lp = None  # type: ignore


def _is_illustration(region: "np.ndarray", page_mean: float) -> bool:
    """Return True if *region* looks like an illustration.

    Heuristics:
    * **Variance** – should be above a threshold (texture).
    * **Edge density** – Canny edges should occupy a reasonable fraction.
    * **Contrast** – mean intensity should differ from the overall page mean.
    """
    if region.var() < 1200:
        return False
    edges = cv2.Canny(region, 50, 150)
    if edges.mean() < 0.08:
        return False
    # Contrast check: require at least 45 intensity difference (out of 255)
    if abs(region.mean() - page_mean) < 45:
        return False
    return True

def _find_figures(
    bgr,
    min_area_ratio: float = 0.001,
    max_area_ratio: float = 0.5,
    use_contrast: bool = False,
    contrast_thresh: float = 0.15,
    edge_density_thresh: float = 0.05,
    variance_thresh: float = 600,
    margin_ratio: float = 0.07,
) -> List[tuple]:
    """Return bounding boxes (x1, y1, x2, y2) that look like manuscript figures.

    Parameters
    ----------
    bgr : np.ndarray
        BGR image read by OpenCV.
    min_area_ratio / max_area_ratio :
        Relative size of the box to the whole page.
    use_contrast :
        If True, also require the box’s mean intensity to differ from the
        page mean by at least ``contrast_thresh`` (percentage of 0‑255).
    contrast_thresh :
        Relative intensity difference required when ``use_contrast`` is True.
    """
    h, w = bgr.shape[:2]
    page_area = w * h
    page_mean = bgr.mean()
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    contours, _ = cv2.findContours(
        thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    boxes = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        box_area = bw * bh
        area_ratio = box_area / page_area if page_area else 0
        if not (min_area_ratio <= area_ratio <= max_area_ratio):
            continue
        y_start_norm = y / h
        if not (0.10 <= y_start_norm <= 0.90):
            continue
        aspect = bw / bh if bh != 0 else 0
        if not (0.7 <= aspect <= 1.5) or bw < 150 or bh < 150:
            continue
        if use_contrast:
            box = bgr[y : y + bh, x : x + bw]
            box_mean = box.mean()
            if abs(box_mean - page_mean) / 255 < contrast_thresh:
                continue
        # New heuristics to filter out non‑illustrations
        margin_x = int(margin_ratio * w)
        margin_y = int(margin_ratio * h)
        if x < margin_x or y < margin_y or (x + bw) > (w - margin_x) or (y + bh) > (h - margin_y):
            continue
        box_region = bgr[y : y + bh, x : x + bw]
        # Require sufficient texture variance to filter out plain text blocks
        if box_region.var() < variance_thresh:
            continue
        # Edge density filter: ensure the region contains enough edges (illustrations are usually more detailed)
        edges = cv2.Canny(box_region, 50, 150)
        if edges.mean() < edge_density_thresh:
            continue
        boxes.append((x, y, x + bw, y + bh))
    return boxes
def _detect_figures_lp(bgr, device="cpu"):
    """Detect figures using LayoutParser if available.

    Returns a list of (x1, y1, x2, y2) boxes.
    """
    # If layoutparser is not imported or does not provide Detectron2LayoutModel, fallback.
    if lp is None or not hasattr(lp, "Detectron2LayoutModel"):
        return []
    try:
        model = lp.Detectron2LayoutModel(
            "lp://PubLayNet/faster_rcnn_R_50_FPN_3x/config",
            extra_config=["MODEL.ROI_HEADS.SCORE_THRESH_TEST", 0.5],
            label_map={0: "Text", 1: "Title", 2: "List", 3: "Table", 4: "Figure"},
            device=device,
        )
        layout = model.detect(bgr)
        boxes = []
        for lo in layout:
            if lo.type == "Figure":
                x1, y1, x2, y2 = lo.coordinates
                boxes.append((int(x1), int(y1), int(x2), int(y2)))
        return boxes
    except Exception as e:
        # Log warning and fallback to empty list so OpenCV heuristics are used.
        print(f"[WARN] LayoutParser figure detection failed: {e}")
        return []

def extract_illustrations(
    input_dir: str,
    output_dir: str,
    *,
    confidence: float = 0.5,
    min_area_ratio: float = 0.001,
    max_area_ratio: float = 0.5,
    device: str = "cpu",
    use_contrast: bool = False,
    contrast_thresh: float = 0.15,
    debug: bool = False,
    debug_dir: str = "debug_overlays",
) -> List[pathlib.Path]:
    """Scan a folder of manuscript page images and save cropped figures.

    Parameters
    ----------
    input_dir, output_dir : str
        Paths to the source image folder and the destination folder.
    confidence :
        Ignored – present only to stay compatible with the previous API.
    min_area_ratio / max_area_ratio :
        Relative size thresholds for candidate boxes.
    use_contrast / contrast_thresh :
        If ``use_contrast`` is True, a box must differ enough from the page
        background in average intensity.
    """
    input_path = pathlib.Path(input_dir).expanduser().resolve()
    output_path = pathlib.Path(output_dir).expanduser().resolve()
    if not input_path.is_dir():
        raise FileNotFoundError(f"Input directory not found: {input_path}")
    output_path.mkdir(parents=True, exist_ok=True)
    if debug:
        debug_path = pathlib.Path(debug_dir).expanduser().resolve()
        debug_path.mkdir(parents=True, exist_ok=True)
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
        if lp is not None:
            boxes = _detect_figures_lp(bgr, device=device)
            if not boxes:
                # Fallback to OpenCV heuristics if LayoutParser finds nothing
                boxes = _find_figures(
                    bgr,
                    min_area_ratio=min_area_ratio,
                    max_area_ratio=max_area_ratio,
                    use_contrast=use_contrast,
                    contrast_thresh=contrast_thresh,
                    edge_density_thresh=0.05,
                    variance_thresh=600,
                    margin_ratio=0.07,
                )
        else:
            boxes = _find_figures(
                bgr,
                min_area_ratio=min_area_ratio,
                max_area_ratio=max_area_ratio,
                use_contrast=use_contrast,
                contrast_thresh=contrast_thresh,
                edge_density_thresh=0.05,
                variance_thresh=600,
                margin_ratio=0.07,
            )
        for idx, (x1, y1, x2, y2) in enumerate(boxes, start=1):
            crop = bgr[y1:y2, x1:x2]
            out_name = f"{img_path.stem}_fig{idx:03d}.png"
            out_path = output_path / out_name
            cv2.imwrite(str(out_path), crop)
            saved.append(out_path)
            if debug:
                # create overlay with rectangle
                overlay = bgr.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), 2)
                debug_name = f"{img_path.stem}_debug{idx:03d}.png"
                debug_path = pathlib.Path(debug_dir) / debug_name
                cv2.imwrite(str(debug_path), overlay)
    return saved
