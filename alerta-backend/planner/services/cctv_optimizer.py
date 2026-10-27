"""Budget-constrained CCTV placement using greedy marginal coverage per cost."""
import math
import uuid

from .geometry import (segment_blocked, angle_deg,
                       angular_difference, point_in_polygon)


DEFAULT_CAMERA_PARAMS = {
    "price": 120.0, "fov_deg": 90.0,
    "max_range_px": 400, "mount_height_px": 0, "direction_deg": 0.0,
}
DEFAULT_GRID_PX = 25
MAX_CAMERAS = 12
CRITICAL_WEIGHT = 5.0
CORRIDOR_WEIGHT = 2.0
NORMAL_WEIGHT = 1.0
ENTRANCE_RADIUS_PX = 40


def _grid_from_rooms(rooms, w, h, grid_px):
    if not rooms:
        rooms = [{"polygon": [[0, 0], [w, 0], [w, h], [0, h]]}]
    pts, weights = [], []
    for gy in range(0, h, grid_px):
        for gx in range(0, w, grid_px):
            pt = (gx + grid_px // 2, gy + grid_px // 2)
            if any(point_in_polygon(pt, [tuple(p) for p in r["polygon"]])
                   for r in rooms):
                pts.append(pt); weights.append(NORMAL_WEIGHT)
    return pts, weights


def _assign_critical_weights(pts, weights, entrances, corridors):
    for i, pt in enumerate(pts):
        for e in entrances:
            if abs(pt[0] - e["x"]) <= ENTRANCE_RADIUS_PX and \
               abs(pt[1] - e["y"]) <= ENTRANCE_RADIUS_PX:
                weights[i] = max(weights[i], CRITICAL_WEIGHT)
        for c in corridors:
            if point_in_polygon(pt, [tuple(p) for p in c["polygon"]]):
                weights[i] = max(weights[i], CORRIDOR_WEIGHT)


def _candidates(walls, rooms, entrances, w, h):
    out, seen = [], set()
    def add(x, y, t="standard"):
        k = (int(x) // 15, int(y) // 15)
        if k in seen: return
        seen.add(k)
        out.append({"x": int(x), "y": int(y), "type": t})
    for wall in walls:
        add((wall["x1"] + wall["x2"]) // 2, (wall["y1"] + wall["y2"]) // 2)
    for r in rooms:
        poly = r["polygon"]
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        for x, y in poly:
            add(x + (cx - x) * 0.05, y + (cy - y) * 0.05)
    for e in entrances:
        add(e["x"], e["y"], "entrance")
    if not out:
        out.append({"x": w // 2, "y": h // 2, "type": "standard"})
    return out


def _orient(cands, rooms):
    for cam in cands:
        best_d, best_a = float("inf"), 0.0
        for r in rooms:
            poly = r["polygon"]
            cx = sum(p[0] for p in poly) / len(poly)
            cy = sum(p[1] for p in poly) / len(poly)
            d = math.hypot(cx - cam["x"], cy - cam["y"])
            if d < best_d:
                best_d = d
                best_a = angle_deg((cam["x"], cam["y"]), (cx, cy))
        cam["direction_deg"] = best_a


def _visible(cam, target, walls, fov, max_r):
    dx, dy = target[0] - cam["x"], target[1] - cam["y"]
    dist = math.hypot(dx, dy)
    if dist > max_r or dist < 1: return False
    if segment_blocked((cam["x"], cam["y"]), target, walls): return False
    ang = angle_deg((cam["x"], cam["y"]), target)
    if angular_difference(cam.get("direction_deg", 0.0), ang) > fov / 2.0:
        return False
    return True


def optimize_cameras(analysis, budget, camera_config=None):
    budget = float(budget)
    if budget <= 0: raise ValueError("Budget must be positive")
    params = dict(DEFAULT_CAMERA_PARAMS)
    if camera_config:
        params.update({k: v for k, v in camera_config.items() if v is not None})
    if params["fov_deg"] <= 0 or params["fov_deg"] > 360:
        raise ValueError("fov_deg must be in (0, 360]")
    if params["max_range_px"] <= 0: raise ValueError("max_range_px must be positive")
    if params["price"] <= 0: raise ValueError("Camera price must be positive")

    w, h = analysis["image_width"], analysis["image_height"]
    walls = analysis.get("walls", [])
    rooms = analysis.get("rooms", [])
    entrances = analysis.get("entrances", [])
    corridors = analysis.get("corridors", [])

    pts, weights = _grid_from_rooms(rooms, w, h, DEFAULT_GRID_PX)
    if not pts:
        return {
            "selected_cameras": [], "total_cameras": 0, "total_cost": 0.0,
            "remaining_budget": round(budget, 2), "coverage_pct": 0.0,
            "critical_coverage_pct": 0.0, "blind_spots": [],
            "uncovered_critical": [],
            "warnings": ["No accessible floor area could be sampled."],
        }

    _assign_critical_weights(pts, weights, entrances, corridors)
    cands = _candidates(walls, rooms, entrances, w, h)
    _orient(cands, rooms)

    visibility = [
        [_visible(c, p, walls, params["fov_deg"], params["max_range_px"])
         for p in pts] for c in cands
    ]
    price = float(params["price"])
    selected, covered = [], [False] * len(pts)
    remaining, total_w = budget, sum(weights) or 1.0

    while remaining >= price and len(selected) < MAX_CAMERAS:
        best_i, best_s = None, 0.0
        for i in range(len(cands)):
            if i in selected: continue
            gain = sum(weights[j] for j in range(len(pts))
                       if visibility[i][j] and not covered[j])
            if gain <= 0: continue
            s = gain / price
            if s > best_s: best_s, best_i = s, i
        if best_i is None: break
        selected.append(best_i)
        remaining -= price
        for j in range(len(pts)):
            if visibility[best_i][j]: covered[j] = True

    cov_w = sum(weights[j] for j in range(len(pts)) if covered[j])
    crit = [j for j in range(len(pts)) if weights[j] >= CRITICAL_WEIGHT]
    crit_cov = [j for j in crit if covered[j]]
    crit_pct = 100.0 * len(crit_cov) / len(crit) if crit else 100.0

    out_cams = []
    for idx in selected:
        c = dict(cands[idx])
        c["id"] = uuid.uuid4().hex[:8]
        c["price"] = price
        c["fov_deg"] = params["fov_deg"]
        c["max_range_px"] = params["max_range_px"]
        out_cams.append(c)

    warnings = list(analysis.get("warnings", []))
    if not out_cams:
        warnings.append("Budget is below the cost of a single camera.")

    return {
        "selected_cameras": out_cams,
        "total_cameras": len(out_cams),
        "total_cost": round(price * len(out_cams), 2),
        "remaining_budget": round(remaining, 2),
        "coverage_pct": round(100.0 * cov_w / total_w, 2),
        "critical_coverage_pct": round(crit_pct, 2),
        "blind_spots": [pts[j] for j in range(len(pts)) if not covered[j]],
        "uncovered_critical": [pts[j] for j in crit if not covered[j]],
        "warnings": warnings,
        "camera_config_used": params,
        "grid_px": DEFAULT_GRID_PX,
    }
