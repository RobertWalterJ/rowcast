#!/usr/bin/env python3
"""Add the Hamilton Harbour venue (Leander Boat Club) to site/ data files.

The Overpass map-data service would not answer, so this venue takes its water outline from the official CHS chart
instead: it renders the chart for the harbour, treats everything that is not the chart's land colours as water, and
traces the outline (marching squares). The app draws the CHS chart as the base map for this venue. Weather snapshots
come from Open-Meteo (the app replaces them with live data as soon as it opens). Safe to run again.
Needs: numpy, pillow. Usage: python scripts/add_venue_hamilton.py
"""
import io, json, math, os, urllib.parse, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
BBOX = (-79.93, 43.245, -79.77, 43.325)           # west, south, east, north
CLUB = ("Leander Boat Club", -79.8642, 43.2736)    # 50 Leander Drive
CHS = "https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/chs/ENC_MaritimeChartService/MapServer/exts/MaritimeChartService/WMSServer"
R = 6378137.0
mx = lambda lon: lon * math.pi / 180 * R
my = lambda lat: math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * R
unx = lambda x: x / R * 180 / math.pi
uny = lambda y: (2 * math.atan(math.exp(y / R)) - math.pi / 2) * 180 / math.pi
UA = {"User-Agent": "RowCast/1.0 (personal rowing app)"}


def get(url, raw=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        b = r.read()
    return b if raw else json.loads(b)


def water_mask(W=1600):
    w, s, e, n = BBOX; x0, x1, y0, y1 = mx(w), mx(e), my(s), my(n); H = int(W * (y1 - y0) / (x1 - x0))
    url = f"{CHS}?service=WMS&version=1.3.0&request=GetMap&layers=0,1,2,3,4,5,6,7,10,11&styles=&format=image/png&crs=EPSG:3857&width={W}&height={H}&bbox={x0},{y0},{x1},{y1}"
    a = np.array(Image.open(io.BytesIO(get(url, raw=True))).convert("RGB")).astype(int)
    land = np.zeros(a.shape[:2], bool)
    for c in [(176, 158, 86), (206, 197, 138)]:          # the chart's two land colours
        land |= (np.abs(a - np.array(c)).sum(axis=2) < 30)
    water = ~land
    # halve the resolution (majority of each 2 x 2 block) to smooth labels and symbols
    h2, w2 = H // 2, W // 2
    m = water[: h2 * 2, : w2 * 2].reshape(h2, 2, w2, 2).mean(axis=(1, 3)) >= 0.5
    return m, (x0, x1, y0, y1), (W, H)


def keep_big(mask, min_cells):
    """Drop water specks (chart text over land) smaller than min_cells, using flood fill."""
    H, W = mask.shape; seen = np.zeros_like(mask); out = np.zeros_like(mask)
    for si in range(H):
        for sj in range(W):
            if mask[si, sj] and not seen[si, sj]:
                st = [(si, sj)]; seen[si, sj] = True; cells = []
                while st:
                    i, j = st.pop(); cells.append((i, j))
                    for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        a, b = i + di, j + dj
                        if 0 <= a < H and 0 <= b < W and mask[a, b] and not seen[a, b]:
                            seen[a, b] = True; st.append((a, b))
                if len(cells) >= min_cells:
                    for i, j in cells: out[i, j] = True
    return out


def contours(mask):
    """Marching squares: closed outlines (list of rings of (x, y) in doubled grid units) of the True cells."""
    B = np.pad(mask, 1); H, W = B.shape; seg = {}
    def add(p, q): seg.setdefault(p, []).append(q); seg.setdefault(q, []).append(p)
    for i in range(H - 1):
        for j in range(W - 1):
            tl, tr, br, bl = B[i, j], B[i, j + 1], B[i + 1, j + 1], B[i + 1, j]
            c = tl * 8 + tr * 4 + br * 2 + bl
            if c in (0, 15): continue
            T, Rr, Bm, L = (2 * j + 1, 2 * i), (2 * j + 2, 2 * i + 1), (2 * j + 1, 2 * i + 2), (2 * j, 2 * i + 1)
            pairs = {1: [(L, Bm)], 2: [(Bm, Rr)], 3: [(L, Rr)], 4: [(T, Rr)], 5: [(T, L), (Bm, Rr)], 6: [(T, Bm)], 7: [(T, L)], 8: [(T, L)], 9: [(T, Bm)],
                     10: [(T, Rr), (L, Bm)], 11: [(T, Rr)], 12: [(L, Rr)], 13: [(Bm, Rr)], 14: [(L, Bm)]}[c]
            for p, q in pairs: add(p, q)
    rings, used = [], set()
    for start in list(seg):
        if start in used: continue
        ring = [start]; used.add(start); prev, cur = None, start
        while True:
            nxt = [q for q in seg[cur] if q != prev and (q not in used or q == start)]
            if not nxt: break
            q = nxt[0]
            if q == start: break
            ring.append(q); used.add(q); prev, cur = cur, q
        if len(ring) > 8: rings.append([(x / 2 - 1, y / 2 - 1) for x, y in ring])   # undo the pad
    return rings


def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1e-9
    d = [abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / L for p in pts[1:-1]]; k = max(range(len(d)), key=d.__getitem__) if d else 0
    if d and d[k] > tol: return dp(pts[: k + 2], tol)[:-1] + dp(pts[k + 1:], tol)
    return [a, b]


def build_map():
    m, (x0, x1, y0, y1), (W, H) = water_mask(); m = keep_big(m, 600)
    m = ~keep_big(~m, 40)  # fill tiny land specks (labels, symbols) inside the water
    h2, w2 = m.shape; out = []
    for ring in contours(m):
        k = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)  # split a closed ring at the farthest point
        ring = dp(ring[: k + 1], 1.0)[:-1] + dp(ring[k:] + [ring[0]], 1.0)
        if len(ring) < 5: continue
        out.append([[round(unx(x0 + (x1 - x0) * (px * 2) / W), 5), round(uny(y1 - (y1 - y0) * (py * 2) / H), 5)] for px, py in ring])
    empty = {"type": "FeatureCollection", "features": []}
    d = {k: dict(empty) for k in ["waterway", "landcover", "buildings", "roads", "rail", "structures", "power", "hazards", "seamarks", "seamark_areas", "landmarks", "depth", "depth_contours"]}
    d["water"] = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": out}}]}
    d["places"] = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"kind": "rowing", "name": CLUB[0]}, "geometry": {"type": "Point", "coordinates": [CLUB[1], CLUB[2]]}}]}
    d["_bbox"] = list(BBOX)
    json.dump(d, open(os.path.join(ROOT, "map_hamilton.json"), "w"), separators=(",", ":"))
    print("map_hamilton.json:", len(out), "water rings,", sum(len(r) for r in out), "points")


def weather():
    w, s, e, n = BBOX; nx = ny = 8
    lats = [n + (s - n) * j / (ny - 1) for j in range(ny)]; lons = [w + (e - w) * i / (nx - 1) for i in range(nx)]
    pts = [(la, lo) for la in lats for lo in lons]
    q = urllib.parse.urlencode({"latitude": ",".join(f"{p[0]:.4f}" for p in pts), "longitude": ",".join(f"{p[1]:.4f}" for p in pts),
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,temperature_2m,dew_point_2m", "timezone": "America/Toronto", "forecast_days": 3})
    d = get("https://api.open-meteo.com/v1/forecast?" + q); times = d[0]["hourly"]["time"]; sl = slice(0, 48)
    wind = {"nx": nx, "ny": ny, "bbox": list(BBOX), "time": times[sl], "u": [], "v": [], "g": [], "vis": [], "t": [], "td": []}
    for k in range(len(times[sl])):
        u, v, g, vis, t, td = [], [], [], [], [], []
        for p in d:
            h = p["hourly"]; sp = h["wind_speed_10m"][k] or 0; rad = math.radians(h["wind_direction_10m"][k] or 0)
            u.append(round(-sp * math.sin(rad), 1)); v.append(round(-sp * math.cos(rad), 1)); g.append(round(h["wind_gusts_10m"][k] or 0)); vis.append(int(h["visibility"][k] or 0))
            t.append(round(h["temperature_2m"][k], 1)); td.append(round(h["dew_point_2m"][k], 1))
        for key, val in (("u", u), ("v", v), ("g", g), ("vis", vis), ("t", t), ("td", td)): wind[key].append(val)
    lat, lon = 43.285, -79.855
    hv = "temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,cloud_cover_low,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cape,pressure_msl"
    f = get("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({"latitude": lat, "longitude": lon, "hourly": hv,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max", "timezone": "America/Toronto", "past_days": 1, "forecast_days": 5, "wind_speed_unit": "kmh"}))
    key = {"temperature_2m": "t", "apparent_temperature": "feels", "dew_point_2m": "dew", "precipitation_probability": "pop", "precipitation": "rain", "weather_code": "code", "cloud_cover_low": "lowcloud",
           "visibility": "vis", "wind_speed_10m": "wind", "wind_direction_10m": "dir", "wind_gusts_10m": "gust", "cape": "cape", "pressure_msl": "pres"}
    ints = {"vis", "cape", "code", "pop", "dir", "lowcloud"}; hourly = {"time": f["hourly"]["time"]}
    for k, sh in key.items(): hourly[sh] = [None if x is None else (int(round(x)) if sh in ints else round(x, 1)) for x in f["hourly"][k]]
    return wind, {"name": "Leander BC", "place": "Hamilton Harbour, ON", "lat": lat, "lon": lon, "current": None, "hourly": hourly, "daily": f["daily"], "alerts": []}


def merge():
    wind, fc = weather()
    p = os.path.join(ROOT, "wx.json"); wx = json.load(open(p)); wx["hamilton"] = {"wind": wind, "alerts": {"type": "FeatureCollection", "features": []}, "radar": {"url": "", "coords": [], "hasEcho": False, "time": ""}}
    json.dump(wx, open(p, "w"), separators=(",", ":"))
    p = os.path.join(ROOT, "fc.json"); f = json.load(open(p)); f["venues"]["hamilton"] = fc; f["notices"]["hamilton"] = f["notices"].get("argo", [])
    json.dump(f, open(p, "w"), separators=(",", ":"))
    p = os.path.join(ROOT, "relief.json"); r = json.load(open(p)); w, s, e, n = BBOX; r["hamilton"] = {"relief": [[w, n], [e, n], [e, s], [w, s]]}
    json.dump(r, open(p, "w"))
    Image.new("RGBA", (4, 4), (0, 0, 0, 0)).save(os.path.join(ROOT, "relief_hamilton.png"))
    print("wx.json, fc.json, relief.json and relief_hamilton.png updated")


if __name__ == "__main__":
    build_map(); merge()
