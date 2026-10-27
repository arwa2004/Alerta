"""OpenCV floor-plan analysis: Pure Text Masking + Geometry Extraction."""
import cv2
import numpy as np
import base64
import math
from .geometry import point_in_polygon

DEFAULT_MAX_WIDTH = 1600

def _load_grayscale(path):
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None or img.size == 0:
        raise ValueError("Unreadable floor-plan image")
    return img

def _downscale(img, max_width=DEFAULT_MAX_WIDTH):
    h, w = img.shape
    if w <= max_width:
        return img, 1.0
    scale = max_width / float(w)
    return cv2.resize(img, (int(w * scale), int(h * scale)),
                      interpolation=cv2.INTER_AREA), scale

def _remove_text_pure_mask(img_gray):
    h_img, w_img = img_gray.shape
    blurred = cv2.GaussianBlur(img_gray, (3, 3), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(thresh, connectivity=8)
    text_mask = np.zeros_like(thresh)

    for i in range(1, num_labels):
        x, y, w, h, area = stats[i]
        rect_area = w * h
        if area < 15: 
            text_mask[labels == i] = 255
            continue
        if w > w_img * 0.25 or h > h_img * 0.25: continue
        if w > h * 10 or h > w * 10: continue
        extent = area / float(rect_area)
        if extent < 0.2: continue 
        text_mask[labels == i] = 255
        
    cleaned_img = img_gray.copy()
    cleaned_img[text_mask == 255] = 255
    return cleaned_img

def _detect_walls(cleaned_img):
    inv = cv2.bitwise_not(cleaned_img)
    lines = cv2.HoughLinesP(inv, 1, np.pi/180, threshold=50, minLineLength=30, maxLineGap=5)
    
    walls = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line.flatten()
            length = math.hypot(x2 - x1, y2 - y1)
            if length > 30:
                walls.append({
                    "type": "wall", "x1": int(x1), "y1": int(y1), 
                    "x2": int(x2), "y2": int(y2),
                    "length": round(length, 2), "confidence": 0.9, "opaque": True
                })
    return walls

def _detect_rooms(cleaned_img, image_w, image_h):
    _, structural_mask = cv2.threshold(cleaned_img, 200, 255, cv2.THRESH_BINARY_INV)
    kernel = np.ones((3,3), np.uint8)
    structural_mask = cv2.dilate(structural_mask, kernel, iterations=1)
    contours, _ = cv2.findContours(structural_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    rooms = []
    image_area = float(image_w * image_h)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < (image_area * 0.01) or area > (image_area * 0.90): continue
        eps = 0.02 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, eps, True)
        polygon = [[int(x), int(y)] for x, y in approx.reshape(-1, 2)]
        if len(polygon) < 3: continue
        rooms.append({
            "type": "room", "polygon": polygon, "area_px": round(area, 2),
            "confidence": 0.9, "closed": True
        })
    return rooms

def analyse_floor_plan(image_path, max_width=DEFAULT_MAX_WIDTH):
    img = _load_grayscale(image_path)
    img, scale = _downscale(img, max_width)
    h, w = img.shape

    cleaned_img = _remove_text_pure_mask(img)
    walls = _detect_walls(cleaned_img)
    rooms = _detect_rooms(cleaned_img, w, h)

    # Only encode the clean image
    _, buffer_cleaned = cv2.imencode('.png', cleaned_img)
    cleaned_b64 = base64.b64encode(buffer_cleaned).decode('utf-8')

    return {
        "image_width": w, "image_height": h, 
        "walls": walls, 
        "rooms": rooms, 
        "cleaned_image_b64": f"data:image/png;base64,{cleaned_b64}",
        "confidence": 0.9, "warnings": [], "units": "pixels",
    }