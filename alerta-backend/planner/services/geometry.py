"""Pure-geometry helpers. No Django imports."""
import math


def segments_intersect(p1, p2, p3, p4):
    def ccw(a, b, c):
        return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0])

    d1 = ccw(p3, p4, p1)
    d2 = ccw(p3, p4, p2)
    d3 = ccw(p1, p2, p3)
    d4 = ccw(p1, p2, p4)
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True

    def on_seg(a, b, c):
        return (min(a[0], b[0]) <= c[0] <= max(a[0], b[0]) and
                min(a[1], b[1]) <= c[1] <= max(a[1], b[1]))

    if abs(d1) < 1e-9 and on_seg(p3, p4, p1): return True
    if abs(d2) < 1e-9 and on_seg(p3, p4, p2): return True
    if abs(d3) < 1e-9 and on_seg(p1, p2, p3): return True
    if abs(d4) < 1e-9 and on_seg(p1, p2, p4): return True
    return False


def segment_blocked(p1, p2, walls):
    a, b = (p1[0], p1[1]), (p2[0], p2[1])
    for w in walls:
        c = (w["x1"], w["y1"])
        d = (w["x2"], w["y2"])
        if a == c or a == d or b == c or b == d:
            continue
        if segments_intersect(a, b, c, d):
            return True
    return False


def point_in_polygon(pt, poly):
    x, y = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and \
           (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def angle_deg(p_from, p_to):
    dx = p_to[0] - p_from[0]
    dy = p_to[1] - p_from[1]
    return math.degrees(math.atan2(dy, dx))


def angular_difference(a, b):
    d = abs(a - b) % 360.0
    return d if d <= 180.0 else 360.0 - d
