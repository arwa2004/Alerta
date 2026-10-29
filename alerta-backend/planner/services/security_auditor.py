
import cv2
import numpy as np

from . import floorplan_analysis as _fp
from .floorplan_analysis import recommend_cameras

# ---------------------------------------------------------------------------
# tunables (kept in one place; every magic number below references one of
# these, so the scoring rules stay readable/auditable)
# ---------------------------------------------------------------------------
MIN_OPENING_FRAC = 0.015       # smallest gap kept as a real opening (share of plan's longest side)
MAX_OPENING_FRAC = 0.10        # largest gap still treated as a single door/window
ROOM_TOUCH_FRAC = 0.03         # how close (share of plan size) a gap must be to a room boundary to "belong" to it
EXTERIOR_MARGIN_FRAC = 0.02    # distance from the building's outer envelope counted as "on an exterior wall"

BLIND_SPOT_COVERAGE_PCT = 65.0   # recommend_cameras() room coverage below this => potential blind spot
LARGE_ROOM_AREA_FRAC = 0.22      # a room using this share of total mapped area counts as "large / open-plan"
CORRIDOR_ASPECT_RATIO = 2.6      # bbox long-side / short-side above which a room is treated as a corridor
CORRIDOR_MIN_OPENINGS = 3        # corridor is flagged as a chokepoint once this many openings feed into it

RISK_POINTS = {"low": 5, "medium": 12, "high": 25}
RISK_LEVEL_BANDS = (
    (75, "critical"), (50, "high"), (25, "moderate"), (0, "low"),
)

DEFAULT_CAMERA_PARAMS = dict(fov_deg=90, range_frac=0.85,
                             target_coverage=0.90, min_room_frac=0.03)


# ---------------------------------------------------------------------------
# step 1 — opening (door/window) candidate detection
# ---------------------------------------------------------------------------
def _detect_openings_px(image_path, max_width=_fp.DEFAULT_MAX_WIDTH,
                        gap_frac=0.12, min_structure_frac=0.10,
                        auto_crop=True, target_plan_width=1200):
    """Mirrors the first stages of `analyse_floor_plan()` (same helpers, same
    default parameters) but keeps the pixels that `_bridge_gaps()` adds —
    those are exactly the door/window-sized gaps in the wall structure.
    Returns a list of opening candidates in ORIGINAL image coordinates."""
    img = _fp._load_grayscale(image_path)
    img, scale = _fp._downscale(img, max_width)
    H, W = img.shape

    if auto_crop:
        pre = _fp._remove_border_bars(_fp._binarize(img))
        ox, oy, cw, ch = _fp._locate_plan(pre, W, H)
    else:
        ox, oy, cw, ch = 0, 0, W, H
    crop = img[oy:oy + ch, ox:ox + cw]

    up = max(1.0, target_plan_width / float(cw))
    if up > 1.0:
        crop = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    h, w = crop.shape
    size = max(w, h)

    binary = _fp._remove_border_bars(_fp._binarize(crop))
    raw_walls = _fp._extract_walls(binary, w, h)
    if not np.any(raw_walls):
        return [], 1.0 / scale / up

    t_est = _fp._estimate_wall_thickness(raw_walls)
    max_gap = int(size * gap_frac) | 1
    bridged = _fp._bridge_gaps(raw_walls, max_gap, max_thick=int(1.5 * t_est) + 2)
    bridged = _fp._filter_components(
        bridged, lambda x, y, bw, bh, a: max(bw, bh) >= min_structure_frac * size)

    # pixels present after bridging but not in the raw wall mask = the gaps
    # that got sealed, i.e. candidate doors/windows.
    gap_mask = cv2.bitwise_and(bridged, cv2.bitwise_not(raw_walls))

    ys, xs = np.where(bridged > 0)
    if xs.size == 0:
        return [], 1.0 / scale / up
    bx0, bx1, by0, by1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    margin = max(4, int(size * EXTERIOR_MARGIN_FRAC))

    inv = 1.0 / scale

    def to_orig(px, py):
        return (int((px / up + ox) * inv), int((py / up + oy) * inv))

    n, labels, stats, centroids = cv2.connectedComponentsWithStats(gap_mask, connectivity=8)
    openings = []
    for i in range(1, n):
        x, y, bw, bh, area = [int(v) for v in stats[i]]
        length = max(bw, bh)
        if length < size * MIN_OPENING_FRAC or length > size * MAX_OPENING_FRAC:
            continue
        cx, cy = centroids[i]
        near_exterior = (cx - bx0 < margin or bx1 - cx < margin or
                        cy - by0 < margin or by1 - cy < margin)
        ox_, oy_ = to_orig(cx, cy)
        openings.append({
            "x": ox_, "y": oy_,
            "length_px": round(length * inv / up, 1),
            "near_exterior": bool(near_exterior),
        })
    return openings, t_est * inv / up


def _rooms_touching_point(point, rooms, max_dist):
    """Rooms whose polygon boundary passes within `max_dist` of `point`."""
    touching = []
    for r in rooms:
        poly = np.array(r["polygon"], np.int32)
        if poly.shape[0] < 3:
            continue
        dist = cv2.pointPolygonTest(poly, (float(point[0]), float(point[1])), True)
        if abs(dist) <= max_dist:
            touching.append(r["id"])
    return touching


def _classify_openings(openings, rooms, wall_thickness_px, plan_size_px):
    """Attaches each opening candidate to the room(s) around it and labels it
    as an interior door, an exterior opening, or unplaced (discarded noise)."""
    max_dist = max(6.0, wall_thickness_px * 2.5, plan_size_px * ROOM_TOUCH_FRAC)
    classified = []
    for idx, op in enumerate(openings, start=1):
        room_ids = _rooms_touching_point((op["x"], op["y"]), rooms, max_dist)
        if not room_ids:
            continue  # not next to any detected room -> likely noise (text, furniture)
        entry = {
            "id": idx,
            "x": op["x"], "y": op["y"],
            "length_px": op["length_px"],
            "room_ids": room_ids,
            "editable": True,
        }
        if op["near_exterior"] or len(room_ids) == 1:
            entry["opening_type"] = "exterior_opening"
            entry["label"] = "Possible door or window (unconfirmed)"
            entry["confidence"] = "low"
        else:
            entry["opening_type"] = "interior_door"
            entry["label"] = "Possible interior door"
            entry["confidence"] = "medium"
        classified.append(entry)
    return classified


# ---------------------------------------------------------------------------
# step 2 — geometric risk rules
# ---------------------------------------------------------------------------
def _room_bbox_aspect(room):
    _, _, bw, bh = room["bbox"]
    if min(bw, bh) <= 0:
        return 1.0
    return max(bw, bh) / float(min(bw, bh))


def _band_for_score(score):
    for threshold, label in RISK_LEVEL_BANDS:
        if score >= threshold:
            return label
    return "low"


def _finding(category, severity, title, explanation, recommendation,
            room_id=None, location=None, polygon=None, uncertain=False):
    return {
        "category": category,
        "severity": severity,
        "points": RISK_POINTS[severity],
        "title": title,
        "explanation": explanation,
        "recommendation": recommendation,
        "room_id": room_id,
        "location": location,
        "polygon": polygon,
        "uncertain": uncertain,
    }


def build_risk_report(result, plan_width_m=None):
    """Main entry point. `result` is the dict returned by
    `analyse_floor_plan()`. Returns a JSON-serialisable risk report."""
    rooms = result.get("rooms") or []
    risks = []
    notes = []

    if not rooms:
        return {
            "risk_score": 0,
            "risk_level": "low",
            "risks": [],
            "openings": [],
            "room_coverage": {},
            "notes": ["No rooms were detected on this floor plan, so no "
                     "risk analysis could be produced. Try re-analysing the "
                     "plan or uploading a clearer image."],
            "overlay_b64": None,
            "scoring_explanation": "No rooms detected: score is 0 by default.",
        }

    # analysis-level caveats (not scored, just surfaced to the user)
    if result.get("confidence", 1.0) < 0.7:
        notes.append("The underlying floor-plan analysis reported low "
                     "confidence (walls may be partially misread). Review "
                     "the detections below before relying on this report.")
    for w in result.get("warnings") or []:
        notes.append(w)

    room_by_id = {r["id"]: r for r in rooms}
    total_area = float(sum(r["area_px"] for r in rooms)) or 1.0

    # ---- openings --------------------------------------------------------
    openings_px, wall_px = [], 3.0
    try:
        openings_px, wall_px = _detect_openings_px(result["_image_path"])
    except Exception:
        notes.append("Door/window detection could not run on this image; "
                     "openings are not shown, but rooms and coverage are "
                     "still analysed.")
    plan_size_px = max(result.get("image_width", 1), result.get("image_height", 1))
    openings = _classify_openings(openings_px, rooms, wall_px, plan_size_px)

    connections = {r["id"]: 0 for r in rooms}
    exterior_openings_by_room = {r["id"]: 0 for r in rooms}
    for op in openings:
        for rid in op["room_ids"]:
            connections[rid] = connections.get(rid, 0) + 1
            if op["opening_type"] == "exterior_opening":
                exterior_openings_by_room[rid] = exterior_openings_by_room.get(rid, 0) + 1

    # ---- camera-visibility coverage (reuses recommend_cameras as-is) -----
    room_coverage = {}
    try:
        cam_result = recommend_cameras(result, plan_width_m=plan_width_m,
                                       **DEFAULT_CAMERA_PARAMS)
        room_coverage = cam_result.get("room_coverage", {})
    except Exception:
        notes.append("Camera-visibility simulation could not run, so "
                     "potential blind spots could not be estimated.")

    # ---- rule 1: isolated rooms -------------------------------------------
    for r in rooms:
        rid = r["id"]
        total_links = connections.get(rid, 0)
        if total_links == 0:
            risks.append(_finding(
                "isolated_area", "high",
                f"Room {rid} has no detected door or opening",
                f"No door, window or passage was detected connecting room "
                f"{rid} to the rest of the building. This may be a "
                f"detection gap, or a genuinely isolated/sealed space.",
                "Verify this room in person. If it is a real enclosed "
                "space (storage, plant room), make sure it has its own "
                "access control; if it is a detection error, correct it "
                "manually.",
                room_id=rid, location=r["centroid"], polygon=r["polygon"],
                uncertain=True,
            ))
        elif total_links == 1 and exterior_openings_by_room.get(rid, 0) == total_links:
            risks.append(_finding(
                "isolated_area", "medium",
                f"Room {rid} is only reachable from outside",
                f"Room {rid} has {total_links} detected opening, and it "
                f"leads directly outside rather than to another interior "
                f"room. There is no detected interior path to/from this "
                f"room, which limits both monitoring and evacuation routes.",
                "Confirm whether this is intentional (e.g. a garage or "
                "annex). If people use this room, consider whether an "
                "interior connection or dedicated camera coverage is "
                "needed.",
                room_id=rid, location=r["centroid"], polygon=r["polygon"],
                uncertain=True,
            ))

    # ---- rule 2: exterior openings / entry points --------------------------
    for r in rooms:
        rid = r["id"]
        n_ext = exterior_openings_by_room.get(rid, 0)
        if n_ext == 0:
            continue
        cov = room_coverage.get(rid) or room_coverage.get(str(rid))
        poorly_covered = cov is not None and cov < BLIND_SPOT_COVERAGE_PCT
        if n_ext >= 2 and poorly_covered:
            severity = "high"
        elif n_ext >= 2 or poorly_covered:
            severity = "medium"
        else:
            severity = "low"
        cov_txt = f" Estimated camera coverage for this room is only " \
                  f"{cov:.0f}%." if poorly_covered else ""
        risks.append(_finding(
            "exterior_opening", severity,
            f"Room {rid} has {n_ext} exterior opening(s)",
            f"Room {rid} has {n_ext} detected door/window opening(s) on "
            f"an exterior-facing wall.{cov_txt} Each exterior opening is "
            f"a potential forced-entry point.",
            "Make sure every exterior opening in this room is covered by "
            "a camera and, where applicable, by a door/window sensor. "
            "Openings flagged as 'unconfirmed' should be checked and "
            "corrected if they are not real doors or windows.",
            room_id=rid, location=r["centroid"], polygon=r["polygon"],
            uncertain=True,
        ))

    # ---- rule 3: blind spots (from camera-coverage simulation) ------------
    for r in rooms:
        rid = r["id"]
        cov = room_coverage.get(rid, room_coverage.get(str(rid)))
        if cov is None or cov >= BLIND_SPOT_COVERAGE_PCT:
            continue
        area_frac = r["area_px"] / total_area
        severity = "high" if (exterior_openings_by_room.get(rid, 0) > 0 or
                              area_frac >= LARGE_ROOM_AREA_FRAC) else "medium"
        risks.append(_finding(
            "blind_spot", severity,
            f"Room {rid} is a potential camera blind spot",
            f"Under a standard wide-angle camera layout (90° field of "
            f"view), simulated coverage of room {rid} is only "
            f"{cov:.0f}%, which is below the {BLIND_SPOT_COVERAGE_PCT:.0f}% "
            f"target used for this audit.",
            "Add or reposition a camera for this room — a corner mount "
            "usually covers the most floor area. Re-run the CCTV "
            "placement tool for a concrete suggestion.",
            room_id=rid, location=r["centroid"], polygon=r["polygon"],
        ))

    # ---- rule 4: large open-plan rooms -------------------------------------
    for r in rooms:
        rid = r["id"]
        area_frac = r["area_px"] / total_area
        if area_frac < LARGE_ROOM_AREA_FRAC:
            continue
        risks.append(_finding(
            "open_plan", "low",
            f"Room {rid} is a large open area",
            f"Room {rid} accounts for about {area_frac * 100:.0f}% of the "
            f"total mapped floor area. Large open spaces are harder to "
            f"fully cover with a single fixed camera.",
            "Consider multiple camera angles or a wider field-of-view "
            "lens for this room rather than relying on one fixed camera.",
            room_id=rid, location=r["centroid"], polygon=r["polygon"],
        ))

    # ---- rule 5: corridors / chokepoints -----------------------------------
    for r in rooms:
        rid = r["id"]
        if _room_bbox_aspect(r) < CORRIDOR_ASPECT_RATIO:
            continue
        n_links = connections.get(rid, 0)
        if n_links < CORRIDOR_MIN_OPENINGS:
            continue
        risks.append(_finding(
            "corridor_chokepoint", "medium",
            f"Room {rid} is a corridor with {n_links} connected openings",
            f"Room {rid} has an elongated shape typical of a corridor or "
            f"hallway, and {n_links} openings connect into it. Corridors "
            f"that many rooms open onto are natural chokepoints for "
            f"movement through the building.",
            "A single well-placed camera covering the length of this "
            "corridor is usually efficient and gives good coverage of "
            "everyone passing through.",
            room_id=rid, location=r["centroid"], polygon=r["polygon"],
        ))

    # ---- score --------------------------------------------------------------
    score = min(100, sum(f["points"] for f in risks))
    level = _band_for_score(score)
    breakdown = {}
    for f in risks:
        breakdown[f["category"]] = breakdown.get(f["category"], 0) + f["points"]
    scoring_explanation = (
        f"Score = sum of points for every detected risk, capped at 100. "
        f"Each finding contributes {RISK_POINTS['low']} (low), "
        f"{RISK_POINTS['medium']} (medium) or {RISK_POINTS['high']} (high) "
        f"points. Breakdown by category: " +
        ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in breakdown.items())
        if risks else
        "No risk factors were detected, so the score is 0."
    )

    return {
        "risk_score": score,
        "risk_level": level,
        "risks": risks,
        "openings": openings,
        "room_coverage": room_coverage,
        "notes": notes,
        "overlay_b64": None,  # filled in by render_overlay()
        "scoring_explanation": scoring_explanation,
    }


# ---------------------------------------------------------------------------
# step 3 — colour-coded overlay image
# ---------------------------------------------------------------------------
_SEVERITY_COLOR_BGR = {
    "low": (90, 190, 90),       # green
    "medium": (0, 165, 255),    # orange
    "high": (40, 40, 220),      # red
    None: (210, 210, 210),      # neutral grey — no risk on this room
}
_OPENING_COLOR_BGR = {
    "exterior_opening": (200, 90, 200),
    "interior_door": (230, 160, 40),
}


def render_overlay(result, report):
    """Draws room polygons tinted by worst severity + opening markers on top
    of the cleaned floor-plan image. Returns a base64 PNG data URL, same
    convention as analyse_floor_plan()/recommend_cameras()."""
    import base64 as _b64

    png = _b64.b64decode(result["cleaned_image_b64"].split(",", 1)[1])
    canvas = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    if canvas is None:
        return None

    worst = {}
    order = {"low": 0, "medium": 1, "high": 2}
    for f in report["risks"]:
        rid = f.get("room_id")
        if rid is None:
            continue
        if rid not in worst or order[f["severity"]] > order[worst[rid]]:
            worst[rid] = f["severity"]

    layer = canvas.copy()
    for r in result.get("rooms", []):
        severity = worst.get(r["id"])
        color = _SEVERITY_COLOR_BGR[severity]
        poly = np.array(r["polygon"], np.int32)
        if poly.shape[0] >= 3:
            cv2.fillPoly(layer, [poly], color)
    canvas = cv2.addWeighted(layer, 0.35, canvas, 0.65, 0)

    for r in result.get("rooms", []):
        severity = worst.get(r["id"])
        color = _SEVERITY_COLOR_BGR[severity]
        poly = np.array(r["polygon"], np.int32)
        if poly.shape[0] >= 3:
            cv2.polylines(canvas, [poly], True, color, 2)
        cx, cy = r["centroid"]
        cv2.putText(canvas, f"R{r['id']}", (cx - 10, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 2)

    for op in report["openings"]:
        color = _OPENING_COLOR_BGR.get(op["opening_type"], (120, 120, 120))
        cv2.circle(canvas, (op["x"], op["y"]), 6, color, -1)
        cv2.circle(canvas, (op["x"], op["y"]), 6, (255, 255, 255), 1)

    ok, buf = cv2.imencode(".png", canvas)
    if not ok:
        return None
    return "data:image/png;base64," + _b64.b64encode(buf).decode("utf-8")


# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------
def audit_floor_plan(result, image_path, plan_width_m=None):
    """result: dict from analyse_floor_plan(). image_path: the same image
    path that was analysed (needed to detect openings). Returns the full
    risk report, including the rendered overlay image."""
    result = dict(result)
    result["_image_path"] = image_path
    report = build_risk_report(result, plan_width_m=plan_width_m)
    if report["risks"] or report["openings"]:
        report["overlay_b64"] = render_overlay(result, report)
    else:
        report["overlay_b64"] = result.get("cleaned_image_b64")
    return report