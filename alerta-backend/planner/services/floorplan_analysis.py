"""OpenCV floor-plan analysis: structural wall mask + room detection."""
import base64
import cv2
import numpy as np

DEFAULT_MAX_WIDTH = 1600


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
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


def _filter_components(mask, keep_fn, connectivity=8):
    """Keep only components for which keep_fn(x, y, bw, bh, area) is True.
    Uses a lookup table, so it stays fast even with hundreds of components."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=connectivity)
    keep = np.zeros(n, dtype=bool)
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        keep[i] = keep_fn(int(x), int(y), int(bw), int(bh), int(area))
    return keep[labels].astype(np.uint8) * 255


def _estimate_wall_thickness(mask):
    dt = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    vals = dt[mask > 0]
    if vals.size == 0:
        return 3.0
    return float(2.0 * np.percentile(vals, 95))


# --------------------------------------------------------------------------
# pipeline steps
# --------------------------------------------------------------------------
def _binarize(img_gray, thr=None):
    """Otsu by default, so gray / low-contrast walls survive.
    Pass a number to force a fixed threshold."""
    if thr is None:
        blur = cv2.GaussianBlur(img_gray, (3, 3), 0)
        t, _ = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        thr = min(t, 200)          # never treat near-white as ink
    _, binary = cv2.threshold(img_gray, thr, 255, cv2.THRESH_BINARY_INV)
    return binary


def _remove_border_bars(mask):
    """Drop solid strips that span the image (screenshot borders, title bars)."""
    h, w = mask.shape
    size = max(w, h)

    def keep(x, y, bw, bh, area):
        touches = x == 0 or y == 0 or x + bw >= w or y + bh >= h
        spans = bw >= 0.9 * w or bh >= 0.9 * h
        solid = area / float(bw * bh) > 0.3
        thin = min(bw, bh) < 0.05 * size
        return not (touches and spans and solid and thin)

    return _filter_components(mask, keep)


def _extract_walls(binary, w, h, thin_frac=0.004):
    """Keep thick, long structures. Text, dimension lines, furniture outlines,
    door arcs and window frames are all thinner than a wall."""
    size = max(w, h)
    k = max(3, int(round(size * thin_frac))) | 1          # odd kernel
    walls = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))

    min_area = max(30, int(w * h * 0.0003))
    walls = _filter_components(walls, lambda x, y, bw, bh, a: a >= min_area)
    return walls


def _bridge_gaps(mask, max_gap, max_thick):
    """Close door/window gaps along the wall direction only.

    A plain directional close also fills the inside of narrow rooms (it joins
    two parallel walls). So we compute what the close WOULD add, and keep only
    the additions that are as thin as a wall (a real doorway gap). Fills that
    are tall/wide (room interiors) are discarded."""
    inv = cv2.bitwise_not(mask)
    out = mask.copy()

    for horizontal in (True, False):
        ksize = (max_gap, 1) if horizontal else (1, max_gap)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, ksize)
        fill = cv2.bitwise_and(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel), inv)
        if horizontal:
            keep = lambda x, y, bw, bh, a: bh <= max_thick
        else:
            keep = lambda x, y, bw, bh, a: bw <= max_thick
        out = cv2.bitwise_or(out, _filter_components(fill, keep))
    return out


def _rebuild_envelope(mask, thickness):
    """Windows break the exterior walls; for a rectangular building we just
    redraw the outer rectangle from the bounding box of the wall structure."""
    ys, xs = np.where(mask > 0)
    if xs.size == 0:
        return mask
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    t = max(3, int(round(thickness)))
    half = t // 2
    out = mask.copy()
    cv2.rectangle(out, (x0 + half, y0 + half), (x1 - half, y1 - half), 255, t)
    return out


def _find_rooms(walls_sealed, w, h):
    image_area = float(w * h)
    display_img = cv2.bitwise_not(walls_sealed)          # black walls, white bg

    # rooms = free-space regions that do not touch the image border
    free = cv2.bitwise_not(walls_sealed)
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(free, connectivity=4)

    rooms = []
    for i in range(1, n):
        x, y, bw, bh, area = [int(v) for v in stats[i]]
        if x == 0 or y == 0 or x + bw >= w or y + bh >= h:
            continue                                      # outside
        if area < image_area * 0.002:
            continue

        comp = (labels == i).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        cnt = max(cnts, key=cv2.contourArea)
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.008 * peri, True)
        if len(approx) < 3:
            continue

        rooms.append({
            "id": len(rooms) + 1,
            "type": "room",
            "polygon": [[int(p[0]), int(p[1])] for p in approx.reshape(-1, 2)],
            "area_px": round(float(area), 2),
            "centroid": [int(centroids[i][0]), int(centroids[i][1])],
            "bbox": [x, y, bw, bh],
        })
    return display_img, rooms


# --------------------------------------------------------------------------
# plan localisation (for pages that contain text, tables, titles, ...)
# --------------------------------------------------------------------------
def _locate_plan(binary, w, h, pad_frac=0.02):
    """Find the bounding box of the floor plan inside a larger page/image.
    Thin lines and text are removed, remaining ink is merged, and the blob
    with the largest bounding box is taken as the plan."""
    size = max(w, h)
    k = max(3, int(round(size * 0.003))) | 1
    solid = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    # page rules / table borders: very long and very thin -> not the plan
    solid = _filter_components(
        solid, lambda x, y, bw, bh, a: not (max(bw, bh) > 0.3 * size and
                                            min(bw, bh) < 0.012 * size))
    d = max(3, int(size * 0.06)) | 1
    merged = cv2.dilate(solid, np.ones((d, d), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)
    if n <= 1:
        return 0, 0, w, h
    best = max(range(1, n), key=lambda i: stats[i][2] * stats[i][3])
    x, y, bw, bh = [int(v) for v in stats[best][:4]]

    # trim attachments (scale bar, north arrow, labels): the building's outer
    # edges are where long wall lines start/end, i.e. where ink-per-column /
    # ink-per-row first reaches a good share of its peak.
    sub = (solid[y:y + bh, x:x + bw] > 0)
    cs, rs = sub.sum(axis=0), sub.sum(axis=1)
    xi = np.where(cs >= 0.4 * cs.max())[0]
    yi = np.where(rs >= 0.4 * rs.max())[0]
    x, bw = x + int(xi[0]), int(xi[-1] - xi[0] + 1)
    y, bh = y + int(yi[0]), int(yi[-1] - yi[0] + 1)

    p = int(size * pad_frac)
    x0, y0 = max(0, x - p), max(0, y - p)
    x1, y1 = min(w, x + bw + p), min(h, y + bh + p)
    return x0, y0, x1 - x0, y1 - y0


# --------------------------------------------------------------------------
# public entry point
# --------------------------------------------------------------------------
def analyse_floor_plan(image_path, max_width=DEFAULT_MAX_WIDTH,
                       gap_frac=0.12, min_structure_frac=0.10,
                       rect_envelope=True, auto_crop=True,
                       target_plan_width=1200):
    img = _load_grayscale(image_path)
    img, scale = _downscale(img, max_width)
    H, W = img.shape

    # 1. find the plan inside the page and crop to it
    if auto_crop:
        pre = _remove_border_bars(_binarize(img))
        ox, oy, cw, ch = _locate_plan(pre, W, H)
    else:
        ox, oy, cw, ch = 0, 0, W, H
    crop = img[oy:oy + ch, ox:ox + cw]

    # 2. small plans have thin walls: upscale so the filters have pixels to work with
    up = max(1.0, target_plan_width / float(cw))
    if up > 1.0:
        crop = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    h, w = crop.shape
    size = max(w, h)

    # 3. wall extraction on the cropped plan
    binary = _remove_border_bars(_binarize(crop))
    walls = _extract_walls(binary, w, h)

    t_est = _estimate_wall_thickness(walls)
    max_gap = int(size * gap_frac) | 1
    walls = _bridge_gaps(walls, max_gap, max_thick=int(1.5 * t_est) + 2)
    walls = _filter_components(
        walls, lambda x, y, bw, bh, a: max(bw, bh) >= min_structure_frac * size)
    if rect_envelope:
        walls = _rebuild_envelope(walls, t_est)

    display_crop, rooms = _find_rooms(walls, w, h)

    warnings = []
    if len(rooms) < 2:
        warnings.append("Very few rooms found: walls may be leaking. "
                        "Try a larger gap_frac or check the binarized mask.")

    # 4. map everything back to the original image coordinates
    inv = 1.0 / scale

    def to_orig(px, py):
        return [int((px / up + ox) * inv), int((py / up + oy) * inv)]

    for r in rooms:
        r["polygon"] = [to_orig(p[0], p[1]) for p in r["polygon"]]
        r["centroid"] = to_orig(*r["centroid"])
        x, y, bw, bh = r["bbox"]
        x0, y0 = to_orig(x, y)
        r["bbox"] = [x0, y0, int(bw / up * inv), int(bh / up * inv)]
        r["area_px"] = round(r["area_px"] / (up * up) * inv * inv, 2)

    # full-size display image with the cropped result pasted in place
    display = np.full((H, W), 255, np.uint8)
    display[oy:oy + ch, ox:ox + cw] = cv2.resize(
        display_crop, (cw, ch), interpolation=cv2.INTER_NEAREST)

    _, buffer = cv2.imencode(".png", display)
    cleaned_b64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "image_width": int(W / scale),
        "image_height": int(H / scale),
        "walls": [],
        "rooms": rooms,
        "cleaned_image_b64": f"data:image/png;base64,{cleaned_b64}",
        "confidence": 0.9 if not warnings else 0.5,
        "warnings": warnings,
        "units": "pixels",
    }


def debug_stages(image_path, out_prefix="dbg", max_width=DEFAULT_MAX_WIDTH):
    """Save the mask after every stage so you can see where walls disappear."""
    img, _ = _downscale(_load_grayscale(image_path), max_width)
    h, w = img.shape
    binary = _binarize(img)
    nobars = _remove_border_bars(binary)
    walls = _extract_walls(nobars, w, h)
    for name, m in (("1_binary", binary), ("2_no_bars", nobars), ("3_walls", walls)):
        cv2.imwrite(f"{out_prefix}_{name}.png", 255 - m)


# ==========================================================================
# CAMERA PLANNING  (add-on: uses the output of analyse_floor_plan, nothing
# above this line is modified)
# ==========================================================================
def _cam_cast_rays(walls, cx, cy, max_r, n_rays=720):
    """Distance (px) from (cx, cy) to the first wall along n_rays directions."""
    h, w = walls.shape
    ang = np.arange(n_rays) * (2.0 * np.pi / n_rays)
    r = np.arange(1, max_r + 1)
    xs = np.rint(cx + np.cos(ang)[:, None] * r[None, :]).astype(int)
    ys = np.rint(cy + np.sin(ang)[:, None] * r[None, :]).astype(int)
    inb = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    hit = np.ones(xs.shape, dtype=bool)                  # outside image = blocked
    hit[inb] = walls[ys[inb], xs[inb]]
    return np.where(hit.any(axis=1), hit.argmax(axis=1), max_r).astype(np.float32)


def _cam_sweep(first, c, fov, cx, cy, step_deg=0.5):
    """Wall-clipped FOV outline, vertices in sweep order (safe across 0/360)."""
    n = len(first)
    pts = [(cx, cy)]
    for d in np.arange(-fov / 2.0, fov / 2.0 + 1e-6, step_deg):
        a = (c + d) % 360.0
        r = first[int(a * n / 360.0) % n]
        pts.append((cx + r * np.cos(np.radians(a)), cy + r * np.sin(np.radians(a))))
    return pts


def _cam_window_gain(counts, fov):
    """For every centre direction c (0..359) sum counts over [c-fov/2, c+fov/2)."""
    half = fov // 2
    cs = np.concatenate([[0], np.cumsum(np.tile(counts, 3))])
    c = np.arange(360) + 360
    return cs[c - half + fov] - cs[c - half]


def _cam_candidates(result, s, free, dt, labels, d_min, bsize, W, H):
    """Realistic mounting spots.
    corner : convex room corner, camera looks along the corner's bisector
             (a 90-degree lens then covers the whole quadrant)
    wall   : middle of a long wall, looks straight into the room
    center : fallback so that every room has at least one candidate
    Each candidate: dict(x, y, kind, pref, spread, factor, room)
    pref/spread restrict the allowed viewing directions."""
    cands, seen = [], set()

    def add(x, y, rid, kind, pref, spread, factor):
        x, y = int(round(x)), int(round(y))
        if not (0 <= x < W and 0 <= y < H) or not free[y, x] or labels[y, x] != rid:
            return
        key = (x // 4, y // 4, kind)
        if key in seen:
            return
        seen.add(key)
        cands.append({"x": x, "y": y, "kind": kind, "pref": pref,
                      "spread": spread, "factor": factor, "room": rid})

    for r in result["rooms"]:
        rid = int(r["id"])
        poly = np.array(r["polygon"], np.float32) * s
        n = len(poly)
        for i in range(n):
            v, p, q = poly[i], poly[i - 1], poly[(i + 1) % n]
            u1, u2 = p - v, q - v
            l1, l2 = float(np.linalg.norm(u1)), float(np.linalg.norm(u2))
            if min(l1, l2) < 1e-3:
                continue
            u1, u2 = u1 / l1, u2 / l2

            # --- corner candidate -----------------------------------------
            b = u1 + u2
            nb = float(np.linalg.norm(b))
            if nb > 0.3:                                   # not a straight vertex
                b = b / nb
                theta = np.degrees(np.arccos(np.clip(float(np.dot(u1, u2)), -1, 1)))
                off = d_min / max(np.sin(np.radians(theta / 2.0)), 0.5)
                pref = float(np.degrees(np.arctan2(b[1], b[0])) % 360.0)
                add(v[0] + b[0] * off, v[1] + b[1] * off, rid, "corner", pref, 25, 1.0)

            # --- wall-mounted candidates on long edges ----------------------
            if l2 >= 0.25 * bsize:
                e = (q - v) / l2
                for t in (0.5,) if l2 < 0.5 * bsize else (0.3, 0.7):
                    m = v + (q - v) * t
                    for nx, ny in ((-e[1], e[0]), (e[1], -e[0])):
                        px, py = m[0] + nx * d_min, m[1] + ny * d_min
                        xi, yi = int(round(px)), int(round(py))
                        if 0 <= xi < W and 0 <= yi < H and free[yi, xi] and labels[yi, xi] == rid:
                            pref = float(np.degrees(np.arctan2(ny, nx)) % 360.0)
                            add(px, py, rid, "wall", pref, 40, 0.85)
                            break

        # --- fallback: deepest point of the room ---------------------------
        yy, xx = np.where(labels == rid)
        if len(xx):
            k = int(np.argmax(dt[yy, xx]))
            add(xx[k], yy[k], rid, "center", None, 180, 0.6)
    return cands


def recommend_cameras(result, fov_deg=90, range_frac=0.8, max_range_m=None,
                      max_cameras=12, target_coverage=0.90, min_room_frac=0.03,
                      exclude_room_ids=(), plan_width_m=None,
                      overlap_penalty=0.25, optional_weight=0.15,
                      min_unique_pct=1.0):
    """
    Recommend camera positions + directions so that the house is covered.

    result            : dict returned by analyse_floor_plan()
    fov_deg           : horizontal field of view of each camera (default 90)
    range_frac        : max camera range as a fraction of the building's longest side
    max_range_m       : alternative: range in metres (needs plan_width_m)
    plan_width_m      : real length (m) of the building's LONGEST side
    min_room_frac     : rooms smaller than this share of the total area are
                        optional (toilets, closets, ...)
    exclude_room_ids  : rooms you never want covered (bathrooms, bedrooms...)
    overlap_penalty   : 0..1, cost of re-covering something already seen
    optional_weight   : 0..1, value of seeing an optional room
    min_unique_pct    : a camera that adds less than this % of unique coverage
                        is removed in the pruning step

    Strategy: candidates are real mounting spots (convex corners looking along
    the diagonal, long-wall centres). A weighted greedy set-cover picks the best
    (spot, direction); then redundant cameras are pruned and directions refined.

    `angle_deg` is image-axis (0 = right, 90 = down); `bearing_deg` is compass
    style with the top of the plan as north.
    """
    import base64 as _b64

    # ---- decode the wall mask produced earlier ---------------------------
    png = _b64.b64decode(result["cleaned_image_b64"].split(",", 1)[1])
    gray = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    H, W = gray.shape
    walls = gray < 128
    s = W / float(result["image_width"])                 # original -> working px

    # ---- room label map -------------------------------------------------
    labels = np.zeros((H, W), np.int32)
    for r in result["rooms"]:
        poly = np.array([[int(p[0] * s), int(p[1] * s)] for p in r["polygon"]], np.int32)
        cv2.fillPoly(labels, [poly], int(r["id"]))
    labels[walls] = 0
    areas = {int(r["id"]): int((labels == r["id"]).sum()) for r in result["rooms"]}
    if not areas or sum(areas.values()) == 0:
        return {"cameras": [], "coverage_pct": 0.0, "room_coverage": {},
                "optional_room_ids": [], "overlay_b64": None,
                "warnings": ["No rooms to cover."]}

    ys, xs = np.where(labels > 0)
    bsize = float(max(xs.max() - xs.min(), ys.max() - ys.min()))
    if max_range_m and plan_width_m:
        max_r = int(bsize * max_range_m / float(plan_width_m))
    else:
        max_r = int(bsize * range_frac)
    total_area = float(sum(areas.values()))

    # ---- target points (what must be seen) -------------------------------
    g = max(3, int(bsize * 0.008))
    gy, gx = np.mgrid[g // 2:H:g, g // 2:W:g]
    tx, ty = gx.ravel(), gy.ravel()
    t_room = labels[ty, tx]
    keep = t_room > 0
    tx, ty, t_room = tx[keep].astype(np.float32), ty[keep].astype(np.float32), t_room[keep]
    req_room = {rid: (areas[rid] / total_area >= min_room_frac) and (rid not in exclude_room_ids)
                for rid in areas}
    required = np.array([req_room[int(rid)] for rid in t_room])
    if not required.any():
        required[:] = True
        req_room = {rid: True for rid in areas}
    n_req = float(required.sum())

    # ---- candidates + visibility -----------------------------------------
    free = ((labels > 0) & ~walls).astype(np.uint8)
    dt = cv2.distanceTransform(free, cv2.DIST_L2, 3)
    d_min = max(4.0, bsize * 0.018)
    cands = _cam_candidates(result, s, free, dt, labels, d_min, bsize, W, H)

    vis_l, deg_l, ray_l = [], [], []
    for cd in cands:
        first = _cam_cast_rays(walls, cd["x"], cd["y"], max_r)
        dx, dy = tx - cd["x"], ty - cd["y"]
        dist = np.hypot(dx, dy)
        ang = np.degrees(np.arctan2(dy, dx)) % 360.0
        ridx = (ang * (len(first) / 360.0)).astype(int) % len(first)
        vis_l.append((dist <= max_r) & (dist <= first[ridx]))
        deg_l.append(ang.astype(np.int32) % 360)
        ray_l.append(first)

    fov = int(fov_deg)

    def allowed_mask(cd):
        m = np.zeros(360, bool)
        if cd["pref"] is None:
            m[:] = True
        else:
            for d in range(-cd["spread"], cd["spread"] + 1):
                m[int(round(cd["pref"] + d)) % 360] = True
        return m

    allowed = [allowed_mask(cd) for cd in cands]

    def best_direction(ci, cover_count):
        """Best viewing direction for candidate ci given what is already seen."""
        w = np.where(cover_count == 0,
                     np.where(required, 1.0, optional_weight),
                     np.where(required, -overlap_penalty, 0.0))
        sel = vis_l[ci]
        if not sel.any():
            return 0.0, None
        hist = np.bincount(deg_l[ci][sel], weights=w[sel], minlength=360)
        score = _cam_window_gain(hist, fov).astype(np.float64)
        score[~allowed[ci]] = -1e9
        c = int(score.argmax())
        return float(score[c]) * cands[ci]["factor"], c

    def cov_of(ci, c):
        diff = np.abs((deg_l[ci] - c + 180) % 360 - 180)
        return vis_l[ci] & (diff <= fov / 2.0)

    # ---- weighted greedy set cover ---------------------------------------
    count = np.zeros(len(tx), np.int32)
    chosen = []
    for _ in range(max_cameras):
        if (required & (count == 0)).sum() / n_req <= 1.0 - target_coverage:
            break
        best = (0.0, None, None)
        for ci in range(len(cands)):
            sc, c = best_direction(ci, count)
            if c is not None and sc > best[0]:
                best = (sc, ci, c)
        if best[1] is None or best[0] < 0.008 * n_req:
            break
        _, ci, c = best
        cv = cov_of(ci, c)
        count += cv
        chosen.append({"ci": ci, "c": c})

    # ---- prune cameras that add (almost) nothing unique --------------------
    changed = True
    while changed and len(chosen) > 1:
        changed = False
        covs = [cov_of(k["ci"], k["c"]) for k in chosen]
        total = sum(covs)
        uniq = [(cv & required & (total == 1)).sum() / n_req * 100.0 for cv in covs]
        j = int(np.argmin(uniq))
        if uniq[j] < min_unique_pct:
            chosen.pop(j)
            changed = True

    # ---- refine directions given the others --------------------------------
    for _ in range(2):
        for j, k in enumerate(chosen):
            others = np.zeros(len(tx), np.int32)
            for jj, kk in enumerate(chosen):
                if jj != j:
                    others += cov_of(kk["ci"], kk["c"])
            sc, c = best_direction(k["ci"], others)
            if c is not None:
                k["c"] = c

    # order: biggest contribution first, then number them
    running = np.zeros(len(tx), bool)
    final = []
    pool = list(chosen)
    while pool:
        gains = [(cov_of(k["ci"], k["c"]) & ~running).sum() for k in pool]
        j = int(np.argmax(gains))
        k = pool.pop(j)
        cv = cov_of(k["ci"], k["c"])
        k["cov"], k["new"] = cv, int((cv & ~running).sum())
        running |= cv
        final.append(k)
    chosen = final
    covered = running

    # ---- report ----------------------------------------------------------
    room_cov = {}
    for rid in areas:
        m = t_room == rid
        room_cov[int(rid)] = round(float(100.0 * covered[m].mean()), 1) if m.any() else 0.0

    cameras = []
    for n_, k in enumerate(chosen, 1):
        cd, c = cands[k["ci"]], int(k["c"])
        in_rooms = {}
        for rid in np.unique(t_room[k["cov"]]):
            m = t_room == rid
            in_rooms[int(rid)] = round(float(100.0 * k["cov"][m].mean()), 1)
        poly = [[int(px / s), int(py / s)]
                for px, py in _cam_sweep(ray_l[k["ci"]], c, fov, cd["x"], cd["y"], 1.0)]
        why = {"corner": "corner mount, looking along the diagonal",
               "wall": "wall mount, looking into the room",
               "center": "central mount (no good corner)"}[cd["kind"]]
        cameras.append({
            "id": n_,
            "fov_polygon": poly,
            "position": [int(cd["x"] / s), int(cd["y"] / s)],
            "room_id": int(cd["room"]),
            "mount": cd["kind"],
            "placement": why,
            "angle_deg": c,
            "bearing_deg": int((c + 90) % 360),
            "fov_deg": fov,
            "range_px": int(max_r / s),
            "range_m": round(max_r / bsize * plan_width_m, 1) if plan_width_m else None,
            "sees_rooms_pct": in_rooms,
            "new_coverage_pct": round(100.0 * k["new"] / len(tx), 1),
        })

    # ---- overlay image ----------------------------------------------------
    canvas = np.full((H, W, 3), 255, np.uint8)
    canvas[walls] = (0, 0, 0)
    layer = canvas.copy()
    palette = [(255, 160, 60), (80, 200, 120), (70, 70, 230), (200, 90, 200),
               (40, 190, 230), (160, 120, 40), (120, 120, 255), (200, 200, 60)]
    for n_, k in enumerate(chosen):
        cd = cands[k["ci"]]
        pts = _cam_sweep(ray_l[k["ci"]], k["c"], fov, cd["x"], cd["y"])
        cv2.fillPoly(layer, [np.array(pts, np.int32)], palette[n_ % len(palette)])
    canvas = cv2.addWeighted(layer, 0.35, canvas, 0.65, 0)
    canvas[walls] = (0, 0, 0)
    for n_, k in enumerate(chosen, 1):
        cd, c = cands[k["ci"]], k["c"]
        cx, cy = cd["x"], cd["y"]
        tip = (int(cx + 22 * np.cos(np.radians(c))), int(cy + 22 * np.sin(np.radians(c))))
        cv2.arrowedLine(canvas, (cx, cy), tip, (0, 0, 200), 2, tipLength=0.4)
        cv2.circle(canvas, (cx, cy), 7, (0, 0, 200), -1)
        cv2.putText(canvas, str(n_), (cx + 8, cy - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 200), 2)
    _, buf = cv2.imencode(".png", canvas)

    skipped = [int(rid) for rid in areas if not req_room[rid]]
    warnings = []
    total_cov = round(float(100.0 * covered[required].mean()), 1)
    if total_cov < 100.0 * target_coverage:
        warnings.append("Target coverage not reached: raise max_cameras or range.")
    return {
        "cameras": cameras,
        "coverage_pct": total_cov,
        "room_coverage": room_cov,
        "optional_room_ids": skipped,
        "overlay_b64": "data:image/png;base64," + _b64.b64encode(buf).decode("utf-8"),
        "warnings": warnings,
    }