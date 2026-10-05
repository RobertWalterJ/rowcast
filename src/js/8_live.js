/* ================= live data: rain radar loop (MSC GeoMet) and water levels (CHS, Water Survey of Canada) ================= */
const GEOMET = "https://geo.weather.gc.ca/geomet";
const radar = { frames: [], idx: 0, playing: false, timer: 0, status: "idle", fetchedAt: 0 };
const radarTiles = (t) => `${GEOMET}?service=WMS&version=1.3.0&request=GetMap&layers=RADAR_1KM_RRAI&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}&time=${encodeURIComponent(t)}`;

// The radar archive runs back three hours in six minute steps. We loop the last two hours, every 12 minutes.
async function radarLoad() {
  if (!mapReady) return;
  radar.status = "loading"; radarBar();
  try {
    const res = await fetch(`${GEOMET}?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI`, { cache: "no-store" });
    const m = /<Dimension name="time"[^>]*>\s*([^<\s]+)\s*</.exec(await res.text());
    if (!m) throw new Error("no radar time range");
    const [a, b, step] = m[1].split("/"); const t0 = Date.parse(a), t1 = Date.parse(b); const ms = /PT(\d+)M/.test(step) ? +/PT(\d+)M/.exec(step)[1] * 60000 : 360000;
    const frames = []; for (let t = t1; t >= Math.max(t0, t1 - 120 * 60000) && frames.length < 11; t -= 2 * ms) frames.unshift(new Date(t).toISOString().slice(0, 19) + "Z");
    if (!frames.length) throw new Error("no radar frames");
    radarDrop(); radar.frames = frames; radar.idx = frames.length - 1; radar.fetchedAt = Date.now(); radar.status = "ok";
    buildLayers();
  } catch (e) { console.warn("radar", e); radar.status = "fail"; }
  radarBar();
}
function radarDrop() {
  radar.frames.forEach((_, i) => { if (map.getLayer("rdr" + i)) map.removeLayer("rdr" + i); if (map.getSource("rdr" + i)) map.removeSource("rdr" + i); });
  radar.frames = [];
}
// Called from buildLayers: one hidden raster layer per frame, so the loop is smooth once the tiles are in.
function radarBuild() {
  radar.frames.forEach((t, i) => {
    if (!map.getSource("rdr" + i)) map.addSource("rdr" + i, { type: "raster", tiles: [radarTiles(t)], tileSize: 256, maxzoom: 9, attribution: "Radar: ECCC MSC GeoMet" });
    L({ id: "rdr" + i, type: "raster", source: "rdr" + i, layout: { visibility: state.layers.radar ? "visible" : "none" }, paint: { "raster-opacity": i === radar.idx ? 0.78 : 0, "raster-fade-duration": 0, "raster-resampling": "linear" } });
  });
}
function radarShow(i) {
  radar.idx = i; radar.frames.forEach((_, k) => map.getLayer("rdr" + k) && map.setPaintProperty("rdr" + k, "raster-opacity", k === i ? 0.78 : 0)); radarBar();
}
function radarPlay(on) {
  radar.playing = on; clearInterval(radar.timer);
  if (on) { radar.timer = setInterval(() => radarShow((radar.idx + 1) % radar.frames.length), 650); }
  radarBar();
}
async function radarToggle() {
  const on = state.layers.radar; document.body.classList.toggle("radar-on", on);
  if (!on) { radarPlay(false); radar.frames.forEach((_, i) => map.getLayer("rdr" + i) && map.setLayoutProperty("rdr" + i, "visibility", "none")); radarBar(); return; }
  if (!radar.frames.length || Date.now() - radar.fetchedAt > 6 * 60000) await radarLoad();
  else { radar.frames.forEach((_, i) => map.getLayer("rdr" + i) && map.setLayoutProperty("rdr" + i, "visibility", "visible")); radarBar(); }
  if (radar.status === "ok") radarPlay(true);
}
function radarBar() {
  const el = $("radarBar"); if (!el) return; el.hidden = !state.layers.radar;
  if (el.hidden) return;
  const ok = radar.status === "ok" && radar.frames.length;
  const t = ok ? new Date(radar.frames[radar.idx]) : null; const ago = t ? Math.round((Date.now() - t) / 60000) : 0;
  el.innerHTML = ok ? `<button class="play sm" id="rdrPlay" aria-label="${radar.playing ? "Pause radar" : "Play radar"}">${radar.playing ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>'}</button>
    <div class="rdrmid"><div class="rdrtop"><b>Rain radar ${torLocal(t).slice(11)}</b><span class="muted">${radar.idx === radar.frames.length - 1 ? "latest" : ago + " min ago"}</span></div>
    <input type="range" id="rdrSlider" min="0" max="${radar.frames.length - 1}" value="${radar.idx}" aria-label="Radar time">
    <div class="small muted">Last 2 hours of rain that has fallen. Not a forecast.</div></div>`
    : `<div class="rdrmid"><b>Rain radar</b><div class="small muted">${radar.status === "loading" ? "Loading the latest radar…" : "Radar needs a connection. Try again when you have signal."}</div></div>${radar.status === "fail" ? '<button class="btn" id="rdrRetry">Retry</button>' : ""}`;
  const pb = $("rdrPlay"); if (pb) pb.onclick = () => radarPlay(!radar.playing);
  const sl = $("rdrSlider"); if (sl) sl.oninput = (e) => { radarPlay(false); radarShow(+e.target.value); };
  const rt = $("rdrRetry"); if (rt) rt.onclick = () => radarLoad().then(() => radar.status === "ok" && radarPlay(true));
}
setInterval(() => { if (state.layers.radar && radar.status === "ok" && Date.now() - radar.fetchedAt > 6 * 60000 && !document.hidden) radarLoad(); }, 60000);

/* ---------- water levels ---------- */
// Lake Ontario at Toronto: CHS official gauge 13320 (metres above chart datum), observed and forecast.
// Otonabee River: Water Survey of Canada gauge 02HJ010 near Robinsons Island (gauge height, metres).
const WATER = {
  argo: { kind: "lake", name: "Lake Ontario at Toronto", src: "Canadian Hydrographic Service gauge 13320" },
  trent: { kind: "river", name: "Otonabee River near Robinsons Island", src: "Water Survey of Canada gauge 02HJ010" }
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + "Z";
async function fetchWater(id) {
  const now = Date.now();
  if (id === "argo") {
    const base = "https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/5cebf1e43d0f4a073c4bc3e5/data?time-series-code=";
    const [o, f] = await Promise.all([fetch(`${base}wlo&from=${iso(now - 24 * 36e5)}&to=${iso(now)}`).then((r) => r.json()),
      fetch(`${base}wlf&from=${iso(now)}&to=${iso(now + 24 * 36e5)}`).then((r) => r.json()).catch(() => [])]);
    return { obs: o.map((p) => [Date.parse(p.eventDate), p.value]), fc: f.map((p) => [Date.parse(p.eventDate), p.value]), got: now };
  }
  const r = await fetch(`https://api.weather.gc.ca/collections/hydrometric-realtime/items?STATION_NUMBER=02HJ010&limit=300&sortby=-DATETIME&f=json`).then((x) => x.json());
  const obs = r.features.map((x) => [Date.parse(x.properties.DATETIME), x.properties.LEVEL]).filter((p) => p[1] != null).sort((a, b) => a[0] - b[0]);
  return { obs, fc: [], got: now };
}
async function loadWater() {
  const id = state.venue; if (!WATER[id]) return null;
  state.water = state.water || {};
  const cached = state.water[id]; if (cached && Date.now() - cached.got < 10 * 60000) return cached;
  try { const d = await fetchWater(id); if (d.obs.length) { state.water[id] = d; store.set("water-" + id, d); return d; } } catch (e) { console.warn("water", e); }
  const old = store.get("water-" + id, null); if (old) { old.stale = true; state.water[id] = old; return old; }
  return null;
}
function waterSpark(obs, fc, now) {
  const all = obs.concat(fc); const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(0.02, (hi - lo) * 0.15);
  const X = (t) => 4 + ((t - x0) / (x1 - x0 || 1)) * 292, Y = (v) => 6 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * 48;
  const line = (a) => a.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 300 60" class="spark" role="img" aria-label="Water level, last 24 hours${fc.length ? " and forecast" : ""}"><line x1="${X(now)}" x2="${X(now)}" y1="0" y2="60" stroke="var(--line)"/>
    <polyline points="${line(obs)}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>${fc.length ? `<polyline points="${line(fc)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 4" opacity=".7"/>` : ""}</svg>`;
}
async function fillWater() {
  const el = $("waterCard"); if (!el) return; const w = WATER[state.venue]; if (!w) { el.remove(); return; }
  const d = await loadWater(); if (!$("waterCard")) return;
  if (!d) { el.innerHTML = `<h2>Water level</h2><p class="small muted">Not available right now. It needs a connection.</p>`; return; }
  const now = Date.now(); const last = d.obs[d.obs.length - 1]; const at = (ms) => { let b = d.obs[0]; for (const p of d.obs) if (Math.abs(p[0] - ms) < Math.abs(b[0] - ms)) b = p; return b[1]; };
  const dv = last[1] - at(last[0] - 3 * 36e5); const cm = Math.round(dv * 100); const vals = d.obs.map((p) => p[1]); const range = Math.round((Math.max(...vals) - Math.min(...vals)) * 100);
  const trend = Math.abs(cm) < 2 ? "Steady over the last 3 hours" : `${cm > 0 ? "Rising" : "Falling"} ${Math.abs(cm)} cm in 3 hours`;
  const ageMin = Math.round((now - last[0]) / 60000);
  const note = w.kind === "river" ? "Rising water means a stronger current and more floating debris. Gauge height is measured from the gauge zero, not the river bottom."
    : `The lake level moves about ${range} cm over a day here, partly from seiche (water sloshing in the lake). Heights are above chart datum, so they matter most for shallow docks and low bridges.`;
  const fcv = d.fc.map((p) => p[1]); const fcTxt = fcv.length ? ` Forecast next 24 h: ${Math.min(...fcv).toFixed(2)} to ${Math.max(...fcv).toFixed(2)} m.` : "";
  el.innerHTML = `<h2>Water level</h2><div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="val" style="font-size:1.6rem;font-weight:800">${last[1].toFixed(2)}<small style="font-size:.85rem;color:var(--muted);font-weight:600"> m</small></span><b class="${Math.abs(cm) >= 5 ? "c-caution" : ""}">${trend}</b></div>
    ${waterSpark(d.obs, d.fc, now)}<div class="small muted" style="display:flex;justify-content:space-between"><span>24 hours ago</span><span>now${fcv.length ? " · dashed = forecast" : ""}</span></div>
    <p class="small muted" style="margin-top:8px">${esc(w.name)}. ${esc(note)}${esc(fcTxt)}</p>
    <p class="small muted">${esc(w.src)} · reading ${ageMin < 90 ? ageMin + " min" : Math.round(ageMin / 60) + " h"} old${d.stale ? " (saved copy, offline)" : ""}</p>`;
}


/* ---------- lightning layer: the last hour of strikes, fainter as they age ---------- */
const ltg = { frames: [], status: "idle", fetchedAt: 0 };
const LTG_OPACITY = [0.28, 0.38, 0.5, 0.65, 0.8, 0.95]; // oldest to newest
const ltgTiles = (t) => `${GEOMET}?service=WMS&version=1.3.0&request=GetMap&layers=Lightning_2.5km_Density&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}&time=${encodeURIComponent(t)}`;
async function ltgLoad() {
  if (!mapReady) return;
  try {
    const tr = await fetchTimeRange("Lightning_2.5km_Density"); const fr = [];
    for (let k = 5; k >= 0; k--) fr.push(new Date(tr.end - k * tr.step).toISOString().slice(0, 19) + "Z");
    ltgDrop(); ltg.frames = fr; ltg.fetchedAt = Date.now(); ltg.status = "ok"; buildLayers();
  } catch (e) { console.warn("lightning layer", e); ltg.status = "fail"; toast("Lightning layer needs a connection"); }
}
function ltgDrop() { ltg.frames.forEach((_, i) => { if (map.getLayer("ltg" + i)) map.removeLayer("ltg" + i); if (map.getSource("ltg" + i)) map.removeSource("ltg" + i); }); ltg.frames = []; }
function ltgBuild() {
  ltg.frames.forEach((t, i) => {
    if (!map.getSource("ltg" + i)) map.addSource("ltg" + i, { type: "raster", tiles: [ltgTiles(t)], tileSize: 256, maxzoom: 9, attribution: "Lightning: Canadian Lightning Detection Network via ECCC" });
    L({ id: "ltg" + i, type: "raster", source: "ltg" + i, layout: { visibility: state.layers.lightning ? "visible" : "none" }, paint: { "raster-opacity": LTG_OPACITY[i], "raster-fade-duration": 0, "raster-resampling": "nearest" } });
  });
}
async function ltgToggle() {
  if (!state.layers.lightning) { ltg.frames.forEach((_, i) => map.getLayer("ltg" + i) && map.setLayoutProperty("ltg" + i, "visibility", "none")); return; }
  if (!ltg.frames.length || Date.now() - ltg.fetchedAt > 5 * 60000) await ltgLoad();
  else ltg.frames.forEach((_, i) => map.getLayer("ltg" + i) && map.setLayoutProperty("ltg" + i, "visibility", "visible"));
}
setInterval(() => { if (state.layers.lightning && !document.hidden && Date.now() - ltg.fetchedAt > 5 * 60000) ltgLoad(); }, 60000);

/* ---------- lightning near the venue: the number that matters ---------- */
state.lightning = {};
async function refreshLightning() {
  const v = V(), fv = fcVenue(); if (!fv) return; const id = state.venue;
  try { state.lightning[id] = await lightningScan(fv.lat, fv.lon, 100); }
  catch (e) { console.warn("lightning scan", e); state.lightning[id] = { error: true, at: Date.now() }; }
  if (state.screen === "call") renderCall();
  renderContext(); if (typeof checkWatches === "function") checkWatches();
}
function lightningCardHtml() {
  const s = state.lightning[state.venue]; let main, cls = "", note = "";
  if (!s) main = `<span class="muted">Checking the lightning network…</span>`;
  else if (s.error) main = `<span class="muted">Could not check lightning. It needs a connection.</span>`;
  else {
    const hm2 = new Date(s.at).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
    note = `Canadian Lightning Detection Network via Environment Canada, data to ${hm2}. Strikes appear about 10 minutes late. Thunder can be heard before lightning is detected.`;
    if (s.nearestKm == null) main = `<b>None detected</b> within ${s.radiusKm} km in the last hour.`;
    else { cls = s.nearestKm <= 30 && s.minutesAgo <= 30 ? "stop" : s.nearestKm <= 60 ? "caution" : ""; main = `<b>Nearest strike ${s.nearestKm} km ${compass(s.bearing)}, ${s.minutesAgo} min ago.</b> <span class="muted">${s.count} strike squares within ${s.radiusKm} km in the last hour.</span>`; }
  }
  return `<div class="card ltg ${cls}"><div class="top"><span>Lightning</span><span class="bolt">⚡</span></div><div class="ltgmain">${main}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;
}
setInterval(() => { if (!document.hidden) refreshLightning(); }, 5 * 60000);
booted.then(() => setTimeout(refreshLightning, 1500));
document.addEventListener("visibilitychange", () => { const s = state.lightning[state.venue]; if (!document.hidden && (!s || Date.now() - (s.at || 0) > 4 * 60000)) refreshLightning(); });
