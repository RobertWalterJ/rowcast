# RowCast design audit (2026-10-04)

Checked at 400 px wide, light mode, on the five tabs. The map itself did not paint in my test pane (WebGL), so map findings come from the code and the legend, not from a live look. Mark those "verify on phone".

Each finding has a size: S (under an hour), M (a few hours), L (a day or more).

## A. Bugs and things that are plainly broken

| # | Where | Finding | Size |
|---|---|---|---|
| A1 | Row call | Selected launch-time chip text was invisible (white on white). FIXED, commit 2a7a500. | done |
| A2 | Races | "Event page" button shows default browser blue link text and does not match the other buttons. | S |
| A3 | Races hero mini-map | A vertical seam shows on the right where the relief overlay ends. The boat sprite is cropped at the edge. | S |
| A4 | Row call | Launch field shows 05/10/2026, which reads as 5 Oct or 10 May. Use a written date. | S |
| A5 | Row call | Waves say Caution at 0.3 m, but the marker sits right on the green/amber edge, so the bar looks green. At exactly the limit, the marker and label should agree (nudge it into amber, or show the limit value, see B8). | S |
| A6 | Row call | The row of launch chips is cut off at the right with no hint it scrolls. Add an edge fade. | S |

## B. Legends (you asked for these)

| # | Where | Finding | Size |
|---|---|---|---|
| B1 | Map | The wind colour key is a small gradient with fixed 45 / 75 percent stops. It does not move when you change your limits or units. It must be built from the real limits. | S |
| B2 | Map | Nothing on the map says WHY wind lines change colour. The key only appears as a tiny box. Add a one line caption: "Wind lines turn amber at your caution limit and red at your stop limit." | S |
| B3 | Map | Full legend lives two taps deep (menu, then Legend). Add a "?" or key button on the map that opens it, and make the mini key tappable (it already is, but nothing shows that). | S |
| B4 | Map | Tapped symbols explain themselves, but there is no way to search the legend. Group by what a rower needs: Hazards first, then Marks, then Water, then Land. | M |
| B5 | Forecast | Chart has two dashed lines (your caution and stop limits) with no label. Label them "caution 15" and "stop 25" at the line ends. Add a y-axis scale. | S |
| B6 | Forecast | Time axis shows only 21, 00, 03, 06 with no day. Add day names on the midnight tick. | S |
| B7 | Light | The 24-hour dial has no colour key. Add a strip: night, astronomical, nautical, civil, day, with the same colours as the dial. The table below should carry the same colour chips. | S |
| B8 | Row call | Gauges show a marker but not the limit values. Show "caution 15, stop 25" under each bar. | S |

## C. Cartography

| # | Finding | Size |
|---|---|---|
| C1 | **Wind colour.** Wind lines use the same amber and red as three other things: starboard-hand buoys (red), alerts (amber), and your go/no-go colours. Colour is doing four jobs on the water. The wind lines also change colour with the map mode (navy on chart water, teal on Plan, pale blue on Dark, red on night). This is the "different colour" you noticed. It is by design, but it is confusing. Suggested fix: keep go/caution/stop colours for the Row call screen only. On the map, show wind as one ink colour and show strength with line length, thickness and speed, plus a small number at arrow zoom. Keep red and amber only where it is a limit being crossed, and fade to calm teal below it. | M |
| C2 | Colour only, no second cue. Green, amber and red are the only difference between go, caution and stop in several places. Add an icon or word each time (check mark, triangle, X). Your colour-blindness audit standard should run on this app. | M |
| C3 | Symbol hierarchy. Rule of chart design: hazards loudest, then marks, then water and depth, then land, then labels. Check at zoom 13 that dams, weirs and bridges beat roads and buildings. | M |
| C4 | Depth. The 2 m safety contour is heavier, which is right. Add depth soundings (small numbers) at zoom 15 and above where data exists, and say "no survey" in a hatch pattern on the canal, not just in the tap card. | M |
| C5 | Labels use canvas images because there was no glyph server. On Pages you can use a real glyph source, which would give crisp, collision-aware labels and proper text halos. | L |
| C6 | Relief overlay shows hard streaks in the Races mini-map. Soften the hillshade (lower contrast, 315 degree sun, vertical exaggeration under 2) and fade its edges. | M |
| C7 | North arrow and scale bar are missing or not visible. Add both. A scale bar in metres, and a "rowing direction" arrow for the course. | S |
| C8 | Course line. Not drawn yet for Head of the Trent. Add start and finish flags, direction chevrons, and km ticks. The draw tool exists. | M |

## D. Intuition and flow

| # | Finding | Size |
|---|---|---|
| D1 | The Install button is hidden in the menu and gives no clue when it cannot install. Add a visible banner on first visit that says why. | S |
| D2 | Row call: one sentence at the top should say the answer in plain words ("Wind and waves are over your caution limit. Go if you are comfortable"). It is there as a ring, but a rower reading with cold hands wants the words first. | S |
| D3 | Tap targets are good (44 to 48 px). Keep. | none |
| D4 | The map screen has a lot of floating controls on the right. Group layers, mode and draw into one expanding button. | M |
| D5 | Night mode: confirm red-only really keeps text readable (the selected chip bug shows nobody has checked every state). Test every component in light, dark and night. | M |
| D6 | Dyslexia friendly: avoid long grey-on-white small text (the grey sub-lines are about 4:1 contrast). Raise to 4.5:1 or darker, and add read-aloud for the Row call summary. | M |

## E. Blender opportunities (what else the 3D tool can do)

| # | Idea | Why it helps | Size |
|---|---|---|---|
| E1 | Rendered symbol set: dams, weirs, locks, bridges, boathouses, as small consistent isometric icons | Instantly recognised, matches the boat sprites | L |
| E2 | "View from the boat" panoramas of each venue, facing backwards (stern view) | Rowers steer facing backwards. Landmark silhouettes help them learn a new course | L |
| E3 | Course fly-through previews as short looping video or frame strip per venue | Unfamiliar regatta water, race-day nerves | L |
| E4 | Better hillshade and a bathymetry render with proper lighting | Fixes C6, richer Plan mode | M |
| E5 | Weather icon set (go, caution, stop, fog, steam fog, wind arrows) rendered or drawn with one shared style | Pairs with C1 and C2 | M |
| E6 | Hero images and splash screen for each venue and event | Makes the Races card feel alive | S |
| E7 | Bridge clearance diagrams for locks and low bridges | Safety information | L |

Keep every rendered asset small (under 30 KB each, PNG or WebP) so offline caching stays light.

## Suggested order

1. Quick trust fixes: A2, A3, A4, A5, A6.
2. Legends: B1, B2, B5, B7, B8, then B3.
3. Wind colour redesign (C1) with the colour-blind cues (C2).
4. Map clarity: C3, C7, C8, C6.
5. Flow: D1, D2, D6.
6. Blender work after the UI is steady: E5, E4, then E1.

## Done so far (2026-10-04)

- A1 chip, A2 Event page button, B1 wind key follows your limits, B2 wind colour caption, B5 limit labels on the forecast chart, B7 Light colour key, B8 limit values under each gauge.
- Radar: now live. The old picture was a single baked-in snapshot. It is now the real MSC GeoMet feed, a 2 hour loop (11 frames, 12 minutes apart) with play, pause, a time slider, an "age" label, a rain colour key, and a clear "not a forecast" note. Radar tiles are never stored by the service worker.
- New hydrographic info on Row call: water level with 3 hour trend and a 24 hour trace. Toronto uses the CHS gauge (observed and forecast); the Otonabee uses Water Survey of Canada gauge 02HJ010.
- Not done: A3, A4 (the date format comes from the phone's own date picker), A5, A6, C1 redesign (left as is because CLAUDE.md says wind colours follow your limits), C2 to C8, D, E.
