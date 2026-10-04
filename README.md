# RowCast

A rowing weather and planning app: go/no-go row calls, wind, waves, fog and radar on a chart-style map, sunrise and twilight times for nav lights, and regatta race schedules.

Built as an installable web app for Android, hosted on GitHub Pages.

**Status:** clickable prototype running on a data snapshot from October 2026. See `CLAUDE.md` for the full build notes and roadmap.

## Run locally

```
python scripts/build_site.py
cd site && python -m http.server 8000
```

Then open http://localhost:8000.

## Data

Map data © OpenStreetMap contributors (ODbL), seamarks from OpenSeaMap. Bathymetry: NOAA NCEI. Terrain: AWS Terrain Tiles. Forecast: Open-Meteo. Alerts and radar: Environment and Climate Change Canada. Boat sprites and relief shading rendered in Blender.

A planning aid, not a navigation chart.
