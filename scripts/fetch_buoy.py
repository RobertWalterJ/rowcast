#!/usr/bin/env python3
"""Save the latest NDBC buoy 45139 (west Lake Ontario) readings to site/buoy.json.

Browsers cannot read the NDBC text feed directly (no CORS), so the Pages deploy job runs this every 30 minutes
and publishes the result next to the app. Safe to fail: the app shows "no recent reading" when the file is missing.
Usage: python scripts/fetch_buoy.py
"""
import json, os, sys, urllib.request
from datetime import datetime, timezone

STATION = "45139"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "buoy.json")


def num(x, f=float):
    return None if x == "MM" else f(x)


def main():
    req = urllib.request.Request(f"https://www.ndbc.noaa.gov/data/realtime2/{STATION}.txt", headers={"User-Agent": "RowCast/1.0 (personal rowing weather app)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode("latin-1")
    rows = [l.split() for l in txt.splitlines() if l and not l.startswith("#")]
    obs = []
    for r in rows[:48]:
        ts = datetime(int(r[0]), int(r[1]), int(r[2]), int(r[3]), int(r[4]), tzinfo=timezone.utc)
        obs.append({"t": ts.isoformat().replace("+00:00", "Z"), "wdir": num(r[5], int), "wspd": num(r[6]), "gst": num(r[7]), "wvht": num(r[8]),
                    "dpd": num(r[9]), "pres": num(r[12]), "atmp": num(r[13]), "wtmp": num(r[14])})
    json.dump({"id": STATION, "name": "West Lake Ontario buoy (NDBC 45139)", "obs": obs}, open(OUT, "w"), separators=(",", ":"))
    print("buoy.json written,", len(obs), "readings, newest", obs[0]["t"] if obs else None)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # never fail the deploy over a buoy
        print("buoy fetch skipped:", e, file=sys.stderr)
