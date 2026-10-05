/* ================= map: sources, cartographic layers, interaction ================= */
let map, mapReady = false, hazardPtsData = { type: "FeatureCollection", features: [] };
const CHS_WMS = "https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/chs/ENC_MaritimeChartService/MapServer/exts/MaritimeChartService/WMSServer";
const EMPTY = { type: "FeatureCollection", features: [] };
const SRC = ["water", "waterway", "landcover", "buildings", "roads", "rail", "structures", "power", "hazards", "seamarks", "seamark_areas", "landmarks", "places", "depth", "depth_contours"];

function initMap() {
  map = new maplibregl.Map({
    container: "map", attributionControl: false, center: V().center, zoom: V().zoom, maxZoom: 18, minZoom: 9, dragRotate: true, pitchWithRotate: false,
    style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": pal().bg } }] }
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors · OpenSeaMap · NOAA bathymetry · ECCC · Open-Meteo" }), "bottom-left");
  map.on("load", async () => {
    SRC.forEach((s) => map.addSource(s, { type: "geojson", data: EMPTY }));
    ["labels", "course", "courseTicks", "alerts", "windpts", "hazardPts"].forEach((s) => map.addSource(s, { type: "geojson", data: EMPTY }));
    const r = state.relief[state.venue];
    map.addSource("chs", { type: "raster", tiles: [CHS_WMS + "?service=WMS&version=1.3.0&request=GetMap&layers=0,1,2,3,4,5,6,7,10,11&styles=&format=image/png&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}"], tileSize: 256, maxzoom: 17, attribution: "Chart: Canadian Hydrographic Service, not for navigation" });
    map.addSource("relief", { type: "image", url: "relief_" + state.venue + ".png", coordinates: r.relief });
    mapReady = true;
    await loadVenueData();
    buildLayers();
    overlay.init();
    if (state.layers.radar) radarToggle();
  });
  map.on("click", onMapClick);
  map.on("move", () => overlay.dirty = true);
  map.on("moveend", () => { overlay.resetTrails(); });
}

async function loadVenueData() {
  const v = V();
  if (!state.data[v.id]) { const r = await fetch(v.map); state.data[v.id] = await r.json(); }
  const d = state.data[v.id];
  SRC.forEach((s) => map.getSource(s).setData(d[s] || EMPTY));
  // point symbols for hazards drawn as lines/areas
  const hp = [];
  (d.hazards.features || []).forEach((f) => { const k = f.properties.kind; if (k === "lock_gate") return;
    const c = centroid(f.geometry); if (!c) return; hp.push({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { kind: k, name: f.properties.name || "" } }); });
  // de-duplicate lock names (OSM maps locks as several pieces)
  const seen = new Set(); const hpu = hp.filter((f) => { const k = f.properties.kind + f.properties.name; if (f.properties.name && seen.has(k)) return false; seen.add(k); return true; });
  hazardPtsData = { type: "FeatureCollection", features: hpu }; map.getSource("hazardPts").setData(hazardPtsData);
  const r = state.relief[v.id]; map.getSource("relief").updateImage({ url: "relief_" + v.id + ".png", coordinates: r.relief });
  map.getSource("alerts").setData(state.wx[v.id].alerts || EMPTY);
  updateCourse(); updateWindPts();
}
function centroid(g) {
  let pts = [];
  const walk = (c) => { if (typeof c[0] === "number") pts.push(c); else c.forEach(walk); }; walk(g.coordinates);
  if (!pts.length) return null; return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

function buildLabels() {
  const d = state.data[state.venue]; if (!d) return;
  labelCache.forEach((k) => map.hasImage(k) && map.removeImage(k)); labelCache.clear();
  const P = pal(); const feats = []; let n = 0;
  const wn = {}; (d.waterway.features || []).forEach((f) => { const nm = f.properties.name; if (!nm || f.geometry.type !== "LineString") return;
    const L = f.geometry.coordinates.length; if (!wn[nm] || wn[nm].geometry.coordinates.length < L) wn[nm] = f; });
  Object.values(wn).forEach((f) => { const id = "w" + n++; labelImage(map, id, f.properties.name, { italic: true, color: P.waterLabel, size: 13, weight: 600, spacing: 1 });
    feats.push({ type: "Feature", geometry: f.geometry, properties: { lid: "lbl-" + id, kind: "water" } }); });
  (d.places.features || []).forEach((f) => { const p = f.properties; const big = p.kind === "city" || p.kind === "town";
    const id = "p" + n++; labelImage(map, id, big ? p.name.toUpperCase() : p.name, { size: big ? 13 : p.kind === "island" || p.kind === "islet" ? 11 : 11, weight: big ? 700 : p.kind === "rowing" ? 700 : 500,
      italic: p.kind === "island" || p.kind === "islet", spacing: big ? 2 : 0, color: p.kind === "rowing" ? cssv("--accent") || P.label : P.label });
    feats.push({ type: "Feature", geometry: f.geometry, properties: { lid: "lbl-" + id, kind: p.kind, rank: big ? 0 : p.kind === "rowing" ? 1 : 3 } }); });
  (hazardPtsData.features || []).forEach((f) => { if (f.properties.kind !== "lock" || !f.properties.name) return;
    const id = "l" + n++; labelImage(map, id, f.properties.name.replace(/ - .*/, ""), { size: 11, weight: 700, color: P.lock });
    feats.push({ type: "Feature", geometry: f.geometry, properties: { lid: "lbl-" + id, kind: "lock", rank: 1 } }); });
  labelImage(map, "bw", "Breakwall", { size: 11, weight: 700, spacing: 1.5, color: P.label });
  (d.structures.features || []).filter((f) => f.properties.kind === "breakwater" && f.geometry.type === "LineString" && courseLen(f.geometry.coordinates) > 280)
    .sort((a, b) => courseLen(b.geometry.coordinates) - courseLen(a.geometry.coordinates)).slice(0, 4)
    .forEach((f) => feats.push({ type: "Feature", geometry: f.geometry, properties: { lid: "lbl-bw", kind: "struct" } }));
  spotsFor().forEach((s, i) => { const id = "s" + i; labelImage(map, id, s.name, { size: 12, weight: 700, color: P.label });
    feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { lid: "lbl-" + id, kind: "spot", rank: 0 } }); });
  if (d.depth_contours) { const used = {}; d.depth_contours.features.forEach((f) => { const dd = f.properties.d; if (used[dd] > 2) return; used[dd] = (used[dd] || 0) + 1;
    const id = "d" + n++; labelImage(map, id, dd + " m", { size: 10, weight: 600, color: P.contour });
    feats.push({ type: "Feature", geometry: f.geometry, properties: { lid: "lbl-" + id, kind: "depth" } }); }); }
  map.getSource("labels").setData({ type: "FeatureCollection", features: feats });
}

function rm(id) { if (map.getLayer(id)) map.removeLayer(id); }
const LAYER_IDS = [];
function L(def) { rm(def.id); map.addLayer(def); LAYER_IDS.push(def.id); }
function buildLayers() {
  if (!mapReady) return;
  LAYER_IDS.splice(0).forEach(rm);
  addIcons(map);
  const P = pal(), mode = state.night ? "dark" : state.mode, chart = mode !== "plan";
  map.setPaintProperty("bg", "background-color", P.bg);
  document.getElementById("map").style.background = P.bg;
  const z = (a, b) => ["interpolate", ["linear"], ["zoom"], 11, a, 16, b];
  // land cover
  L({ id: "lc", type: "fill", source: "landcover", paint: { "fill-color": ["match", ["get", "kind"], "wood", P.wood, "park", P.park, "grass", P.grass, "wetland", P.wetland, "sand", P.sand, "farm", P.farm, "marina", P.marina, P.bg], "fill-opacity": chart ? 0.8 : 1 } });
  L({ id: "relief", type: "raster", source: "relief", paint: { "raster-opacity": state.layers.relief ? P.relief : 0, "raster-fade-duration": 0 } });
  L({ id: "bld", type: "fill", source: "buildings", minzoom: 13, paint: { "fill-color": P.bld, "fill-outline-color": P.bldLine } });
  // water and depth
  L({ id: "water", type: "fill", source: "water", paint: { "fill-color": P.water } });
  L({ id: "depth-fill", type: "fill", source: "depth", layout: { visibility: state.layers.depth ? "visible" : "none" },
    paint: { "fill-color": ["match", ["get", "min"], 0, P.depth[0], 2, P.depth[1], 5, P.depth[2], 10, P.depth[3], 20, P.depth[4], P.depth[5]], "fill-opacity": 1 } });
  L({ id: "depth-line", type: "line", source: "depth_contours", layout: { visibility: state.layers.depth ? "visible" : "none" },
    paint: { "line-color": ["case", ["==", ["get", "d"], 2], P.safety, P.contour], "line-width": ["case", ["==", ["get", "d"], 2], 1.6, 0.7], "line-opacity": 0.9 } });
  L({ id: "waterway", type: "line", source: "waterway", paint: { "line-color": P.river, "line-width": ["interpolate", ["linear"], ["zoom"], 11, ["match", ["get", "kind"], "canal", 2, "river", 2, 0.6], 16, ["match", ["get", "kind"], "canal", 10, "river", 8, 2]] } });
  L({ id: "shore", type: "line", source: "water", paint: { "line-color": P.shore, "line-width": chart ? z(0.6, 1.4) : z(0.4, 0.9), "line-opacity": chart ? 0.95 : 0.6 } });
  // nav areas (harbour limits, restricted areas): magenta dashed, chart convention
  L({ id: "sm-areas", type: "line", source: "seamark_areas", layout: { visibility: state.layers.marks ? "visible" : "none" },
    paint: { "line-color": P.hazard, "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.7 } });
  // transport
  L({ id: "rail", type: "line", source: "rail", paint: { "line-color": P.rail, "line-width": z(0.6, 1.6), "line-dasharray": [3, 2] } });
  L({ id: "road-case", type: "line", source: "roads", filter: ["<", ["get", "rank"], 5], layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["case", ["<=", ["get", "rank"], 2], P.majorCase, P.roadCase], "line-width": ["interpolate", ["linear"], ["zoom"], 11, ["match", ["get", "rank"], 1, 3, 2, 2.4, 3, 1.6, 0.6], 16, ["match", ["get", "rank"], 1, 12, 2, 10, 3, 8, 6]] } });
  L({ id: "road", type: "line", source: "roads", filter: ["<", ["get", "rank"], 5], layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["case", ["<=", ["get", "rank"], 2], P.major, P.road], "line-width": ["interpolate", ["linear"], ["zoom"], 11, ["match", ["get", "rank"], 1, 2, 2, 1.6, 3, 1, 0.3], 16, ["match", ["get", "rank"], 1, 10, 2, 8, 3, 6, 4.5]] } });
  // bridges: heavy casing over water, the chart cue a rower needs (clearance and arches)
  L({ id: "bridge-case", type: "line", source: "roads", filter: ["all", ["==", ["get", "bridge"], 1], ["==", ["get", "wb"], 1]], layout: { "line-cap": "butt" },
    paint: { "line-color": P.bridgeCase, "line-width": z(4, 14) } });
  L({ id: "bridge", type: "line", source: "roads", filter: ["all", ["==", ["get", "bridge"], 1], ["==", ["get", "wb"], 1]], layout: { "line-cap": "butt" },
    paint: { "line-color": chart ? P.road : "#FFFFFF", "line-width": z(2, 9) } });
  L({ id: "rail-bridge", type: "line", source: "rail", filter: ["all", ["==", ["get", "bridge"], 1], ["==", ["get", "wb"], 1]], paint: { "line-color": P.bridgeCase, "line-width": z(3, 9) } });
  L({ id: "piers", type: "line", source: "structures", filter: ["!=", ["get", "kind"], "breakwater"], paint: { "line-color": P.pier, "line-width": z(1.5, 5) } });
  // breakwall: a long stone wall the crews row inside of. Dark casing, pale stone top, rubble dashes.
  L({ id: "bw-case", type: "line", source: "structures", filter: ["==", ["get", "kind"], "breakwater"], layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": P.bwCase, "line-width": z(4, 17) } });
  L({ id: "bw", type: "line", source: "structures", filter: ["==", ["get", "kind"], "breakwater"], layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": P.bwFill, "line-width": z(2, 11) } });
  L({ id: "bw-rubble", type: "line", source: "structures", filter: ["==", ["get", "kind"], "breakwater"], minzoom: 12.5, layout: { "line-join": "round" }, paint: { "line-color": P.bwCase, "line-width": z(0.8, 3), "line-dasharray": [1.4, 1.8], "line-opacity": 0.8 } });
  // Official Canadian Hydrographic Service chart: covers our own base cartography when on; marks, hazards, wind and the rest stay on top.
  L({ id: "chs", type: "raster", source: "chs", layout: { visibility: state.layers.chs || V().chart ? "visible" : "none" }, paint: { "raster-fade-duration": 0 } });
  L({ id: "power", type: "line", source: "power", minzoom: 12, paint: { "line-color": P.power, "line-width": 1, "line-dasharray": [6, 3] } });
  // hazards: dams/weirs in danger magenta with a hatched band, lock gates as heavy bars
  L({ id: "dam-band", type: "line", source: "hazards", filter: ["in", ["get", "kind"], ["literal", ["dam", "weir"]]], paint: { "line-color": P.hazard, "line-width": z(3, 9), "line-opacity": 0.35 } });
  L({ id: "dam", type: "line", source: "hazards", filter: ["in", ["get", "kind"], ["literal", ["dam", "weir"]]], paint: { "line-color": P.hazard, "line-width": z(1.2, 2.5) } });
  L({ id: "lockgate", type: "line", source: "hazards", filter: ["==", ["get", "kind"], "lock_gate"], paint: { "line-color": P.lock, "line-width": z(2, 5) } });
  // alerts (hatched, ECCC colour)
  L({ id: "alerts-fill", type: "fill", source: "alerts", layout: { visibility: state.layers.alerts ? "visible" : "none" },
    paint: { "fill-pattern": ["match", ["downcase", ["coalesce", ["get", "colour"], "yellow"]], "red", "hatch-red", "orange", "hatch-orange", "hatch-yellow"], "fill-opacity": ["match", ["downcase", ["coalesce", ["get", "colour"], "yellow"]], "red", 0.3, "orange", 0.22, 0.09] } });
  L({ id: "alerts-line", type: "line", source: "alerts", layout: { visibility: state.layers.alerts ? "visible" : "none" },
    paint: { "line-color": ["match", ["downcase", ["coalesce", ["get", "colour"], "yellow"]], "red", "#D0302A", "orange", "#E07B00", "#C9A400"], "line-width": 2, "line-opacity": 0.8 } });
  radarBuild(); ltgBuild();
  // course
  L({ id: "course-case", type: "line", source: "course", layout: { "line-cap": "round", "line-join": "round", visibility: state.layers.course ? "visible" : "none" }, paint: { "line-color": "#FFFFFF", "line-width": 7, "line-opacity": dim() ? 0.25 : 0.9 } });
  L({ id: "course", type: "line", source: "course", layout: { "line-cap": "round", "line-join": "round", visibility: state.layers.course ? "visible" : "none" }, paint: { "line-color": state.night ? "#D0503F" : cssv("--accent") || "#0B6E82", "line-width": 3.5 } });
  L({ id: "course-ticks", type: "circle", source: "courseTicks", layout: { visibility: state.layers.course ? "visible" : "none" },
    paint: { "circle-radius": ["case", ["get", "major"], 4.5, 2.5], "circle-color": "#FFFFFF", "circle-stroke-color": state.night ? "#D0503F" : cssv("--accent") || "#0B6E82", "circle-stroke-width": 2 } });
  // wind arrows at forecast grid points (zoomed in)
  L({ id: "windpts", type: "symbol", source: "windpts", minzoom: 14.2, layout: { visibility: state.layers.wind ? "visible" : "none", "icon-image": "wind-arrow", "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map",
    "icon-size": ["interpolate", ["linear"], ["get", "s"], 0, 0.6, 30, 1.4], "icon-allow-overlap": true } });
  // symbols
  const ic = (id, src, filter, image, size, extra = {}) => L({ id, type: "symbol", source: src, filter, layout: Object.assign({ "icon-image": image, "icon-size": size, "icon-allow-overlap": true, "icon-anchor": "bottom" }, extra) });
  ic("landmarks", "landmarks", ["has", "kind"], "m-tower", z(0.7, 1), { visibility: state.layers.landmarks ? "visible" : "none" });
  ic("hz-dam", "hazardPts", ["in", ["get", "kind"], ["literal", ["dam", "weir"]]], "m-dam", z(0.7, 1.1), { "icon-anchor": "center" });
  ic("hz-lock", "hazardPts", ["==", ["get", "kind"], "lock"], "m-lock", z(0.8, 1.1), { "icon-anchor": "center" });
  ic("marks", "seamarks", ["has", "type"], ["match", ["get", "type"], "buoy_lateral", ["case", ["any", ["in", "red", ["get", "colour"]], ["in", "starboard", ["get", "cat"]]], "m-stbd", "m-port"],
    "buoy_special_purpose", "m-special", "mooring", "m-mooring", "light_minor", "m-light", "light_major", "m-light", "harbour", "m-marina", "small_craft_facility", "m-marina", "wreck", "m-wreck", "m-mooring"],
    ["interpolate", ["linear"], ["zoom"], 11, 0.55, 15, 1], { visibility: state.layers.marks ? "visible" : "none", "icon-anchor": ["match", ["get", "type"], "light_minor", "center", "light_major", "center", "mooring", "center", "bottom"] });
  ic("clubs", "places", ["==", ["get", "kind"], "rowing"], "m-club", 1, { "icon-anchor": "center" });
  // labels
  buildLabels();
  L({ id: "lbl-line", type: "symbol", source: "labels", filter: ["in", ["get", "kind"], ["literal", ["water", "struct"]]], layout: { "symbol-placement": "line-center", "icon-image": ["get", "lid"], "icon-rotation-alignment": "map", "icon-keep-upright": true, "icon-allow-overlap": false, "icon-offset": ["case", ["==", ["get", "kind"], "struct"], ["literal", [0, -11]], ["literal", [0, 0]]] } });
  L({ id: "lbl-depth", type: "symbol", source: "labels", filter: ["==", ["get", "kind"], "depth"], minzoom: 12.5, layout: { "symbol-placement": "line", "symbol-spacing": 400, "icon-image": ["get", "lid"], "icon-rotation-alignment": "map", "icon-keep-upright": true, visibility: state.layers.depth ? "visible" : "none" } });
  L({ id: "lbl-pt", type: "symbol", source: "labels", filter: ["!", ["in", ["get", "kind"], ["literal", ["water", "depth", "struct"]]]], layout: { "icon-image": ["get", "lid"], "symbol-sort-key": ["coalesce", ["get", "rank"], 5], "icon-anchor": ["case", ["in", ["get", "kind"], ["literal", ["lock", "rowing", "spot"]]], "left", "center"], "icon-offset": ["case", ["in", ["get", "kind"], ["literal", ["lock", "rowing", "spot"]]], ["literal", [12, 0]], ["literal", [0, 0]]] } });
  L({ id: "spot-dot", type: "circle", source: "labels", filter: ["==", ["get", "kind"], "spot"], paint: { "circle-radius": 5, "circle-color": state.night ? "#D0503F" : "#0B6E82", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } });
  renderLegendMini();
}

function setLayerVis() {
  const vis = (on) => (on ? "visible" : "none");
  const set = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", vis(on));
  ["depth-fill", "depth-line", "lbl-depth"].forEach((id) => set(id, state.layers.depth));
  ["marks", "sm-areas"].forEach((id) => set(id, state.layers.marks));
  ["alerts-fill", "alerts-line"].forEach((id) => set(id, state.layers.alerts));
  radarToggle(); ltgToggle(); if (map.getLayer("chs")) map.setLayoutProperty("chs", "visibility", state.layers.chs || V().chart ? "visible" : "none"); set("landmarks", state.layers.landmarks); set("windpts", state.layers.wind);
  ["course", "course-case", "course-ticks"].forEach((id) => set(id, state.layers.course));
  if (map.getLayer("relief")) map.setPaintProperty("relief", "raster-opacity", state.layers.relief ? pal().relief : 0);
  overlay.resetTrails(); overlay.dirty = true; renderLegendMini(); renderQuickChips(); save();
}

/* ---------- course: user-traced route with 250 m ticks ---------- */
const courseKey = () => (activeEvent() ? activeEvent().id : state.venue);
function hav(a, b) { const R = 6371000, t = Math.PI / 180; const dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
function courseLen(c) { let s = 0; for (let i = 1; i < c.length; i++) s += hav(c[i - 1], c[i]); return s; }
function updateCourse(coords) {
  const c = coords || state.courses[courseKey()] || [];
  map.getSource("course").setData(c.length > 1 ? { type: "Feature", geometry: { type: "LineString", coordinates: c }, properties: {} } : EMPTY);
  const ticks = []; let acc = 0, next = 0;
  for (let i = 1; i < c.length; i++) { const seg = hav(c[i - 1], c[i]);
    while (next <= acc + seg) { const f = (next - acc) / seg; ticks.push({ type: "Feature", geometry: { type: "Point", coordinates: [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f] }, properties: { major: next % 1000 === 0, m: next } }); next += 250; }
    acc += seg; }
  if (c.length === 1) ticks.push({ type: "Feature", geometry: { type: "Point", coordinates: c[0] }, properties: { major: true } });
  map.getSource("courseTicks").setData({ type: "FeatureCollection", features: ticks });
}
let drawing = null;
function startDraw() { drawing = (state.courses[courseKey()] || []).slice(); $("drawBar").hidden = false; $("readCard").hidden = true; $("drawLen").textContent = fmtLen(courseLen(drawing)); map.getCanvas().style.cursor = "crosshair"; }
function endDraw(saveIt) { if (saveIt) { state.courses[courseKey()] = drawing; save(); toast(drawing.length > 1 ? `Course saved · ${fmtLen(courseLen(drawing))}` : "Course cleared"); }
  drawing = null; $("drawBar").hidden = true; map.getCanvas().style.cursor = ""; updateCourse(); }
const fmtLen = (m) => (m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m");

/* ---------- tap readout ---------- */
function onMapClick(e) {
  if (drawing) { drawing.push([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]); updateCourse(drawing); $("drawLen").textContent = fmtLen(courseLen(drawing)); return; }
  const box = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
  const hit = map.queryRenderedFeatures(box, { layers: ["marks", "hz-lock", "hz-dam", "clubs", "landmarks", "alerts-fill"].filter((l) => map.getLayer(l)) });
  const card = $("readCard");
  const close = `<button class="x" aria-label="Close" onclick="document.getElementById('readCard').hidden=true">×</button>`;
  const f = hit.find((h) => h.layer.id !== "alerts-fill");
  if (f) {
    const p = f.properties; let title = "", sub = "";
    if (f.layer.id === "marks") { title = markName(p); sub = [p.name, lightText(p) && "Light " + lightText(p)].filter(Boolean).join(" · ") || "OpenSeaMap"; }
    else if (f.layer.id === "hz-lock") { title = p.name || "Lock"; sub = "Trent-Severn lockstation. Keep clear of the approach walls and blue-line mooring."; }
    else if (f.layer.id === "hz-dam") { title = (p.kind === "weir" ? "Weir" : "Dam") + " · danger"; sub = "Strong current and undertow near the crest and spillway. Stay well upstream of any safety boom."; }
    else if (f.layer.id === "clubs") { title = p.name; sub = "Rowing club"; }
    else if (f.layer.id === "landmarks") { title = "Conspicuous " + (p.kind || "landmark").replace("_", " "); sub = (p.name ? p.name + " · " : "") + "Useful steering mark over the stern."; }
    card.innerHTML = `<div style="flex:1;min-width:0"><b>${esc(title)}</b><div class="small muted" style="margin-top:3px">${esc(sub)}</div></div>${close}`;
    card.hidden = false; return;
  }
  const w = overlay.sample(e.lngLat.lng, e.lngLat.lat); const al = hit.find((h) => h.layer.id === "alerts-fill");
  const depth = map.queryRenderedFeatures(e.point, { layers: ["depth-fill"].filter((l) => map.getLayer(l)) })[0];
  const inWater = map.queryRenderedFeatures(e.point, { layers: ["water", "waterway"] }).length > 0;
  const cells = [
    ["Wind", w ? `${spd(w.s)} <small class="muted">${uLbl()}</small> ${compass(w.dir)}` : "—"],
    ["Gust", w ? `${spd(w.g)} <small class="muted">${uLbl()}</small>` : "—"],
    ["Visibility", w ? (w.vis / 1000).toFixed(w.vis < 10000 ? 1 : 0) + ' <small class="muted">km</small>' : "—"]
  ];
  if (w && w.hs != null && inWater) cells.push(["Waves", w.hs.toFixed(1) + ' <small class="muted">m</small>']);
  if (w && inWater) cells.push(["Whitecaps", whitecaps(w.s, w.g).short]);
  if (depth) cells.push(["Depth", `${depth.properties.min}–${depth.properties.max > 100 ? "50+" : depth.properties.max} <small class="muted">m</small>`]);
  else if (inWater && !V().depth) cells.push(["Depth", V().chart ? '<small class="muted">see chart soundings</small>' : '<small class="muted">no survey</small>']);
  if (w && w.steam && inWater) cells.push(["Fog", '<span style="color:var(--info)">steam fog</span>']);
  card.innerHTML = `<div style="flex:1;min-width:0"><div class="small muted" style="margin-bottom:6px">${esc(overlay.timeLabel())} · ${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}${al ? ` · <b style="color:var(--caution)">${esc(al.properties.name)}</b>` : ""}</div>
    <div class="readgrid">${cells.map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}</div></div>${close}`;
  card.hidden = false;
}
function updateWindPts() {
  const W = state.wx[state.venue].wind; const h = Math.min(state.hour, W.time.length - 1); const [w, s, e, n] = W.bbox; const feats = [];
  for (let j = 0; j < W.ny; j++) for (let i = 0; i < W.nx; i++) { const k = j * W.nx + i; const u = W.u[h][k], v = W.v[h][k]; const sp = Math.hypot(u, v);
    feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [w + (e - w) * i / (W.nx - 1), n - (n - s) * j / (W.ny - 1)] }, properties: { rot: (Math.atan2(u, v) * 180 / Math.PI + 360) % 360, s: sp } }); }
  map.getSource("windpts").setData({ type: "FeatureCollection", features: feats });
}
