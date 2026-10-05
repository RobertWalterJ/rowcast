/* ================= row log: how each row went, with the weather it was rowed in =================
   Entries live on the phone (localStorage rowcast2:log). A row can come from a GPX or TCX file exported from Strava or
   Garmin Connect, or be typed in. Either way the app looks up the weather for that time and place, then you add how it felt.
   Over time that shows where the forecast and your own experience agree. */
state.log = store.get("log", []);
const saveLog = () => store.set("log", state.log);
const LOG_OPTS = {
  felt: ["easier", "as expected", "harder"], wcSeen: ["none", "few", "scattered", "many"], wavesFelt: ["flat", "small", "lumpy", "rough"],
  rain: ["none", "light", "moderate", "heavy"], storm: ["none", "heard", "seen"]
};
const LOG_LABEL = { felt: "Compared with the forecast, it was", wcSeen: "Whitecaps you saw", wavesFelt: "Water", rain: "Rain", storm: "Thunder or lightning" };

/* ---------- reading GPX and TCX ---------- */
const kids = (el, name) => [...el.getElementsByTagName("*")].filter((n) => n.localName === name);
const num = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
function parseActivity(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("That file could not be read.");
  const pts = [];
  kids(doc, "trkpt").forEach((p) => { const t = kids(p, "time")[0]; pts.push({ t: t ? Date.parse(t.textContent) : null, lat: +p.getAttribute("lat"), lon: +p.getAttribute("lon"), hr: num((kids(p, "hr")[0] || {}).textContent), cad: num((kids(p, "cad")[0] || {}).textContent) }); });
  if (!pts.length) kids(doc, "Trackpoint").forEach((p) => { const pos = kids(p, "Position")[0]; if (!pos) return;
    pts.push({ t: Date.parse((kids(p, "Time")[0] || {}).textContent), lat: num(kids(pos, "LatitudeDegrees")[0].textContent), lon: num(kids(pos, "LongitudeDegrees")[0].textContent),
      hr: num((kids(kids(p, "HeartRateBpm")[0] || p, "Value")[0] || {}).textContent), cad: num((kids(p, "Cadence")[0] || kids(p, "RunCadence")[0] || {}).textContent), dist: num((kids(p, "DistanceMeters")[0] || {}).textContent) }); });
  const good = pts.filter((p) => p.lat != null && p.lon != null && p.t); if (good.length < 5) throw new Error("No GPS track found in that file.");
  const name = (kids(doc, "name")[0] || {}).textContent || "";
  return { pts: good, name };
}
const gpsDist = (a, b) => { const R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lon - a.lon) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
function simplify(pts, tol) { // Douglas-Peucker on a flat local grid, to keep the stored track small
  const k = Math.cos((pts[0].lat * Math.PI) / 180), P = pts.map((p) => [p.lon * k * 111320, p.lat * 111320]);
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = 0, mi = -1; for (let i = a + 1; i < b; i++) { const d = distSeg(P[i], P[a], P[b]); if (d > m) { m = d; mi = i; } } if (m > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]).map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]);
}
function distSeg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); }
function summarize(pts) {
  let dist = 0, moving = 0, vmax = 0; const hr = [], cad = [];
  for (let i = 1; i < pts.length; i++) { const d = gpsDist(pts[i - 1], pts[i]), dt = (pts[i].t - pts[i - 1].t) / 1000; if (dt <= 0 || dt > 120) continue; dist += d; const v = d / dt; if (v > 0.5) moving += dt; if (v < 8) vmax = Math.max(vmax, v); }
  pts.forEach((p) => { if (p.hr) hr.push(p.hr); if (p.cad) cad.push(p.cad); });
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const durS = (pts[pts.length - 1].t - pts[0].t) / 1000; const speed = moving ? dist / moving : 0;
  return { startMs: pts[0].t, durS, movingS: Math.round(moving), distM: Math.round(dist), avgSpeed: +speed.toFixed(2), maxSpeed: +vmax.toFixed(2), splitS: speed ? Math.round(500 / speed) : null,
    avgHr: avg(hr), maxHr: hr.length ? Math.max(...hr) : null, avgCad: avg(cad), track: simplify(pts, 6) };
}
const fmtSplit = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");
const fmtDur = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
function nearestVenue(lat, lon) { let best = null; Object.keys(VENUES).forEach((id) => { const v = VENUES[id]; const d = gpsDist({ lat, lon }, { lat: v.center[1], lon: v.center[0] }); if (!best || d < best.d) best = { id, d }; }); return best && best.d < 60000 ? best.id : state.venue; }

/* ---------- the weather the row was rowed in ---------- */
async function conditionsFor(venue, start, dur) {
  const fv = state.fc.venues[VENUES[venue].fc]; const lat = fv.lat, lon = fv.lon;
  const s = localToDate(start), days = (Date.now() - s.getTime()) / 864e5; const day = start.slice(0, 10), endDay = addMin(start, dur).slice(0, 10);
  const vars = "temperature_2m,apparent_temperature,precipitation,weather_code,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m";
  let h, src;
  if (days <= 85) { const d = await jget(`${OM}?latitude=${lat}&longitude=${lon}&hourly=${vars}&timezone=America%2FToronto&past_days=${Math.min(92, Math.ceil(days) + 1)}&forecast_days=1&wind_speed_unit=kmh`); h = d.hourly; src = "weather model, analysis hours"; }
  else { const d = await jget(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${day}&end_date=${endDay}&hourly=${vars}&timezone=America%2FToronto&wind_speed_unit=kmh`); h = d.hourly; src = "ERA5 reanalysis (a reconstruction, not a gauge)"; }
  const hr = (t) => t.slice(0, 13) + ":00", end = addMin(start, dur);
  const ix = h.time.map((t, i) => i).filter((i) => h.time[i] >= hr(start) && h.time[i] < end); if (!ix.length) throw new Error("No weather data for that time yet.");
  const col = (k) => ix.map((i) => h[k][i]).filter((x) => x != null);
  const out = { src, wind: Math.max(...col("wind_speed_10m")), gust: Math.max(...col("wind_gusts_10m")), dir: h.wind_direction_10m[ix[Math.floor(ix.length / 2)]], temp: Math.round(col("temperature_2m").reduce((a, b) => a + b, 0) / ix.length),
    feels: Math.round(Math.min(...col("apparent_temperature"))), rain: +col("precipitation").reduce((a, b) => a + b, 0).toFixed(1), vis: Math.round(Math.min(...col("visibility")) / 1000), thunder: col("weather_code").some((c) => c >= 95) };
  if (venue === "argo") { try { const m = await jget(`${OMM}?latitude=43.62&longitude=-79.42&hourly=wave_height&timezone=America%2FToronto&past_days=${Math.min(92, Math.ceil(Math.max(days, 0)) + 1)}&forecast_days=1`); const mh = m.hourly; const mi = mh.time.map((t, i) => i).filter((i) => mh.time[i] >= hr(start) && mh.time[i] < end);
    const w = mi.map((i) => mh.wave_height[i]).filter((x) => x != null); if (w.length) out.hs = +Math.max(...w).toFixed(2); } catch (e) { /* waves are optional */ } }
  out.wcap = whitecaps(out.wind, out.gust).short; return out;
}

/* ---------- list, insights and cards ---------- */
function openLog() {
  const list = state.log.slice().sort((a, b) => b.start.localeCompare(a.start));
  openSheet("Row log", `<div class="sharerow"><button class="btn primary" id="lgAdd">Log a row</button><button class="btn" id="lgImport">Import GPX or TCX</button></div>
    <input type="file" id="lgFile" accept=".gpx,.tcx,.fit,application/gpx+xml,text/xml,application/xml" multiple hidden>
    <p class="small muted" style="margin-top:8px">Strava: open the activity on strava.com, then the three dots, then Export GPX. Garmin Connect: open the activity, then the gear icon, then Export to GPX or TCX. Direct account links need a server, so for now the file is the bridge.</p>
    ${logInsights(list)}${list.length ? `<div class="loglist">${list.map(logCard).join("")}</div>` : `<p class="muted" style="margin-top:14px">No rows logged yet. After a row, tap Log a row and say how it went.</p>`}`, (b) => {
    b.querySelector("#lgAdd").onclick = () => openLogEntry({ venue: state.venue, start: addMin(nowLocal(), -90).slice(0, 15) + "0", dur: 90 });
    const fi = b.querySelector("#lgFile"); b.querySelector("#lgImport").onclick = () => fi.click(); fi.onchange = () => importFiles([...fi.files]);
    b.querySelectorAll("[data-log]").forEach((el) => el.onclick = () => openLogEntry(state.log.find((e) => e.id === el.dataset.log)));
  });
}
function trackSvg(track, w = 150, h = 84) {
  if (!track || track.length < 2) return "";
  const lons = track.map((p) => p[0]), lats = track.map((p) => p[1]); const k = Math.cos((lats[0] * Math.PI) / 180);
  const x0 = Math.min(...lons), x1 = Math.max(...lons), y0 = Math.min(...lats), y1 = Math.max(...lats); const sw = Math.max((x1 - x0) * k, 1e-6), sh = Math.max(y1 - y0, 1e-6); const sc = Math.min((w - 12) / sw, (h - 12) / sh);
  const X = (lon) => 6 + ((lon - x0) * k) * sc + (w - 12 - sw * sc) / 2, Y = (lat) => h - 6 - (lat - y0) * sc - (h - 12 - sh * sc) / 2;
  return `<svg viewBox="0 0 ${w} ${h}" class="trk" role="img" aria-label="Route"><polyline points="${track.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function logCard(e) {
  const c = e.cond, a = e.act; const v = VENUES[e.venue];
  const chips = [e.felt && `${e.felt} than forecast`.replace("as expected than forecast", "as forecast"), e.wcSeen && e.wcSeen !== "none" && `whitecaps: ${e.wcSeen}`, e.rain && e.rain !== "none" && `${e.rain} rain`, e.storm && e.storm !== "none" && `thunder ${e.storm}`, e.cutShort && "cut short"].filter(Boolean);
  return `<button class="logcard" data-log="${esc(e.id)}"><div class="lgtxt"><b>${esc(dayLbl(e.start))} · ${e.start.slice(11)}</b><span class="small muted">${esc(v ? v.name : "")} · ${fmtDur(e.dur * 60)}${a && a.distM ? ` · ${(a.distM / 1000).toFixed(1)} km · ${fmtSplit(a.splitS)} /500 m` : ""}</span>
    ${c ? `<span class="small">wind ${spd(c.wind)}, gusts ${spd(c.gust)} ${uLbl()}${c.hs != null ? ` · waves ${c.hs} m` : ""} · ${c.temp}°C${c.rain > 0 ? ` · ${c.rain} mm rain` : ""}</span>` : `<span class="small muted">weather not looked up yet</span>`}
    ${chips.length ? `<span class="lgchips">${chips.map((x) => `<i>${esc(x)}</i>`).join("")}</span>` : ""}</div>${a && a.track ? trackSvg(a.track) : ""}</button>`;
}
function logInsights(list) {
  const withC = list.filter((e) => e.cond); if (list.length < 2) return "";
  const L = state.limits; const dist = list.reduce((s, e) => s + ((e.act && e.act.distM) || 0), 0), min = list.reduce((s, e) => s + e.dur, 0); const lines = [];
  lines.push(`<b>${list.length} rows</b> logged, ${fmtDur(min * 60)} on the water${dist ? `, ${(dist / 1000).toFixed(0)} km` : ""}.`);
  if (withC.length) {
    const mw = Math.max(...withC.map((e) => e.cond.wind)), mg = Math.max(...withC.map((e) => e.cond.gust)); const mh = withC.filter((e) => e.cond.hs != null).map((e) => e.cond.hs);
    lines.push(`Strongest wind you rowed in: <b>${spd(mw)} ${uLbl()}</b> (your caution limit is ${spd(L.windC)}, stop ${spd(L.windS)}). Strongest gust: <b>${spd(mg)}</b>.${mh.length ? ` Biggest waves: <b>${Math.max(...mh).toFixed(1)} m</b>.` : ""}`);
    const seen = withC.filter((e) => e.wcSeen); if (seen.length >= 3) { const est = seen.filter((e) => ["scattered", "many", "widespread"].includes(e.cond.wcap)), hit = est.filter((e) => ["scattered", "many"].includes(e.wcSeen));
      lines.push(`Whitecaps: when the estimate said scattered or more, you reported them ${hit.length} of ${est.length} times. When it said a few or none, you reported scattered or more ${seen.filter((e) => !est.includes(e) && ["scattered", "many"].includes(e.wcSeen)).length} of ${seen.length - est.length} times.`); }
    const rr = withC.filter((e) => e.rain && e.rain !== "none").length; if (rr) lines.push(`You rowed in rain ${rr} time${rr > 1 ? "s" : ""}.`);
  }
  return `<div class="card insight" style="margin-top:14px">${lines.map((x) => `<p>${x}</p>`).join("")}</div>`;
}

/* ---------- editor ---------- */
function openLogEntry(base) {
  const isNew = !base.id; const e = Object.assign({ id: "r" + Date.now(), felt: "as expected", wcSeen: "none", wavesFelt: "small", rain: "none", storm: "none", cutShort: false, notes: "", boat: "", source: "manual", cond: null }, JSON.parse(JSON.stringify(base)));
  const seg = (k) => `<div class="field"><span>${LOG_LABEL[k]}</span><div class="seg" data-k="${k}">${LOG_OPTS[k].map((o) => `<button type="button" data-v="${o}" aria-pressed="${e[k] === o}">${o}</button>`).join("")}</div></div>`;
  openSheet(isNew ? "Log a row" : "Edit row", `<div class="form">
    <div class="row2"><label class="field">Start<input type="datetime-local" id="leStart" value="${e.start}"></label><label class="field">Length (min)<input type="number" id="leDur" min="10" max="360" value="${e.dur}"></label></div>
    <div class="row2"><label class="field">Where<select id="leVenue">${Object.values(VENUES).map((v) => `<option value="${v.id}" ${v.id === e.venue ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label><label class="field">Boat or crew<input id="leBoat" value="${esc(e.boat)}" placeholder="for example 1x or 4+"></label></div>
    ${e.act ? `<div class="card" style="padding:12px;display:flex;gap:12px;align-items:center">${trackSvg(e.act.track, 130, 76)}<div class="small"><b>${(e.act.distM / 1000).toFixed(2)} km</b> in ${fmtDur(e.act.durS)}<br>${fmtSplit(e.act.splitS)} per 500 m on average${e.act.avgCad ? `<br>${e.act.avgCad} strokes per minute` : ""}${e.act.avgHr ? `<br>heart rate ${e.act.avgHr} average, ${e.act.maxHr} highest` : ""}</div></div>` : ""}
    <div id="leCond" class="card" style="padding:12px"><span class="small muted">Looking up the weather for that time…</span></div>
    ${["felt", "wcSeen", "wavesFelt", "rain", "storm"].map(seg).join("")}
    <label class="field" style="flex-direction:row;align-items:center;gap:10px;text-transform:none;letter-spacing:0"><input type="checkbox" id="leCut" ${e.cutShort ? "checked" : ""}> We cut this row short</label>
    <label class="field">Notes<textarea id="leNotes" rows="3" placeholder="Hazards, what you would change, anything the forecast missed">${esc(e.notes)}</textarea></label>
    <div class="sharerow"><button class="btn primary" id="leSave">Save</button><button class="btn" id="leLook">Refresh weather</button>${isNew ? "" : '<button class="btn" id="leDel">Delete</button>'}</div></div>`, (b) => {
    b.querySelectorAll(".seg").forEach((sg) => sg.querySelectorAll("button").forEach((bt) => bt.onclick = () => { e[sg.dataset.k] = bt.dataset.v; sg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === bt)); }));
    const look = async () => { e.start = b.querySelector("#leStart").value; e.dur = +b.querySelector("#leDur").value || 90; e.venue = b.querySelector("#leVenue").value; const box = b.querySelector("#leCond"); box.innerHTML = '<span class="small muted">Looking up the weather for that time…</span>';
      try { e.cond = await conditionsFor(e.venue, e.start, e.dur); const c = e.cond; box.innerHTML = `<div class="small"><b>Weather then</b> (${esc(c.src)})<br>Wind ${spd(c.wind)}, gusts ${spd(c.gust)} ${uLbl()} from ${compass(c.dir)}${c.hs != null ? ` · waves ${c.hs} m` : ""}<br>${c.temp}°C, feels ${c.feels}°C · ${c.rain} mm rain · visibility ${c.vis} km${c.thunder ? " · thunder in the data" : ""}<br>Whitecaps estimated from the wind: <b>${esc(c.wcap)}</b></div>`; }
      catch (err) { e.cond = null; box.innerHTML = `<span class="small muted">${esc(err.message || "Weather not available. Needs a connection.")}</span>`; } };
    b.querySelector("#leLook").onclick = look; look();
    b.querySelector("#leSave").onclick = () => { e.start = b.querySelector("#leStart").value; e.dur = +b.querySelector("#leDur").value || 90; e.venue = b.querySelector("#leVenue").value; e.boat = b.querySelector("#leBoat").value.trim(); e.cutShort = b.querySelector("#leCut").checked; e.notes = b.querySelector("#leNotes").value.trim();
      const i = state.log.findIndex((x) => x.id === e.id); if (i >= 0) state.log[i] = e; else state.log.push(e); saveLog(); toast("Row saved"); openLog(); };
    const del = b.querySelector("#leDel"); if (del) del.onclick = () => { state.log = state.log.filter((x) => x.id !== e.id); saveLog(); toast("Row deleted"); openLog(); };
  });
}

/* ---------- importing files ---------- */
async function importFiles(files) {
  let last = null, n = 0;
  for (const f of files) {
    try {
      if (/\.fit$/i.test(f.name)) { toast("FIT files are not read yet. Export GPX or TCX instead."); continue; }
      const a = parseActivity(await f.text()); const s = summarize(a.pts); const start = torLocal(new Date(s.startMs)); const venue = nearestVenue(a.pts[0].lat, a.pts[0].lon);
      const dup = state.log.find((x) => x.start === start && x.venue === venue); if (dup) { toast(`${f.name} is already in the log`); last = dup; continue; }
      last = { id: "r" + Date.now() + n++, venue, start, dur: Math.max(10, Math.round(s.durS / 60)), source: "file", boat: "", act: { distM: s.distM, durS: Math.round(s.durS), movingS: s.movingS, splitS: s.splitS, avgSpeed: s.avgSpeed, maxSpeed: s.maxSpeed, avgHr: s.avgHr, maxHr: s.maxHr, avgCad: s.avgCad, track: s.track },
        felt: "as expected", wcSeen: "none", wavesFelt: "small", rain: "none", storm: "none", cutShort: false, notes: a.name ? a.name.slice(0, 120) : "", cond: null };
      state.log.push(last);
    } catch (err) { toast(`${f.name}: ${err.message}`); }
  }
  saveLog();
  if (last && files.length === 1) openLogEntry(last); else if (last) openLog();
}
// Files shared into the app from the Android share sheet or the Files app arrive through the service worker.
booted.then(async () => {
  if (new URLSearchParams(location.search).get("shared") !== "1") return;
  try { const db = await idbOpen(); const sh = (await idbGet(db, "shared")) || []; await idbSet(db, "shared", []); history.replaceState({ rc: "root" }, "", location.pathname);
    if (sh.length) importFiles(sh.map((x) => ({ name: x.name, text: async () => x.text }))); } catch (e) { console.warn("shared files", e); }
});
