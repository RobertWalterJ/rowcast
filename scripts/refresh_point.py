#!/usr/bin/env python3
"""RowCast data refresh.

Pulls forecast, lake waves, buoy obs, Environment Canada alerts and a radar
composite, and writes two JSON files ready for the artifact database:
  out/latest.json  -> collection "wx", doc "latest"
  out/radar.json   -> collection "wx", doc "radar"
Usage: python3 refresh.py [outdir]
"""
import base64, io, json, math, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
UA = {"User-Agent": "RowCast/1.0 (personal rowing weather page)"}

VENUES = {
    "trent": {"name": "Head of the Trent", "place": "Otonabee River, Peterborough",
              "lat": 44.3573, "lon": -78.2903, "buoy": None, "marine": None},
    "argo": {"name": "Argonaut RC", "place": "Western Beaches, Toronto",
             "lat": 43.6321, "lon": -79.4360, "buoy": "45139",
             "marine": (43.62, -79.42)},
}

HOURLY = ("temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,"
          "precipitation,weather_code,cloud_cover_low,visibility,wind_speed_10m,"
          "wind_direction_10m,wind_gusts_10m,cape,pressure_msl")
CURRENT = ("temperature_2m,apparent_temperature,dew_point_2m,precipitation,weather_code,"
           "cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl")
DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max"


def get(url, raw=False, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            return data if raw else json.loads(data)
        except Exception as e:  # noqa
            last = e
            time.sleep(2 * (i + 1))
    raise last


def r1(v):
    return None if v is None else round(v, 1)


def forecast(v):
    q = urllib.parse.urlencode({
        "latitude": v["lat"], "longitude": v["lon"], "hourly": HOURLY, "current": CURRENT,
        "daily": DAILY, "timezone": "America/Toronto", "past_days": 3, "forecast_days": 5,
        "wind_speed_unit": "kmh"})
    d = get("https://api.open-meteo.com/v1/forecast?" + q)
    h = d["hourly"]
    hourly = {"time": h["time"]}
    keymap = {"temperature_2m": "t", "apparent_temperature": "feels", "dew_point_2m": "dew",
              "precipitation_probability": "pop", "precipitation": "rain", "weather_code": "code",
              "cloud_cover_low": "lowcloud", "visibility": "vis", "wind_speed_10m": "wind",
              "wind_direction_10m": "dir", "wind_gusts_10m": "gust", "cape": "cape",
              "pressure_msl": "pres"}
    for k, short in keymap.items():
        vals = h.get(k, [])
        if short in ("vis", "cape", "code", "pop", "dir", "lowcloud"):
            hourly[short] = [None if x is None else int(round(x)) for x in vals]
        else:
            hourly[short] = [r1(x) for x in vals]
    return {"current": d.get("current"), "hourly": hourly, "daily": d.get("daily")}


def marine(lat, lon):
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "timezone": "America/Toronto", "past_days": 1,
        "forecast_days": 5,
        "hourly": "wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period"})
    d = get("https://marine-api.open-meteo.com/v1/marine?" + q)["hourly"]
    return {"time": d["time"], "hs": [r1(x) for x in d["wave_height"]],
            "tp": [r1(x) for x in d["wave_period"]], "dir": d["wave_direction"],
            "wwh": [r1(x) for x in d.get("wind_wave_height", [])]}


def buoy(sid):
    txt = get(f"https://www.ndbc.noaa.gov/data/realtime2/{sid}.txt", raw=True).decode()
    rows = [l.split() for l in txt.splitlines() if l and not l.startswith("#")]
    def num(x, f=float):
        return None if x == "MM" else f(x)
    out = []
    for r in rows[:24]:
        ts = datetime(int(r[0]), int(r[1]), int(r[2]), int(r[3]), int(r[4]), tzinfo=timezone.utc)
        out.append({"t": ts.isoformat(), "wdir": num(r[5], int),
                    "wspd": None if num(r[6]) is None else round(num(r[6]) * 3.6, 1),
                    "gst": None if num(r[7]) is None else round(num(r[7]) * 3.6, 1),
                    "wvht": num(r[8]), "dpd": num(r[9]), "pres": num(r[12]),
                    "atmp": num(r[13]), "wtmp": num(r[14])})
    return {"id": sid, "name": "West Lake Ontario buoy (NDBC 45139)", "obs": out}


def alerts(v):
    d = 0.08
    bbox = f"{v['lon']-d},{v['lat']-d},{v['lon']+d},{v['lat']+d}"
    j = get("https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=" + bbox)
    seen, out = set(), []
    for f in j.get("features", []):
        p = f["properties"]
        key = (p.get("alert_code"), p.get("feature_name_en"), p.get("event_end_datetime"))
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": p.get("alert_short_name_en"), "type": p.get("alert_type"),
                    "colour": p.get("risk_colour_en"), "area": p.get("feature_name_en"),
                    "status": p.get("status_en"), "issued": p.get("publication_datetime"),
                    "start": p.get("validity_datetime"), "end": p.get("event_end_datetime"),
                    "text": (p.get("alert_text_en") or "")[:1800]})
    return out


# ---------- radar composite (OSM basemap z8 + ECCC 1 km rain-rate radar) ----------
def merc(lon, lat):
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) * 20037508.34 / math.pi
    return x, y


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    lr = math.radians(lat)
    y = (1 - math.asinh(math.tan(lr)) / math.pi) / 2 * n
    return x, y


def radar():
    from PIL import Image, ImageDraw
    z = 8
    W, E, S, N = -80.4, -77.4, 43.15, 44.95
    x0, y0 = tile_xy(W, N, z)
    x1, y1 = tile_xy(E, S, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    base = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256), "white")
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            png = get(f"https://tile.openstreetmap.org/{z}/{tx}/{ty}.png", raw=True)
            base.paste(Image.open(io.BytesIO(png)).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256))
    # mercator bounds of the tile block
    n = 2 ** z
    def tile_lon(x): return x / n * 360 - 180
    def tile_lat(y): return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    bw, bn = merc(tile_lon(tx0), tile_lat(ty0))
    be, bs = merc(tile_lon(tx1 + 1), tile_lat(ty1 + 1))
    # wash the basemap a little so radar colours read clearly
    base = Image.blend(base, Image.new("RGB", base.size, (255, 255, 255)), 0.35)
    stamp = None
    for layer in ("RADAR_1KM_RRAI",):
        q = urllib.parse.urlencode({
            "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer,
            "CRS": "EPSG:3857", "BBOX": f"{bw},{bs},{be},{bn}", "WIDTH": base.size[0],
            "HEIGHT": base.size[1], "FORMAT": "image/png", "TRANSPARENT": "true"})
        img = Image.open(io.BytesIO(get("https://geo.weather.gc.ca/geomet?" + q, raw=True))).convert("RGBA")
        base.paste(img, (0, 0), img)
    try:
        cap = get("https://geo.weather.gc.ca/geomet?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&LAYERS=RADAR_1KM_RRAI", raw=True).decode()
        i = cap.find('name="time"')
        if i > 0:
            seg = cap[i:i + 400]
            j = seg.find('default="')
            if j > 0:
                stamp = seg[j + 9:seg.find('"', j + 9)]
    except Exception:
        pass
    # crop to region
    def px(lon, lat):
        x, y = tile_xy(lon, lat, z)
        return (x - tx0) * 256, (y - ty0) * 256
    cx0, cy0 = px(W, N)
    cx1, cy1 = px(E, S)
    base = base.crop((int(cx0), int(cy0), int(cx1), int(cy1)))
    dr = ImageDraw.Draw(base)
    for v in VENUES.values():
        x, y = px(v["lon"], v["lat"])
        x -= cx0; y -= cy0
        dr.ellipse((x - 6, y - 6, x + 6, y + 6), outline=(10, 30, 60), width=3)
        dr.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(10, 30, 60))
    buf = io.BytesIO()
    base.save(buf, "JPEG", quality=72, optimize=True)
    return {"img": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(),
            "bounds": [W, S, E, N], "radar_time": stamp,
            "venues": {k: [round((px(v["lon"], v["lat"])[0] - cx0) / base.size[0], 4),
                           round((px(v["lon"], v["lat"])[1] - cy0) / base.size[1], 4)]
                       for k, v in VENUES.items()},
            "size": list(base.size)}


def notices():
    import re, html as H
    out = {"trent": [], "argo": []}
    try:
        s = get("https://parks.canada.ca/lhn-nhs/on/trentsevern/securite-safety/bulletins", raw=True).decode("utf8", "ignore")
        main_ = s[s.find("<main"):]
        txt = re.sub(r"<script.*?</script>", "", main_, flags=re.S)
        for m in re.finditer(r'href="(https://parks\.canada\.ca/lhn-nhs/on/trentsevern/securite-safety/bulletins/[0-9A-Fa-f-]{36})"[^>]*>(.*?)</a>(?=(.{0,400}))', txt, re.S):
            title = re.sub(r"\s+", " ", H.unescape(re.sub("<[^>]+>", " ", m.group(2)))).strip()
            tail = re.sub(r"\s+", " ", H.unescape(re.sub("<[^>]+>", " ", m.group(3)))).strip()
            dm = re.search(r"[A-Z][a-z]+ \d{2}, \d{4}", tail)
            if title:
                out["trent"].append({"title": title, "date": dm.group(0) if dm else None, "url": m.group(1),
                                     "src": "Parks Canada · Trent-Severn"})
    except Exception as e:
        out["trent_error"] = str(e)
    try:
        s = get("https://www.torontoportauthority.com/media-room/community-notices/", raw=True).decode("utf8", "ignore")
        seen = []
        for slug in re.findall(r'href="/media-room/community-notices/([^"/]+)"', s):
            if slug not in seen:
                seen.append(slug)
        for slug in seen[:8]:
            title = re.sub(r"-\d+$", "", slug).replace("-", " ").strip().capitalize()
            out["argo"].append({"title": title, "date": None,
                                "url": "https://www.torontoportauthority.com/media-room/community-notices/" + slug,
                                "src": "PortsToronto"})
    except Exception as e:
        out["argo_error"] = str(e)
    return out


def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    latest = {"updated": now, "venues": {}, "errors": []}
    for key, v in VENUES.items():
        rec = {k: v[k] for k in ("name", "place", "lat", "lon")}
        try:
            rec.update(forecast(v))
        except Exception as e:
            latest["errors"].append(f"{key} forecast: {e}")
        try:
            rec["alerts"] = alerts(v)
        except Exception as e:
            rec["alerts"] = None
            latest["errors"].append(f"{key} alerts: {e}")
        if v["marine"]:
            try:
                rec["waves"] = marine(*v["marine"])
            except Exception as e:
                latest["errors"].append(f"{key} waves: {e}")
        if v["buoy"]:
            try:
                rec["buoy"] = buoy(v["buoy"])
            except Exception as e:
                latest["errors"].append(f"{key} buoy: {e}")
        latest["venues"][key] = rec
    latest["notices"] = notices()
    with open(f"{OUT}/latest.json", "w") as f:
        json.dump(latest, f, separators=(",", ":"))
    try:
        rd = radar()
        rd["updated"] = now
        with open(f"{OUT}/radar.json", "w") as f:
            json.dump(rd, f, separators=(",", ":"))
    except Exception as e:
        print("radar failed:", e)
    print("ok", now, "errors:", latest["errors"])
    for fn in ("latest.json", "radar.json"):
        p = f"{OUT}/{fn}"
        if os.path.exists(p):
            print(fn, os.path.getsize(p), "bytes")


if __name__ == "__main__":
    main()
