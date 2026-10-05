/* ================= call core: the go / caution / stay ashore logic, shared by the app and the background alert checker =================
   This file has no access to the page. The build also copies it to site/callcore.js so the service worker can run the same
   rules when the app is closed. Keep it free of DOM, state and localStorage. */
"use strict";
const TZ = "America/Toronto";
const fmtParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function torLocal(d) { const p = {}; fmtParts.formatToParts(d).forEach((x) => (p[x.type] = x.value)); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
function localToDate(s) { const g = new Date(s + ":00Z"); const off = new Date(torLocal(g) + ":00Z") - g; return new Date(g.getTime() - off); }
const addMin = (s, m) => torLocal(new Date(localToDate(s).getTime() + m * 60000));

const OM = "https://api.open-meteo.com/v1/forecast", OMM = "https://marine-api.open-meteo.com/v1/marine";
const jget = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u.slice(0, 40) + " " + r.status); return r.json(); });
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Point forecast in the shape the app uses (short keys).
async function fetchPoint(v) {
  const d = await jget(`${OM}?latitude=${v.lat}&longitude=${v.lon}&hourly=temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,cloud_cover_low,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cape,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max&timezone=America%2FToronto&past_days=1&forecast_days=5&wind_speed_unit=kmh`);
  const h = d.hourly; const key = { temperature_2m: "t", apparent_temperature: "feels", dew_point_2m: "dew", precipitation_probability: "pop", precipitation: "rain", weather_code: "code", cloud_cover_low: "lowcloud", visibility: "vis", wind_speed_10m: "wind", wind_direction_10m: "dir", wind_gusts_10m: "gust", cape: "cape", pressure_msl: "pres" };
  const ints = new Set(["vis", "cape", "code", "pop", "dir", "lowcloud"]); const hourly = { time: h.time };
  Object.entries(key).forEach(([k, sh]) => { hourly[sh] = (h[k] || []).map((x) => (x == null ? null : ints.has(sh) ? Math.round(x) : r1(x))); });
  return { hourly, daily: d.daily };
}
async function fetchMarine(lat, lon) {
  const d = (await jget(`${OMM}?latitude=${lat}&longitude=${lon}&timezone=America%2FToronto&past_days=1&forecast_days=5&hourly=wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period`)).hourly;
  return { time: d.time, hs: d.wave_height.map(r1), tp: d.wave_period.map(r1), dir: d.wave_direction, wwh: (d.wind_wave_height || []).map(r1) };
}

// Whitecaps follow steady wind and gusts closely. They start near Beaufort 4 (about 20 km/h) and spread from about 30.
// This is an estimate from the forecast wind. Nothing in the app can see the water.
function whitecaps(wind, gust) {
  const e = Math.max(wind || 0, (gust || 0) * 0.7);
  if (e < 12) return { lvl: 0, word: "none expected", short: "none" };
  if (e < 20) return { lvl: 1, word: "a few possible", short: "a few" };
  if (e < 29) return { lvl: 2, word: "scattered", short: "scattered" };
  if (e < 39) return { lvl: 3, word: "many", short: "many" };
  return { lvl: 4, word: "widespread and breaking", short: "widespread" };
}
// Crew practice: light rain is fine; thunder and lightning never; obvious whitecaps are a no.
const RAIN_CAUTION = 2.5, RAIN_STOP = 7.6; // mm per hour: moderate rain is caution, heavy rain is stay ashore
const rainWord = (mm) => (mm < 0.1 ? "dry" : mm < RAIN_CAUTION ? "light rain" : mm < RAIN_STOP ? "rain" : "heavy rain");

/* o = { hourly, waves, win:{start,dur}, limits, waterTemp, sun:(dateStr) => SunCalc times } */
function callCore(o) {
  const h = o.hourly; const L = o.limits; const start = o.win.start, end = addMin(start, o.win.dur);
  if (!h) return null;
  const hr = (t) => t.slice(0, 13) + ":00";
  const ix = h.time.map((t, i) => i).filter((i) => h.time[i] >= hr(start) && h.time[i] < end);
  if (!ix.length) return null;
  // thunder is checked an hour either side of the row, because storms arrive early
  const ix2 = h.time.map((t, i) => i).filter((i) => h.time[i] >= hr(addMin(start, -60)) && h.time[i] < addMin(end, 60));
  const mx = (k) => Math.max(...ix.map((i) => h[k][i] ?? -1e9)), mn = (k) => Math.min(...ix.map((i) => h[k][i] ?? 1e9));
  const f = {}; let worst = 0; const lvl = (x) => { worst = Math.max(worst, x); return ["go", "caution", "stop"][x]; };
  const wmax = mx("wind"), gmax = mx("gust"), di = ix[Math.floor(ix.length / 2)], dir = h.dir[di];
  f.wind = { v: wmax, g: gmax, dir, di, cls: lvl(wmax >= L.windS || gmax >= L.gustS ? 2 : wmax >= L.windC || gmax >= L.gustC ? 1 : 0) };
  // Real strikes close by and recent (Canadian Lightning Detection Network) count as thunder when the row is soon.
  const L1 = o.lightning, soon = localToDate(start).getTime() - Date.now() < 2 * 3600e3;
  const lightning = L1 && L1.nearestKm != null && L1.nearestKm <= 30 && L1.minutesAgo <= 30 && soon ? { km: L1.nearestKm, min: L1.minutesAgo } : null;
  const thunder = ix2.some((i) => h.code[i] >= 95) || !!lightning;
  const maybe = !thunder && ix2.some((i) => (h.cape[i] || 0) >= 800 && (h.pop[i] || 0) >= 30);
  const rainMax = Math.max(0, ...ix.map((i) => h.rain[i] || 0));
  f.storm = { v: thunder, lightning, maybe, pop: mx("pop"), rain: ix.reduce((a, i) => a + (h.rain[i] || 0), 0), rainMax, cls: lvl(thunder || rainMax >= RAIN_STOP ? 2 : maybe || rainMax >= RAIN_CAUTION ? 1 : 0) };
  const vmin = mn("vis") / 1000; const wt = o.waterTemp; const tmin = mn("t");
  const steam = wt - tmin >= 8 && wmax < 15; const spread = Math.min(...ix.map((i) => h.t[i] - h.dew[i]));
  f.vis = { v: vmin, steam, spread, cls: lvl(vmin <= L.visS ? 2 : vmin <= L.visC || steam || spread <= 1 ? 1 : 0) };
  let hs = null; if (o.waves) { const wv = o.waves; const wi = wv.time.map((t, i) => i).filter((i) => wv.time[i] >= hr(start) && wv.time[i] < end); if (wi.length) hs = Math.max(...wi.map((i) => wv.hs[i] || 0)); }
  if (hs == null) { const U = wmax / 3.6; hs = 0.0016 * U * Math.sqrt(800 / 9.81); f.waveEst = true; }
  f.waves = { v: hs, cls: lvl(hs >= L.waveS ? 2 : hs >= L.waveC ? 1 : 0) };
  const fmin = mn("feels"); f.cold = { v: fmin, water: wt, cls: lvl(fmin <= L.feelsC || wt < 15 ? 1 : 0) };
  const wc = whitecaps(wmax, gmax); f.wcap = { ...wc, cls: lvl(wc.lvl >= 3 ? 2 : wc.lvl === 2 ? 1 : 0) };
  const st = o.sun(start); const sd = localToDate(start), ed = localToDate(end);
  const dark = sd < st.sunrise || ed > st.sunset; f.light = { dark, sunrise: st.sunrise, sunset: st.sunset, dawn: st.dawn, ndawn: st.nauticalDawn, cls: dark ? "caution" : "go" };
  if (dark) worst = Math.max(worst, 1);
  return { cls: ["go", "caution", "stop"][worst], word: ["Go", "Caution", "Stay ashore"][worst], f, start, end, code: h.code[di], temp: h.t[di] };
}
const stormWord = (s) => (s.lightning ? "lightning detected nearby" : s.v ? "thunderstorm forecast" : s.maybe ? "thunder possible" : rainWord(s.rainMax));

/* ---------- change detection for watched rows ---------- */
const FACTORS = { wind: "Wind", waves: "Waves", vis: "Visibility", storm: "Rain and storms", cold: "Cold", light: "Light", wcap: "Whitecaps" };
function watchSummary(c) {
  const f = c.f; const fc = {}; Object.keys(FACTORS).forEach((k) => (fc[k] = f[k].cls));
  const val = { wind: `${Math.round(f.wind.v)} km/h, gusts ${Math.round(f.wind.g)}`, waves: `${f.waves.v.toFixed(1)} m`, vis: `${f.vis.v.toFixed(f.vis.v < 10 ? 1 : 0)} km`, storm: stormWord(f.storm), cold: `${Math.round(f.cold.v)}°C feels`, light: f.light.dark ? "dark part of the row" : "daylight", wcap: f.wcap.short };
  return { cls: c.cls, word: c.word, fc, val, thunder: f.storm.v, at: Date.now() };
}
// Returns plain sentences describing what changed since the saved summary. Empty list means no change worth an alert.
function diffCall(base, now) {
  if (!base) return [];
  const rank = { go: 0, caution: 1, stop: 2 }; const out = [];
  if (now.thunder && !base.thunder) out.push("Thunder or lightning is now a risk around your row.");
  if (!now.thunder && base.thunder) out.push("The thunder and lightning risk has cleared.");
  if (rank[now.cls] !== rank[base.cls]) out.push(`The call went from ${base.word} to ${now.word}.`);
  Object.keys(FACTORS).forEach((k) => { if (rank[now.fc[k]] !== rank[base.fc[k]] && !(k === "storm" && now.thunder !== base.thunder)) out.push(`${FACTORS[k]}: ${base.fc[k]} to ${now.fc[k]} (${now.val[k]}).`); });
  return out;
}

/* ---------- tiny IndexedDB key/value store, shared by the page and the service worker ---------- */
const IDB_NAME = "rowcast-watch";
const idbOpen = () => new Promise((res, rej) => { const q = indexedDB.open(IDB_NAME, 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const idbGet = (db, k) => new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const idbSet = (db, k, v) => new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });


/* ---------- lightning: Canadian Lightning Detection Network via Environment Canada GeoMet ---------- */
const GEOMET_URL = "https://geo.weather.gc.ca/geomet";
async function fetchTimeRange(layer) {
  const t = await fetch(`${GEOMET_URL}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${layer}`, { cache: "no-store" }).then((r) => r.text());
  const m = /<Dimension name="time"[^>]*>\s*([^<\s]+)\s*</.exec(t); if (!m) throw new Error("no time range for " + layer);
  const [a, b, step] = m[1].split("/"); return { start: Date.parse(a), end: Date.parse(b), step: /PT(\d+)M/.test(step) ? +/PT(\d+)M/.exec(step)[1] * 60000 : 600000 };
}
// Looks at the last hour of 10 minute lightning frames around a point and reports the nearest strike square.
async function lightningScan(lat, lon, radiusKm = 100) {
  const tr = await fetchTimeRange("Lightning_2.5km_Density"); const N = 6, px = 200, per = (radiusKm * 2) / px;
  const R = 6378137, cosl = Math.cos((lat * Math.PI) / 180); const cx = (lon * Math.PI / 180) * R, cy = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R, half = (radiusKm * 1000) / cosl;
  const bbox = [cx - half, cy - half, cx + half, cy + half].map(Math.round).join(",");
  let best = null, count = 0;
  for (let k = 0; k < N; k++) {
    const t = new Date(tr.end - k * tr.step).toISOString().slice(0, 19) + "Z";
    const url = `${GEOMET_URL}?service=WMS&version=1.3.0&request=GetMap&layers=Lightning_2.5km_Density&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=${px}&height=${px}&bbox=${bbox}&time=${encodeURIComponent(t)}`;
    const bmp = await createImageBitmap(await fetch(url).then((r) => r.blob())); const cv = new OffscreenCanvas(px, px), g = cv.getContext("2d"); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, px, px).data; const ago = Math.max(0, Math.round((Date.now() - (tr.end - k * tr.step)) / 60000));
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      if (d[(y * px + x) * 4 + 3] < 40) continue; count++;
      const e = (x + 0.5 - px / 2) * per, n = (px / 2 - y - 0.5) * per, km = Math.hypot(e, n);
      if (km <= radiusKm && (!best || km < best.km || (km === best.km && ago < best.ago))) best = { km, ago, bearing: ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360 };
    }
  }
  return { at: tr.end, radiusKm, count, nearestKm: best ? Math.round(best.km) : null, minutesAgo: best ? best.ago : null, bearing: best ? best.bearing : null };
}
