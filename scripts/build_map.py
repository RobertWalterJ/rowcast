#!/usr/bin/env python3
"""Build vector + raster map data for the RowCast prototype venues."""
import base64, io, json, math, os, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image
from shapely.geometry import (LineString, MultiLineString, MultiPolygon, Point, Polygon, box,
                              mapping, shape)
from shapely.ops import linemerge, polygonize, split, unary_union

OVERPASS = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
UA = {"User-Agent": "RowCast-prototype/0.1 (personal)"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(OUT, exist_ok=True)

VENUES = {
    "trent": {"bbox": (44.288, -78.345, 44.385, -78.250), "coast": False, "bath": False},
    "argo": {"bbox": (43.590, -79.510, 43.662, -79.350), "coast": False, "bath": True},
}


def http(url, data=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:
            print("retry", e)
            time.sleep(15 * (i + 1))
    raise RuntimeError(url)


def overpass(q):
    import hashlib
    CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cache"); os.makedirs(CACHE, exist_ok=True)
    p = CACHE + "/" + hashlib.md5(q.encode()).hexdigest() + ".json"
    if os.path.exists(p):
        return json.load(open(p))
    d = json.loads(http(OVERPASS, urllib.parse.urlencode({"data": q}).encode(), tries=6))
    json.dump(d, open(p, "w"))
    return d


def way_coords(el):
    return [(p["lon"], p["lat"]) for p in el.get("geometry", []) if p]


def rel_polygons(el):
    outers, inners = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or "geometry" not in m:
            continue
        ls = LineString([(p["lon"], p["lat"]) for p in m["geometry"] if p])
        (inners if m.get("role") == "inner" else outers).append(ls)
    polys = list(polygonize(linemerge(outers))) if outers else []
    holes = list(polygonize(linemerge(inners))) if inners else []
    if not polys:
        return None
    g = unary_union(polys)
    if holes:
        g = g.difference(unary_union(holes))
    return g


def feats_from(els, area=False):
    out = []
    for el in els:
        tags = el.get("tags", {})
        g = None
        try:
            if el["type"] == "node":
                g = Point(el["lon"], el["lat"])
            elif el["type"] == "way":
                c = way_coords(el)
                if len(c) < 2:
                    continue
                if area and len(c) >= 4 and c[0] == c[-1]:
                    g = Polygon(c)
                else:
                    g = LineString(c)
            elif el["type"] == "relation":
                g = rel_polygons(el)
        except Exception:
            continue
        if g is None or g.is_empty:
            continue
        out.append((g, tags))
    return out


def fc(items, props_fn, clip, tol=0.00002):
    feats = []
    for g, tags in items:
        try:
            g = g.intersection(clip) if not isinstance(g, Point) else g
            if g.is_empty:
                continue
            if not isinstance(g, Point):
                g = g.simplify(tol, preserve_topology=True)
            p = props_fn(tags)
            if p is None:
                continue
            gj = mapping(g)
            feats.append({"type": "Feature", "geometry": round_geom(gj), "properties": p})
        except Exception:
            continue
    return {"type": "FeatureCollection", "features": feats}


def round_geom(gj):
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], 6), round(c[1], 6)]
        return [r(x) for x in c]
    gj = dict(gj)
    gj["coordinates"] = r(gj["coordinates"])
    return gj


def build_vectors(key, cfg):
    s, w, n, e = cfg["bbox"]
    bb = f"({s},{w},{n},{e})"
    clip = box(w, s, e, n)
    q = f"""[out:json][timeout:170];
(
  way["natural"="water"]{bb}; relation["natural"="water"]{bb};
  way["waterway"="riverbank"]{bb}; relation["waterway"="riverbank"]{bb};
)->.water;
.water out geom;
"""
    water = feats_from(overpass(q)["elements"], area=True)
    print(key, "water", len(water))
    QL = ['way["waterway"~"^(river|canal|stream)$"]{bb};', 'way["natural"="coastline"]{bb};', 'way["leisure"~"^(park|golf_course|nature_reserve|pitch|marina)$"]{bb};', 'way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|farmland|residential|industrial|commercial|retail)$"]{bb};', 'relation["landuse"~"^(forest|grass|meadow|recreation_ground|farmland|residential|industrial|commercial)$"]{bb};', 'relation["leisure"~"^(park|nature_reserve|golf_course)$"]{bb};', 'way["natural"~"^(wood|wetland|scrub|beach|sand)$"]{bb};', 'relation["natural"~"^(wood|wetland)$"]{bb};', 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|motorway_link|trunk_link|primary_link)$"]{bb};', 'way["highway"~"^(footway|cycleway|path)$"]["bridge"="yes"]{bb};', 'way["railway"="rail"]{bb};', 'way["man_made"~"^(pier|breakwater|groyne|bridge)$"]{bb};', 'way["leisure"="slipway"]{bb}; node["leisure"="slipway"]{bb};', 'way["waterway"~"^(dam|weir|lock_gate)$"]{bb}; node["waterway"~"^(dam|weir|lock_gate)$"]{bb};', 'way["lock"="yes"]{bb}; node["lock"="yes"]{bb};', 'node["seamark:type"]{bb}; way["seamark:type"]{bb};', 'node["man_made"~"^(tower|water_tower|chimney|lighthouse|mast)$"]{bb};', 'way["man_made"~"^(tower|water_tower|chimney|lighthouse)$"]{bb};', 'way["power"="line"]{bb};', 'node["place"~"^(city|town|suburb|neighbourhood|village|hamlet|island|islet)$"]{bb};', 'way["place"~"^(island|islet)$"]{bb};', 'node["amenity"="university"]{bb}; way["amenity"="university"]{bb};', 'way["leisure"="sports_centre"]["sport"="rowing"]{bb}; node["sport"="rowing"]{bb}; way["sport"="rowing"]{bb};']
    els = []
    for i in range(0, len(QL), 6):
        part = "".join(x.replace("{bb}", bb) for x in QL[i:i+6])
        els += overpass("[out:json][timeout:170];(" + part + ");out geom;")["elements"]
        time.sleep(2)
    print(key, "elements", len(els))
    bld = []
    if key == "trent":
        q2 = f"[out:json][timeout:170];way[\"building\"]{bb};out geom;"
        bld = feats_from(overpass(q2)["elements"], area=True)
    else:
        q2 = "[out:json][timeout:170];way[\"building\"](43.626,-79.47,43.645,-79.40);out geom;"
        bld = feats_from(overpass(q2)["elements"], area=True)
    near = water_union_pre = unary_union([g for g, _ in water if g.geom_type in ("Polygon","MultiPolygon")] + [g.buffer(0.0002) for g, tg in feats_from([x for x in els if x.get("tags",{}).get("waterway") in ("river","canal") or x.get("tags",{}).get("natural")=="coastline"])]).buffer(0.0025)
    bld = [(g, tg) for g, tg in bld if g.intersects(near) and (g.area > 2e-8 or tg.get("name"))]
    print(key, "buildings", len(bld))

    def t(el): return el.get("tags", {})
    def pick(pred, area=False): return feats_from([x for x in els if pred(t(x))], area=area)

    layers = {}
    # water polygons (+ lake from coastline)
    water_geoms = [g for g, _ in water if g.geom_type in ("Polygon", "MultiPolygon")]
    if cfg["coast"]:
        coast = [g for g, tg in pick(lambda x: x.get("natural") == "coastline") if g.geom_type == "LineString"]
        merged = linemerge(unary_union(coast))
        lines = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
        pieces = split(clip, unary_union(lines + [clip.exterior]))
        polys = list(pieces.geoms) if hasattr(pieces, "geoms") else [pieces]
        # pick polygons on the right (water) side of coastline
        lake = []
        for p in polys:
            rp = p.representative_point()
            best, bd = None, 1e9
            for ln in lines:
                d = ln.distance(rp)
                if d < bd:
                    bd, best = d, ln
            pr = best.project(rp)
            a = best.interpolate(max(0, pr - 1e-5)); b = best.interpolate(min(best.length, pr + 1e-5))
            near = best.interpolate(pr)
            cross = (b.x - a.x) * (rp.y - near.y) - (b.y - a.y) * (rp.x - near.x)
            if cross < 0:  # right side => water
                lake.append(p)
        if lake:
            water_geoms.append(unary_union(lake))
    water_union = unary_union(water_geoms).intersection(clip)
    layers["water"] = fc([(water_union, {})], lambda _: {}, clip, tol=0.000015)
    layers["waterway"] = fc(pick(lambda x: x.get("waterway") in ("river", "canal", "stream")),
                            lambda x: {"kind": x.get("waterway"), "name": x.get("name", "")}, clip)

    def landcover(x):
        v = x.get("landuse") or x.get("leisure") or x.get("natural")
        m = {"forest": "wood", "wood": "wood", "scrub": "wood", "wetland": "wetland", "park": "park",
             "golf_course": "park", "nature_reserve": "park", "pitch": "park", "recreation_ground": "park",
             "grass": "grass", "meadow": "grass", "cemetery": "grass", "farmland": "farm", "beach": "sand",
             "sand": "sand", "residential": "urban", "industrial": "industry", "commercial": "urban",
             "retail": "urban", "marina": "marina"}
        k = m.get(v)
        return {"kind": k} if k else None
    lc = pick(lambda x: (x.get("landuse") or x.get("leisure") in ("park", "golf_course", "nature_reserve", "pitch", "marina")
                         or x.get("natural") in ("wood", "wetland", "scrub", "beach", "sand")) and not x.get("highway"), area=True)
    lc = [(g, tg) for g, tg in lc if g.geom_type in ("Polygon", "MultiPolygon")]
    # land cover never paints over water
    lc = [(g.difference(water_union), tg) for g, tg in lc]
    layers["landcover"] = fc(lc, landcover, clip, tol=0.00003)
    layers["buildings"] = fc([(g, tg) for g, tg in bld if g.geom_type == "Polygon"],
                             lambda x: {"name": x.get("name", "")}, clip, tol=0.00001)

    rclass = {"motorway": 1, "trunk": 1, "motorway_link": 2, "trunk_link": 2, "primary": 2, "primary_link": 2,
              "secondary": 3, "tertiary": 3, "residential": 4, "unclassified": 4, "footway": 5, "cycleway": 5, "path": 5}
    layers["roads"] = fc(pick(lambda x: x.get("highway") in rclass),
                         lambda x: {"rank": rclass[x["highway"]], "bridge": 1 if x.get("bridge") == "yes" else 0,
                                    "name": x.get("name", ""), "ref": x.get("ref", "")}, clip)
    layers["rail"] = fc(pick(lambda x: x.get("railway") == "rail"),
                        lambda x: {"bridge": 1 if x.get("bridge") == "yes" else 0}, clip)
    layers["structures"] = fc(pick(lambda x: x.get("man_made") in ("pier", "breakwater", "groyne"), area=False),
                              lambda x: {"kind": x.get("man_made")}, clip)
    layers["power"] = fc(pick(lambda x: x.get("power") == "line"), lambda x: {}, clip)

    def hazard(x):
        k = x.get("waterway")
        if k in ("dam", "weir", "lock_gate"):
            return {"kind": k, "name": x.get("name", "")}
        if x.get("lock") == "yes":
            return {"kind": "lock", "name": x.get("name", "") or x.get("lock_name", ""), "ref": x.get("lock_ref", "")}
        return None
    layers["hazards"] = fc(pick(lambda x: x.get("waterway") in ("dam", "weir", "lock_gate") or x.get("lock") == "yes"),
                           hazard, clip)

    def seamark(x):
        st = x.get("seamark:type")
        if not st:
            return None
        colour = x.get(f"seamark:{st}:colour", "") or x.get("seamark:buoy_lateral:colour", "")
        cat = x.get(f"seamark:{st}:category", "")
        shp = x.get(f"seamark:{st}:shape", "")
        light = x.get("seamark:light:colour", "") or x.get("seamark:light:1:colour", "")
        char = x.get("seamark:light:character", "") or x.get("seamark:light:1:character", "")
        period = x.get("seamark:light:period", "") or x.get("seamark:light:1:period", "")
        return {"type": st, "colour": colour, "cat": cat, "shape": shp, "light": light,
                "char": char, "period": period, "name": x.get("seamark:name", x.get("name", ""))}
    sm = pick(lambda x: "seamark:type" in x)
    sm_pts = []
    for g, tg in sm:
        if g.geom_type == "Point":
            sm_pts.append((g, tg))
        elif tg.get("seamark:type") in ("buoy_lateral", "buoy_special_purpose", "beacon_lateral", "light_minor", "light_major", "beacon_special_purpose"):
            sm_pts.append((g.centroid, tg))
    layers["seamarks"] = fc(sm_pts, seamark, clip)
    sm_lines = [(g, tg) for g, tg in sm if g.geom_type != "Point" and tg.get("seamark:type") not in ("buoy_lateral",)]
    layers["seamark_areas"] = fc(sm_lines, lambda x: {"type": x.get("seamark:type"), "name": x.get("seamark:name", x.get("name", ""))}, clip)

    lm = pick(lambda x: x.get("man_made") in ("tower", "water_tower", "chimney", "lighthouse", "mast"))
    layers["landmarks"] = fc([(g.centroid if g.geom_type != "Point" else g, tg) for g, tg in lm],
                             lambda x: {"kind": x.get("man_made"), "name": x.get("name", "")}, clip)
    pl = pick(lambda x: x.get("place") or x.get("amenity") == "university" or x.get("sport") == "rowing")
    layers["places"] = fc([(g.centroid if g.geom_type != "Point" else g, tg) for g, tg in pl if (tg.get("name"))],
                          lambda x: {"kind": x.get("place") or ("rowing" if x.get("sport") == "rowing" else "university"),
                                     "name": x.get("name")}, clip)
    return layers, water_union


# ---------------- rasters ----------------
def tile_xy(lon, lat, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def tile_lonlat(x, y, z):
    n = 2 ** z
    return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))


def dem_mosaic(bbox, z):
    s, w, n, e = bbox
    x0, y0 = tile_xy(w, n, z); x1, y1 = tile_xy(e, s, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    H = (ty1 - ty0 + 1) * 256; W = (tx1 - tx0 + 1) * 256
    a = np.zeros((H, W), np.float32)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            im = np.array(Image.open(io.BytesIO(http(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"))).convert("RGB")).astype(np.float32)
            a[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    # crop to bbox in tile-pixel space
    cx0, cy0 = int((x0 - tx0) * 256), int((y0 - ty0) * 256)
    cx1, cy1 = int((x1 - tx0) * 256), int((y1 - ty0) * 256)
    a = a[cy0:cy1, cx0:cx1]
    # exact corners of the crop
    lonW, latN = tile_lonlat(tx0 + cx0 / 256, ty0 + cy0 / 256, z)
    lonE, latS = tile_lonlat(tx0 + cx1 / 256, ty0 + cy1 / 256, z)
    return a, (lonW, latS, lonE, latN)


def hillshade(dem, cellsize, zf=1.6):
    gy, gx = np.gradient(dem, cellsize)
    out = np.zeros_like(dem)
    # multi-directional (NW dominant), the classic swiss-style approach
    for az, wgt in ((315, 0.5), (270, 0.2), (360, 0.2), (225, 0.1)):
        alt = math.radians(45); azr = math.radians(360 - az + 90)
        slope = np.arctan(zf * np.hypot(gx, gy)); aspect = np.arctan2(gy, -gx)
        hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(azr - aspect)
        out += wgt * hs
    return np.clip(out, 0, 1)


def to_png_uri(img, quality=None):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def build_hillshade(key, cfg, water_union):
    z = 14
    dem, (w, s, e, n) = dem_mosaic(cfg["bbox"], z)
    lat = (s + n) / 2
    cell = 40075016 * math.cos(math.radians(lat)) / (2 ** z * 256)
    hs = hillshade(dem, cell, zf=2.2 if key == "trent" else 3.0)
    flat = math.sin(math.radians(45))
    # encode as shadow (dark, alpha) + highlight (light, alpha) on one RGBA image
    d = hs - flat
    alpha = np.clip(np.abs(d) * 1.6, 0, 0.55)
    rgba = np.zeros(dem.shape + (4,), np.uint8)
    shadow = d < 0
    rgba[..., 0] = np.where(shadow, 30, 255); rgba[..., 1] = np.where(shadow, 45, 252); rgba[..., 2] = np.where(shadow, 60, 240)
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    if img.width > 1100:
        img = img.resize((1100, int(img.height * 1100 / img.width)), Image.LANCZOS)
    img = img.quantize(colors=48, method=Image.FASTOCTREE)
    return {"url": to_png_uri(img), "coords": [[w, n], [e, n], [e, s], [w, s]],
            "elev": [float(np.percentile(dem, 2)), float(np.percentile(dem, 98))]}


def build_bathy(cfg, water_union):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    s, w, n, e = cfg["bbox"]
    W, H = 720, 360
    url = ("https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/exportImage?"
           + urllib.parse.urlencode({"bbox": f"{w},{s},{e},{n}", "bboxSR": 4326, "imageSR": 4326, "size": f"{W},{H}",
                                     "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation", "f": "image"}))
    a = np.array(Image.open(io.BytesIO(http(url)))).astype(float)
    depth = -a  # metres below lake datum
    lons = np.linspace(w, e, W); lats = np.linspace(n, s, H)
    bands = [0, 2, 5, 10, 20, 50, 400]
    cs = plt.contourf(lons, lats, depth, levels=bands)
    feats = []
    for i, coll in enumerate(cs.allsegs):
        polys = []
        for seg in coll:
            if len(seg) >= 4:
                try:
                    p = Polygon(seg).buffer(0)
                    if not p.is_empty:
                        polys.append(p)
                except Exception:
                    pass
        if not polys:
            continue
        # contourf nests holes: rebuild via symmetric difference
        g = None
        for p in sorted(polys, key=lambda p: -p.area):
            g = p if g is None else g.symmetric_difference(p)
        g = g.intersection(water_union).simplify(0.00004, preserve_topology=True)
        if g.is_empty:
            continue
        feats.append({"type": "Feature", "geometry": round_geom(mapping(g)), "properties": {"min": bands[i], "max": bands[i + 1]}})
    plt.close("all")
    cl = plt.contour(lons, lats, depth, levels=[2, 5, 10, 20, 50])
    lines = []
    for lvl, segs in zip([2, 5, 10, 20, 50], cl.allsegs):
        for seg in segs:
            if len(seg) >= 3:
                ls = LineString(seg).intersection(water_union.buffer(0.0003)).simplify(0.00004)
                if not ls.is_empty:
                    lines.append({"type": "Feature", "geometry": round_geom(mapping(ls)), "properties": {"d": lvl}})
    plt.close("all")
    return {"type": "FeatureCollection", "features": feats}, {"type": "FeatureCollection", "features": lines}


def main():
    import sys
    for key, cfg in VENUES.items():
        if len(sys.argv) > 1 and key not in sys.argv[1:]:
            continue
        layers, water_union = build_vectors(key, cfg)
        try:
            layers["_hillshade"] = build_hillshade(key, cfg, water_union)
        except Exception as ex:
            print("hillshade failed", ex)
        if cfg["bath"]:
            try:
                bands, contours = build_bathy(cfg, water_union)
                layers["depth"] = bands; layers["depth_contours"] = contours
            except Exception as ex:
                print("bathy failed", ex)
        s, w, n, e = cfg["bbox"]
        layers["_bbox"] = [w, s, e, n]
        p = f"{OUT}/{key}.json"
        json.dump(layers, open(p, "w"), separators=(",", ":"))
        print(key, {k: len(v["features"]) for k, v in layers.items() if isinstance(v, dict) and "features" in v}, os.path.getsize(p))
        time.sleep(3)


if __name__ == "__main__":
    main()
