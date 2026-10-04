#!/usr/bin/env python3
"""Trim data/<venue>.json (from build_map.py) into the lighter site/map_<venue>.json the app loads."""
import json, os, sys
from shapely.geometry import shape
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
for k in sys.argv[1:] or ["trent", "argo"]:
    d = json.load(open(f"{ROOT}/data/{k}.json"))
    d.pop("_hillshade", None)  # superseded by the Blender relief overlay
    water = shape(d["water"]["features"][0]["geometry"]).buffer(0.008 if k == "argo" else 0.01)
    d["landcover"]["features"] = [f for f in d["landcover"]["features"] if f["properties"]["kind"] not in ("urban", "industry")]
    d["roads"]["features"] = [f for f in d["roads"]["features"] if f["properties"]["rank"] < 4 or shape(f["geometry"]).intersects(water)]
    if k != "trent":
        d["rail"]["features"] = [f for f in d["rail"]["features"] if shape(f["geometry"]).intersects(water)]
    for f in d["roads"]["features"]:
        p = f["properties"]; f["properties"] = {"rank": p["rank"], "bridge": p["bridge"], **({"name": p["name"]} if p["bridge"] else {})}
    s = json.dumps(d, separators=(",", ":"))
    open(f"{ROOT}/site/map_{k}.json", "w").write(s)
    print(k, len(s) // 1000, "KB")
