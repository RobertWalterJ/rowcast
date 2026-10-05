/* ================= live forecast: replaces the build-time snapshot as soon as the phone has a connection ================= */
// The snapshot in wx.json and fc.json is only a fallback for the first paint and for offline use.
// This file refreshes the wind grid, waves, point forecast and alerts from Open-Meteo and Environment Canada.
const OM = "https://api.open-meteo.com/v1/forecast", OMM = "https://marine-api.open-meteo.com/v1/marine";
const live = { at: 0, ok: false, busy: false };
const jget = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u.slice(0, 40) + " " + r.status); return r.json(); });
const gridPts = (w, s, e, n, nx, ny) => { const o = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) o.push([n + (s - n) * (j / (ny - 1)), w + (e - w) * (i / (nx - 1))]); return o; };
const ptsQ = (p) => `latitude=${p.map((x) => x[0].toFixed(4)).join(",")}&longitude=${p.map((x) => x[1].toFixed(4)).join(",")}`;
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const hourNow = () => nowLocal().slice(0, 13) + ":00";

async function liveWind(W) {
  const [w, s, e, n] = W.bbox; const nx = 6, ny = 6; const pts = gridPts(w, s, e, n, nx, ny);
  let d = await jget(`${OM}?${ptsQ(pts)}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,temperature_2m,dew_point_2m&timezone=America%2FToronto&forecast_days=3`);
  if (!Array.isArray(d)) d = [d];
  const times = d[0].hourly.time; const i0 = Math.max(0, times.indexOf(hourNow())); const T = times.slice(i0, i0 + 48);
  const out = { nx, ny, bbox: W.bbox, time: T, u: [], v: [], g: [], vis: [], t: [], td: [] };
  T.forEach((_, k) => {
    const j = i0 + k; const u = [], v = [], g = [], vis = [], t = [], td = [];
    d.forEach((p) => {
      const h = p.hourly; const sp = h.wind_speed_10m[j] || 0, rad = ((h.wind_direction_10m[j] || 0) * Math.PI) / 180;
      u.push(r1(-sp * Math.sin(rad))); v.push(r1(-sp * Math.cos(rad))); g.push(Math.round(h.wind_gusts_10m[j] || 0)); vis.push(Math.round(h.visibility[j] || 0));
      t.push(r1(h.temperature_2m[j])); td.push(r1(h.dew_point_2m[j]));
    });
    out.u.push(u); out.v.push(v); out.g.push(g); out.vis.push(vis); out.t.push(t); out.td.push(td);
  });
  return out;
}
async function liveWaveGrid(old) {
  const bb = old.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  const pts = gridPts(bb[0], bb[1], bb[2], bb[3], 6, 4);
  let d = await jget(`${OMM}?${ptsQ(pts)}&hourly=wave_height,wave_direction,wave_period&timezone=America%2FToronto&forecast_days=3`);
  if (!Array.isArray(d)) d = [d];
  const times = d[0].hourly.time; const i0 = Math.max(0, times.indexOf(hourNow())); const T = times.slice(i0, i0 + 48);
  return { pts: pts.map((p) => [+p[1].toFixed(4), +p[0].toFixed(4)]), time: T,
    hs: T.map((_, k) => d.map((p) => p.hourly.wave_height[i0 + k])), dir: T.map((_, k) => d.map((p) => p.hourly.wave_direction[i0 + k])), tp: T.map((_, k) => d.map((p) => p.hourly.wave_period[i0 + k])) };
}
async function livePoint(v) {
  const d = await jget(`${OM}?latitude=${v.lat}&longitude=${v.lon}&hourly=temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,cloud_cover_low,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cape,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max&timezone=America%2FToronto&past_days=1&forecast_days=5&wind_speed_unit=kmh`);
  const h = d.hourly; const key = { temperature_2m: "t", apparent_temperature: "feels", dew_point_2m: "dew", precipitation_probability: "pop", precipitation: "rain", weather_code: "code", cloud_cover_low: "lowcloud", visibility: "vis", wind_speed_10m: "wind", wind_direction_10m: "dir", wind_gusts_10m: "gust", cape: "cape", pressure_msl: "pres" };
  const ints = new Set(["vis", "cape", "code", "pop", "dir", "lowcloud"]); const hourly = { time: h.time };
  Object.entries(key).forEach(([k, sh]) => { hourly[sh] = (h[k] || []).map((x) => (x == null ? null : ints.has(sh) ? Math.round(x) : r1(x))); });
  return { hourly, daily: d.daily };
}
async function liveMarine(lat, lon) {
  const d = (await jget(`${OMM}?latitude=${lat}&longitude=${lon}&timezone=America%2FToronto&past_days=1&forecast_days=5&hourly=wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period`)).hourly;
  return { time: d.time, hs: d.wave_height.map(r1), tp: d.wave_period.map(r1), dir: d.wave_direction, wwh: (d.wind_wave_height || []).map(r1) };
}
async function liveAlerts(v) {
  const dd = 0.08; const j = await jget(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=${v.lon - dd},${v.lat - dd},${v.lon + dd},${v.lat + dd}`);
  const seen = new Set(), out = [];
  (j.features || []).forEach((f) => {
    const p = f.properties; const k = [p.alert_code, p.feature_name_en, p.event_end_datetime].join("|"); if (seen.has(k)) return; seen.add(k);
    out.push({ name: p.alert_short_name_en, type: p.alert_type, colour: p.risk_colour_en, area: p.feature_name_en, status: p.status_en, issued: p.publication_datetime, start: p.validity_datetime, end: p.event_end_datetime, text: (p.alert_text_en || "").slice(0, 1800) });
  });
  return out;
}
async function liveAlertShapes(v) {
  const j = await jget(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=${v.lon - 0.7},${v.lat - 0.5},${v.lon + 0.7},${v.lat + 0.5}`);
  const seen = new Set(), feats = [];
  (j.features || []).forEach((f) => {
    const p = f.properties; const k = [p.alert_code, p.feature_id].join("|"); if (seen.has(k) || !f.geometry) return; seen.add(k);
    feats.push({ type: "Feature", geometry: f.geometry, properties: { name: p.alert_short_name_en, type: p.alert_type, colour: p.risk_colour_en, area: p.feature_name_en, end: p.event_end_datetime, text: (p.alert_text_en || "").slice(0, 600) } });
  });
  return { type: "FeatureCollection", features: feats };
}
async function liveRefresh(force) {
  if (live.busy || (!navigator.onLine && !force)) return;
  live.busy = true;
  const id = state.venue, fv = fcVenue(); const wx = state.wx[id];
  const prevT = wx.wind.time[Math.min(state.hour, wx.wind.time.length - 1)];
  try {
    const jobs = [liveWind(wx.wind), livePoint(fv), liveAlerts(fv), liveAlertShapes(fv)];
    if (wx.waves) jobs.push(liveWaveGrid(wx.waves), liveMarine(...(id === "argo" ? [43.62, -79.42] : [fv.lat, fv.lon])));
    const [wind, pt, al, shapes, waves, marine] = await Promise.all(jobs);
    wx.wind = wind; wx.alerts = shapes; if (waves) wx.waves = waves;
    Object.assign(fv, { hourly: pt.hourly, daily: pt.daily, alerts: al }); if (marine) fv.waves = marine;
    state.fc.updated = new Date().toISOString(); live.at = Date.now(); live.ok = true;
    const k = wind.time.indexOf(prevT); state.hour = k >= 0 ? k : 0;
  } catch (e) { console.warn("live refresh", e); live.ok = false; }
  live.busy = false; liveApplied();
}
function liveApplied() {
  renderTime(); renderContext();
  if (mapReady) { map.getSource("alerts").setData(state.wx[state.venue].alerts || EMPTY); updateWindPts(); overlay.resetTrails(); overlay.dirty = true; renderLegendMini(); }
  if (state.screen !== "map") go(state.screen);
}
// How old is what we are showing? Used in the time bar and on the screens.
function dataAge() { const t = state.fc && Date.parse(state.fc.updated); return t ? (Date.now() - t) / 60000 : 1e9; }
function dataStamp() {
  const at = new Date(state.fc.updated); const hm = at.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  if (live.ok && dataAge() < 90) return { live: true, text: `Live forecast, updated ${hm}` };
  const day = at.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "short" });
  return { live: false, text: `Saved forecast from ${day} ${hm}. It may be out of date. Connect to update.` };
}
setInterval(() => { if (!document.hidden && dataAge() > 20) liveRefresh(); }, 120000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && dataAge() > 10) liveRefresh(); });
addEventListener("online", () => liveRefresh());
