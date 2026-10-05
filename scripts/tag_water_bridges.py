#!/usr/bin/env python3
"""Tag which bridges in site/map_*.json actually cross water (property wb = 1).

Rowers care about bridges over water (clearance, arches). Overpasses over roads, rail and parks are clutter on a
rowing chart. A road or rail bridge is tagged wb = 1 when any point along it lies inside a water polygon or within
25 m of a mapped waterway. The map draws the heavy bridge symbol only for wb = 1. Safe to run again.
Usage: python scripts/tag_water_bridges.py
"""
import json, math, os, glob

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
NEAR_M = 25.0


def lines(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "LineString": return [c]
    if t == "MultiLineString": return c
    return []


def rings(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon": return [c]
    if t == "MultiPolygon": return c
    return []


def pip(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]; xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi:
            inside = not inside
        j = i
    return inside


def in_polygons(x, y, polys):
    for poly in polys:
        if pip(x, y, poly[0]) and not any(pip(x, y, h) for h in poly[1:]):
            return True
    return False


def sample(coords, step_m, k):
    """Points along a line every step_m metres (k = metres per degree of longitude)."""
    out = [coords[0]]
    for a, b in zip(coords, coords[1:]):
        d = math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 111320.0)
        n = max(1, int(d // step_m))
        for i in range(1, n + 1):
            f = i / n; out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out


def seg_dist_m(px, py, a, b, k):
    ax, ay, bx, by = a[0] * k, a[1] * 111320.0, b[0] * k, b[1] * 111320.0
    px, py = px * k, py * 111320.0
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def process(path):
    d = json.load(open(path, encoding="utf-8"))
    lat = sum(d["_bbox"][1::2]) / 2
    k = 111320.0 * math.cos(math.radians(lat))
    polys = [p for f in d["water"]["features"] for p in rings(f["geometry"])]
    ww = [seg for f in d["waterway"]["features"] for ln in lines(f["geometry"]) for seg in zip(ln, ln[1:])]
    # index waterway segments on a coarse grid so each bridge only checks nearby ones
    cell = 0.002; grid = {}
    for a, b in ww:
        for gx in range(int(min(a[0], b[0]) / cell) - 1, int(max(a[0], b[0]) / cell) + 2):
            for gy in range(int(min(a[1], b[1]) / cell) - 1, int(max(a[1], b[1]) / cell) + 2):
                grid.setdefault((gx, gy), []).append((a, b))
    stats = {}
    for layer in ("roads", "rail"):
        n = on = 0
        for f in d[layer]["features"]:
            if f["properties"].get("bridge") != 1:
                continue
            n += 1; wet = False
            for ln in lines(f["geometry"]):
                for (x, y) in sample(ln, 10, k):
                    if in_polygons(x, y, polys) or any(seg_dist_m(x, y, a, b, k) <= NEAR_M for a, b in grid.get((int(x / cell), int(y / cell)), [])):
                        wet = True; break
                if wet: break
            f["properties"]["wb"] = 1 if wet else 0
            on += wet
        stats[layer] = (n, on)
    json.dump(d, open(path, "w", encoding="utf-8"), separators=(",", ":"))
    return stats


if __name__ == "__main__":
    for p in sorted(glob.glob(os.path.join(ROOT, "map_*.json"))):
        print(os.path.basename(p), process(p), "(bridges, over water)")
