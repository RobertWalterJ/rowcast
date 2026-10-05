# RowCast

Rowing weather, light and water-conditions app for Robert Walter-Joseph (GitHub `RobertWalterJ`). He rows at the Argonaut Rowing Club in Toronto and races regattas such as the Head of the Trent in Peterborough. The app runs on his **Android phone** as an installable web app (PWA) served from **GitHub Pages** at `https://robertwalterj.github.io/rowcast/`.

This file hands over a working prototype built in a Claude (Cowork) session. Read it before changing anything.

## What he asked for

- Detailed weather for rowing planning and live conditions: wind, gusts, waves, radar, forecast, fog and low visibility.
- Sunrise, sunset and civil, nautical and astronomical twilight, so he knows when nav lights are needed for a morning or evening row.
- Detailed mapping with strong **terrestrial and hydrographic/nautical cartography and symbology**, chosen to suit the context.
- Big-vessel traffic and nautical charts for unfamiliar water.
- Recent storms, tornadoes and other events that could leave debris in the water.
- Waterway notices.
- A lightweight, modern, visual and intuitive UI: separate screens on a **bottom tab bar**, the **map as the home screen**, and a **hamburger menu**.
- Venues and events driven by data, never hard-coded. Head of the Trent is just the first saved event.
- Look up regatta race schedules and load his own races and start times.
- Weather on the map: wind movement, waves, visibility, radar and other cartographic layers.

## Current state

`site/index.html` is a clickable prototype. It works, but it runs on a **data snapshot** taken on 2026-10-04 (forecast, alerts, radar). It began as a claude.ai artifact, where pages can't fetch from other sites. That restriction does **not** apply on GitHub Pages, so the main job now is replacing the snapshots with live fetches.

### Screens (bottom tabs)

1. **Map** (home): MapLibre GL map. The top bar has the menu, a context button (current event or venue, with a go/caution/stop dot) and a night-vision toggle. Below it sit quick layer chips. Floating buttons on the right: layers sheet, cycle map mode, draw course, fit venue. At the bottom, a 48-hour time slider with play. Tapping the map gives a readout card (wind, gust, visibility, waves, depth, steam fog). Tapping a symbol explains it.
2. **Row call**: go / caution / stay ashore for a chosen launch window. Six factors: wind, waves/chop, visibility, storms, cold, light. Quick chips cover common launch times, including "Race launch" worked back from the user's race.
3. **Forecast**: 48-hour scrolling ribbon (wind line, gust area, direction arrows, temperature, rain bars, fog strip), 3-day cards, ECCC alerts.
4. **Light**: 24-hour dial showing the twilight bands and the planned row, a nav-lights callout, the full twilight table and the moon.
5. **Races**: event card with a hero mini-map, heat-sheet import (paste text, parsed for time, bow number and boat class), add/edit race, countdowns, a launch → marshal → start → finish timeline, conditions at start time.

**Menu drawer:** venues, with events nested under them; add an event; find a venue (placeholder); units (km/h or knots); go/no-go limits; legend; map style and layers; data sources.

**Sheets:** map layers (three map modes plus ten layer toggles with drawn previews), legend, limits sliders, race editor, heat-sheet import, add event.

### State

Everything lives in `localStorage` under the `rowcast2:` prefix: venue, event, map mode, units, night flag, limits, layers, races, user events, traced courses. There is one example race, flagged `example: true`. Delete it once real races exist.

## Repo layout

```
src/app.src.html      HTML + CSS shell (MapLibre CSS and the JS get inlined)
src/js/0_callcore.js  go / caution / stay ashore rules (callCore), whitecaps, change detection, forecast fetchers, IndexedDB helpers. No DOM. Also copied to site/callcore.js for the service worker
src/js/1_core.js      config (VENUES, DEFAULT_EVENTS, limits), state, time helpers (all times America/Toronto)
src/js/2_symbols.js   palettes for the 3 modes, canvas-drawn nav symbols, label images
src/js/3_map.js       sources, cartographic layer stack, course drawing, tap readout
src/js/4_overlay.js   wind particles, visibility/steam-fog veil, wave field (canvas over the map)
src/js/5_screens.js   nav/chrome, row-call logic, forecast, light dial
src/js/6_app.js       races, sheets, drawer, venue/event switching, boot
src/js/7_native.js    Android Back button, install item, shortcuts
src/js/8_live.js      live rain radar loop (MSC GeoMet) and water levels (CHS, Water Survey of Canada)
src/js/9_forecast_live.js  live forecast refresh (Open-Meteo, ECCC alerts) replacing the build-time snapshot
src/js/a_run.js       whitecap card, spots along the run, share with crew
src/js/b_watch.js     "Watch this row": alerts when the call changes (page side; the service worker does the background side)
Files in src/js are concatenated in filename order, so keep the 0_ to 9_ then a_ prefixes.
src/maplibre.css      MapLibre 4.7.1 CSS (inlined at build)
site/                 deployable output: index.html + data files + Blender sprites
scripts/              data and build pipeline (Python 3, needs shapely, numpy, pillow, matplotlib)
blender/              Blender 4.2 scripts and renders
.github/workflows/pages.yml   builds site/index.html and deploys site/ to Pages
```

`python scripts/build_site.py` assembles `site/index.html` (JS files concatenated in filename order). There is no bundler; keep it lightweight unless there is a clear reason to add one.

Libraries are self-hosted in `site/` so the app works offline: `maplibre-gl.js` (4.7.1) and `suncalc.js` (1.9.0), both from npm. Fonts: Figtree and IBM Plex Mono from Google Fonts, cached by the service worker when online.

## Data pipeline

| Script | Makes | Sources |
|---|---|---|
| `scripts/build_map.py [venue]` | `data/<venue>.json`: water, waterways, land cover, buildings near water, roads, rail, piers, power lines, dams/weirs/locks, seamarks, landmarks, places, NOAA depth bands and contours | Overpass via the `maps.mail.ru` mirror (overpass-api.de reset connections from the build machine; queries are cached in `cache/`), AWS Terrain Tiles (terrarium), NOAA NCEI `DEM_mosaics/DEM_all` ImageServer for Lake Ontario bathymetry |
| `scripts/export_site_data.py` | `site/map_<venue>.json` (trimmed) | `data/` |
| `blender/relief.py` | `blender/renders/relief_<venue>.png` (orthographic, NW sun, Cycles) | DEM `.npy` saved from `dem_mosaic()` in build_map.py |
| `scripts/relief_to_overlay.py` | `site/relief_<venue>.png` transparent shade overlay | Blender render |
| `blender/shells.py` | `shell_1x/2x/4x/8p.png` top-down boat sprites | modelled procedurally |
| `scripts/build_wx.py` | `data/wx.json` → copied to `site/wx.json`: 8x8 wind/gust/visibility/temp/dew grid for 48 h, wave grid (Argonaut), ECCC alert polygons, radar PNG | Open-Meteo forecast (multi-point), Open-Meteo Marine, `api.weather.gc.ca/collections/weather-alerts`, MSC GeoMet WMS `RADAR_1KM_RRAI` |
| `scripts/refresh_point.py out` | point forecast with 3 days of history, buoy, alerts, notices → `site/fc.json` | Open-Meteo, NOAA NDBC buoy 45139 (west Lake Ontario), Parks Canada Trent-Severn bulletins page, PortsToronto community notices page |

Run Blender headless: `blender -b -P blender/relief.py -- dem_trent.npy relief_trent.png 3.0 6.9`.

## Cartography rules (keep these)

- **Three map modes:**
  - **Plan:** terrestrial. Terrain relief, green land cover, roads.
  - **On the water:** chart style, inspired by IHO S-52. Land recedes to buff; water, depth, marks, bridges and hazards lead.
  - **Dark:** a dim palette. A separate **night-vision** toggle shifts the whole UI and map to red for pre-dawn rows.
- **Canadian buoyage, IALA Region B (red right returning):**
  - Starboard-hand: red cone/nun.
  - Port-hand: green can.
  - Special-purpose: yellow with an X topmark.
  - Lights: magenta flare.
  - Follow CHS Chart 1 / INT 1 wherever a convention exists.
- **Hazards in danger magenta:** dams and weirs (with a translucent danger band), restricted and harbour limits (dashed magenta), overhead cables (dashed).
- **Bridges over water** get heavy dark casing. They matter to rowers more than roads do.
- **Locks:** a boxed X symbol plus a lock-name label. Lock gates are heavy bars.
- **Depth:**
  - Bands at 0, 2, 5, 10, 20 and 50 m, darker for shallower water.
  - The **2 m line is the safety contour**, drawn heavier.
  - The Otonabee and Trent Canal have **no open survey**. Never invent depths there; the tap readout says "no survey".
- **Water labels:** blue italic. **Land labels:** upright. Labels are drawn to canvas and added as images because the artifact could not load a glyph server. On Pages you can switch to a proper glyph source.
- **Weather on the map:**
  - Wind particles are coloured by the **user's own go/no-go limits** (calm teal, caution amber, stop red), so map colour and row call always agree.
  - Wind arrows appear at zoom 14.2 and above.
  - Wave height is a field clipped to water, with the ramp tied to the wave limits.
  - A visibility veil sets opacity from forecast visibility.
  - **Steam fog** fills the water when the water is 8°C or more warmer than the air and wind is under 15 km/h.
  - Radar is an image overlay; alerts are hatched in ECCC colours.
- **Rowing layer:**
  - The user traces the course; it gets 250 m ticks (major tick every km).
  - Clubs are shown with the Blender shell sprite.
  - Landmarks are shown because rowers steer facing backwards.
- In-app disclaimer, **once only, in About / Data sources**: "A planning aid, not a navigation chart." Do not scatter warnings through the UI.

## Domain facts

- **Head of the Trent 2026:** Oct 2 to 4. Otonabee River and Trent Canal, Peterborough. Race course is 4.7 km this year; the finish moved to just before the Bata Library turn because of Faryon Bridge works. Crews race **upstream, northward**. The canal section is extremely narrow, with no passing. Hosted by Trent University and Peterborough Rowing Club; entries are on **RegattaCentral**.
- **The course line is not drawn yet.** No reliable published route was found. Have Robert trace it with the draw tool, or source it, rather than guessing.
- **Venue points:**
  - Argonaut RC: 43.6321, -79.4360.
  - Bata Library: 44.3572, -78.2904.
  - Faryon Bridge: 44.3583, -78.2898.
  - Peterborough Lift Lock: 44.3076, -78.3005.
- **Water temperature:** the Otonabee is assumed at 14°C in early October. It is editable in the old artifact; it should be editable here too.
- **Nav lights:** Canadian Collision Regulations require lights from sunset to sunrise and in restricted visibility. A vessel under oars may show a white light, so the app treats any part of a row outside sunrise to sunset as "lights on".
- **Default limits:**
  - Wind: caution 15 km/h, stop 25.
  - Gusts: caution 30, stop 40.
  - Waves: caution 0.3 m, stop 0.5 m.
  - Visibility: caution 5 km, stop 1 km.
  - Cold: caution at feels-like 5°C or below.
- **River chop estimate:** fetch-limited, H = 0.0016 · U · √(F/g) (U in m/s, F = 800 m by default).

## Roadmap, in priority order

1. **Make it a real PWA:** `manifest.webmanifest` with icons (render an app icon in Blender), a service worker that caches the shell, map data and sprites for offline use on the water, and an Android "Add to Home screen" install.
2. **Live data in the browser:** Open-Meteo (forecast and marine), ECCC alerts, GeoMet radar, the NDBC buoy. Check CORS for each source. Where a source blocks CORS (likely the NDBC text feed and the notices scraping), use a scheduled GitHub Action that writes JSON into the repo, or a small Cloudflare Worker. Add a radar **loop** (GeoMet supports a TIME dimension) and lightning.
3. **Any venue:** place search (Nominatim or Photon), then generate map data on demand. Options are live Overpass queries cached in IndexedDB, or a PMTiles base map on Pages with an OpenSeaMap raster overlay. Keep the three map modes.
4. **Use his location:** show his position and heading on the map, plus wind relative to the boat using the shell sprite.
5. **Race schedules:** RegattaCentral public pages sit behind a Cloudflare challenge, so do not scrape them. The official RegattaCentral API v4 uses OAuth2 with the user's RegattaCentral login; the client secret must live server-side (Worker). Keep heat-sheet import, and add a photo option (OCR) and `.ics` export of race times.
6. **Ship traffic:** AIS (for example aisstream.io, which needs a key and a server relay). Until then, link out to MarineTraffic and VesselFinder.
7. **Notices:**
   - Parks Canada Trent-Severn bulletins (scrape server-side).
   - PortsToronto community notices.
   - CCG Notices to Mariners (notmar.gc.ca) and NAVWARNs (nis.ccg-gcc.gc.ca).
8. **Recent severe weather and debris:** 72-hour gust, rain and thunder history (already in `fc.json`), plus links to the Northern Tornadoes Project.
9. **Later:** course fly-through and venue preview renders in Blender, weather icon set.

## Related things outside this repo

- An earlier single-page version lives as a claude.ai artifact ("RowCast"). A Claude scheduled task, **"RowCast weather refresh"**, refreshes its data every 2 hours from 4am to 10pm Toronto time. Retire it once this app is live.
- The prototype of this app is the claude.ai artifact "RowCast Prototype".

## Working conventions

- Canadian context: km/h by default (knots as an option), °C, metres, America/Toronto time zone, 24-hour clock.
- **No em dashes** in any user-facing copy or docs written for Robert.
- Plain, direct UI copy. Name things the way rowers do: launch, marshal, bow number, catch, steering marks.
- Design tokens are CSS custom properties on `:root`, with dark and night variants. Keep light, dark and night working together.
- Test at 400 px wide (Android) in light and dark. `scripts/screenshot.js` is a Playwright helper. Start a local server in `site/` first; it expects `test.html` on port 8766, so adjust it to `index.html`.

## PWA identity rules (shared origin)

This app shares `https://robertwalterj.github.io/` with all of Robert's other apps, so browser storage and Chrome install records are shared. Full rules: `PWA-IDENTITY-RULES.md` in `GPA Work - Claude Cowork\PWA Repos\`.

- Manifest `id` is unique and never the origin root: use `/<repo>/`. `scope` and `start_url` stay in this app's own folder, with no `#fragment`.
- Every cache, localStorage key and IndexedDB name carries this app's prefix.
- The service worker `activate` step deletes only caches with this app's prefix (beware overlapping prefixes). Never call global `caches.match()`; use `caches.open(OWN).then(c => c.match(req))`.
- Never serve `manifest.webmanifest` cache-first. Bump the cache name when the shell changes.
- Never edit a generated `docs/` by hand: fix the source and rebuild.
- Changing the id or scope makes Chrome treat this as a new app: tell Robert to uninstall and reinstall.
- If Chrome says "already installed" when it is not, add an in-page Install button (`beforeinstallprompt`) before anything drastic. Never suggest clearing site data for the whole origin without warning, because it resets every app's saved progress.


## Crew practice baked into the call (Robert, Oct 2026)

- Light rain is fine. Moderate rain (2.5 mm/h) is a caution, heavy (7.6 mm/h) is stay ashore.
- Thunder or lightning is never rowed: any thunder forecast within an hour either side of the row is stay ashore; a thunder-possible signal is a caution.
- Obvious whitecaps are a no: scattered is a caution, many is stay ashore (estimated from wind and gusts, never observed).
- A crew check-in or shared accounts feature was considered and dropped: the crew will not use the app, and it would need a real security review.
- Background alerts depend on Chrome's Periodic Background Sync (installed app, Chrome decides the timing). Foreground checks run on every forecast refresh.
