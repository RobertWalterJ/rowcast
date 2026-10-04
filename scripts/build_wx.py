#!/usr/bin/env python3
"""Weather fields for the prototype: wind/visibility grids, wave grid, alert polygons, radar snapshot."""
import base64, io, json, os, urllib.parse, urllib.request, time
from shapely.geometry import shape, mapping, box
import numpy as np
from PIL import Image

UA = {"User-Agent": "RowCast-prototype/0.1"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def get(url, raw=False):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read()
            return b if raw else json.loads(b)
        except Exception as e:
            print("retry", e); time.sleep(3 * (i + 1))
    raise RuntimeError(url)


def grid(bbox, nx, ny):
    w, s, e, n = bbox
    lons = np.linspace(w, e, nx); lats = np.linspace(n, s, ny)
    return [(float(la), float(lo)) for la in lats for lo in lons]


def wind_grid(bbox, nx=8, ny=8, hours=48):
    pts = grid(bbox, nx, ny)
    q = urllib.parse.urlencode({
        "latitude": ",".join(f"{p[0]:.4f}" for p in pts), "longitude": ",".join(f"{p[1]:.4f}" for p in pts),
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,temperature_2m,dew_point_2m",
        "timezone": "America/Toronto", "forecast_days": 3, "past_days": 0})
    d = get("https://api.open-meteo.com/v1/forecast?" + q)
    times = d[0]["hourly"]["time"]
    now = time.strftime("%Y-%m-%dT%H:00", time.localtime(time.time() - 4 * 3600))  # container is UTC -> Toronto EDT
    i0 = max(0, times.index(now) if now in times else 0)
    sl = slice(i0, i0 + hours)
    out = {"nx": nx, "ny": ny, "bbox": bbox, "time": times[sl], "u": [], "v": [], "g": [], "vis": [], "t": [], "td": []}
    for k in range(len(times[sl])):
        u, v, g, vis, t, td = [], [], [], [], [], []
        for p in d:
            h = p["hourly"]; j = i0 + k
            sp = h["wind_speed_10m"][j] or 0; dr = h["wind_direction_10m"][j] or 0
            rad = np.radians(dr)
            u.append(round(float(-sp * np.sin(rad)), 1)); v.append(round(float(-sp * np.cos(rad)), 1))
            g.append(round(h["wind_gusts_10m"][j] or 0)); vis.append(int(h["visibility"][j] or 0))
            t.append(round(h["temperature_2m"][j], 1)); td.append(round(h["dew_point_2m"][j], 1))
        out["u"].append(u); out["v"].append(v); out["g"].append(g); out["vis"].append(vis); out["t"].append(t); out["td"].append(td)
    return out


def wave_grid(bbox, nx=9, ny=6, hours=48):
    pts = grid(bbox, nx, ny)
    q = urllib.parse.urlencode({
        "latitude": ",".join(f"{p[0]:.4f}" for p in pts), "longitude": ",".join(f"{p[1]:.4f}" for p in pts),
        "hourly": "wave_height,wave_direction,wave_period", "timezone": "America/Toronto", "forecast_days": 3})
    d = get("https://marine-api.open-meteo.com/v1/marine?" + q)
    times = d[0]["hourly"]["time"]
    now = time.strftime("%Y-%m-%dT%H:00", time.localtime(time.time() - 4 * 3600))
    i0 = times.index(now) if now in times else 0
    out = {"pts": [[round(p[1], 4), round(p[0], 4)] for p in pts], "time": times[i0:i0 + hours], "hs": [], "dir": [], "tp": []}
    for k in range(len(out["time"])):
        j = i0 + k
        out["hs"].append([p["hourly"]["wave_height"][j] for p in d])
        out["dir"].append([p["hourly"]["wave_direction"][j] for p in d])
        out["tp"].append([p["hourly"]["wave_period"][j] for p in d])
    return out


def alerts(bbox):
    w, s, e, n = bbox
    d = get(f"https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox={w},{s},{e},{n}")
    clip = box(w - 0.3, s - 0.3, e + 0.3, n + 0.3)
    feats, seen = [], set()
    for f in d.get("features", []):
        p = f["properties"]; k = (p.get("alert_code"), p.get("feature_id"))
        if k in seen or not f.get("geometry"):
            continue
        seen.add(k)
        g = shape(f["geometry"]).intersection(clip).simplify(0.002)
        if g.is_empty:
            continue
        feats.append({"type": "Feature", "geometry": mapping(g), "properties": {
            "name": p.get("alert_short_name_en"), "type": p.get("alert_type"), "colour": p.get("risk_colour_en"),
            "area": p.get("feature_name_en"), "end": p.get("event_end_datetime"), "text": (p.get("alert_text_en") or "")[:600]}})
    return {"type": "FeatureCollection", "features": feats}


def radar(bbox):
    w, s, e, n = bbox
    W = 700; H = int(W * (n - s) / (e - w) / 0.72)
    q = urllib.parse.urlencode({"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": "RADAR_1KM_RRAI",
                                "CRS": "EPSG:4326", "BBOX": f"{s},{w},{n},{e}", "WIDTH": W, "HEIGHT": H,
                                "FORMAT": "image/png", "TRANSPARENT": "true"})
    b = get("https://geo.weather.gc.ca/geomet?" + q, raw=True)
    img = Image.open(io.BytesIO(b)).convert("RGBA")
    has = img.getextrema()[3][1] > 0
    buf = io.BytesIO(); img.save(buf, "PNG", optimize=True)
    return {"url": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
            "coords": [[w, n], [e, n], [e, s], [w, s]], "hasEcho": has, "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def main():
    wx = {}
    for key in ("trent", "argo"):
        m = json.load(open(f"{OUT}/{key}.json"))
        bbox = m["_bbox"]
        # wider radar/alert box so cells approaching are visible
        w, s, e, n = bbox
        big = [w - 0.6, s - 0.4, e + 0.6, n + 0.4]
        rec = {"wind": wind_grid(bbox), "alerts": alerts(big), "radar": radar(big)}
        if key == "argo":
            rec["waves"] = wave_grid([w, s, e, 43.632])
        wx[key] = rec
        print(key, "ok", len(rec["wind"]["time"]), "h; alerts", len(rec["alerts"]["features"]), "; radar echo", rec["radar"]["hasEcho"])
    json.dump(wx, open(f"{OUT}/wx.json", "w"), separators=(",", ":"))
    print(os.path.getsize(f"{OUT}/wx.json"))


if __name__ == "__main__":
    main()
