/* ================= whitecaps, the run (spots along the water) and sharing the Row call ================= */

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
function whitecapCard(f) {
  const wc = whitecaps(f.wind.v, f.wind.g);
  const bar = [1, 2, 3, 4].map((i) => `<i style="background:${i <= wc.lvl ? "var(--info)" : "var(--sunk)"}"></i>`).join("");
  return `<div class="card wcap"><div class="top"><span>Whitecaps</span><span class="wcbar">${bar}</span></div><div class="wcword">${esc(wc.word)}</div>
    <div class="note">Estimated from wind ${spd(f.wind.v)} and gusts ${spd(f.wind.g)} ${uLbl()}. They start near 20 km/h of steady wind and spread above 30. Not seen on the water.</div></div>`;
}

/* ---------- spots along the run ---------- */
// Argonaut runs go inside the breakwall from the Humber River to Ontario Place, and out toward Hanlan's Point.
const SPOTS = {
  argo: [
    { id: "humber", name: "Humber mouth", lon: -79.4713, lat: 43.6319 },
    { id: "argo", name: "Argonaut RC", lon: -79.436, lat: 43.6321 },
    { id: "onplace", name: "Ontario Place", lon: -79.4182, lat: 43.6278 },
    { id: "hanlan", name: "Hanlan's Point", lon: -79.3893, lat: 43.6277 }
  ],
  trent: []
};
state.userSpots = store.get("spots", {});
const spotsFor = () => (SPOTS[state.venue] || []).concat(state.userSpots[state.venue] || []);

function runConditions(win) {
  const W = state.wx[state.venue].wind; const L = state.limits;
  const start = win.start.slice(0, 13) + ":00", end = addMin(win.start, win.dur);
  const idx = W.time.map((t, i) => i).filter((i) => W.time[i] >= start && W.time[i] < end);
  if (!idx.length) return null;
  const keep = state.hour;
  const rows = spotsFor().map((sp) => {
    let ws = 0, g = 0, hs = null, dir = 0, any = false;
    idx.forEach((i) => { state.hour = i; const s = overlay.sample(sp.lon, sp.lat); if (!s) return; any = true; if (s.s >= ws) { ws = s.s; dir = s.dir; } g = Math.max(g, s.g); if (s.hs != null) hs = Math.max(hs == null ? 0 : hs, s.hs); });
    if (!any) return { sp, none: true };
    const cw = ws >= L.windS || g >= L.gustS ? 2 : ws >= L.windC || g >= L.gustC ? 1 : 0, cs = hs == null ? 0 : hs >= L.waveS ? 2 : hs >= L.waveC ? 1 : 0;
    return { sp, ws, g, hs, dir, cls: ["go", "caution", "stop"][Math.max(cw, cs)], wc: whitecaps(ws, g) };
  });
  state.hour = keep; return rows;
}
function runCard(win) {
  const rows = runConditions(win);
  const body = !rows ? `<p class="small muted">No map forecast covers that time. The map forecast runs 48 hours from now.</p>`
    : !rows.length ? `<p class="small muted">No spots yet. Add the places along your run that you want to watch.</p>`
    : `<div class="runlist">${rows.map((r) => r.none ? `<div class="runrow"><b>${esc(r.sp.name)}</b><span class="muted small">outside the map</span></div>`
      : `<div class="runrow"><i class="dot" style="background:var(--${r.cls})"></i><div><b>${esc(r.sp.name)}</b><div class="small muted">wind ${spd(r.ws)}, gusts ${spd(r.g)} ${uLbl()} from ${compass(r.dir)}${r.hs != null ? ` · waves ${r.hs.toFixed(1)} m` : ""} · whitecaps ${esc(r.wc.short)}</div></div></div>`).join("")}</div>`;
  return `<div class="card" id="runCard"><h2>Along your run</h2>${body}<button class="btn" id="btnAddSpot" style="margin-top:10px">Add a spot</button><p class="small muted" style="margin-top:8px">Worst conditions between launch and finish at each spot. Colours use your own limits.</p></div>`;
}
function addSpotFlow() {
  go("map"); toast("Tap the map where you want the spot");
  const once = (e) => { map.off("click", once); const name = (window.prompt("Name this spot (for example Leander)") || "").trim(); if (!name) return;
    const list = state.userSpots[state.venue] || []; list.push({ id: "u" + Date.now(), name, lon: +e.lngLat.lng.toFixed(5), lat: +e.lngLat.lat.toFixed(5) });
    state.userSpots[state.venue] = list; store.set("spots", state.userSpots); buildLabels(); toast(name + " added"); };
  setTimeout(() => map.once("click", once), 50);
}

/* ---------- share the Row call with the crew ---------- */
function shareRow() {
  return `<div class="sharerow"><button class="btn primary" id="btnShare">Share with crew</button><button class="btn" id="btnCopy">Copy text</button></div>`;
}
function shareText(c, win) {
  const v = V(), ev = activeEvent(), f = c.f; const wc = whitecaps(f.wind.v, f.wind.g);
  const rows = (runConditions(win) || []).filter((r) => !r.none);
  const lines = [`ROW CALL: ${ev ? ev.name : v.name}`, `${dayLbl(c.start)}, ${c.start.slice(11)} to ${c.end.slice(11)}: ${c.word.toUpperCase()}`,
    `Wind ${spd(f.wind.v)} ${uLbl()}, gusts ${spd(f.wind.g)} from ${compass(f.wind.dir)}`,
    `Waves ${f.waves.v < 0.1 ? Math.round(f.waves.v * 100) + " cm" : f.waves.v.toFixed(1) + " m"}${f.waveEst ? " (estimated chop)" : ""}, whitecaps ${wc.short}`,
    `Visibility ${f.vis.v.toFixed(f.vis.v < 10 ? 1 : 0)} km${f.vis.steam ? ", steam fog likely" : ""}`, `${Math.round(c.temp)}°C, feels ${Math.round(f.cold.v)}°C. ${f.light.dark ? "Nav lights on." : "Daylight."}`];
  if (rows.length) lines.push("", "Along the run:", ...rows.map((r) => `${r.sp.name}: ${spd(r.ws)} / ${spd(r.g)} ${uLbl()}${r.hs != null ? `, ${r.hs.toFixed(1)} m` : ""} (${r.cls})`));
  lines.push("", "Forecast estimate from RowCast, not a safety guarantee. Make your own call on the water.", shareUrl(win));
  return lines.join("\n");
}
const shareUrl = (win) => `${location.origin}${location.pathname}?s=call&v=${state.venue}&t=${encodeURIComponent(win.start)}&d=${win.dur}`;
function wireCall(c, win) {
  const a = $("btnAddSpot"); if (a) a.onclick = addSpotFlow;
  if (!c) return;
  const sh = $("btnShare"), cp = $("btnCopy");
  if (sh) sh.onclick = async () => {
    const text = shareText(c, win);
    try { if (navigator.share) { await navigator.share({ title: "Row call", text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    copyText(text);
  };
  if (cp) cp.onclick = () => copyText(shareText(c, win));
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast("Copied. Paste it into your crew chat."); } catch (e) { window.prompt("Copy this text", t); } }

// A shared link opens the same venue and launch window.
booted.then(async () => {
  const q = new URLSearchParams(location.search); const v = q.get("v"), t = q.get("t"), d = +q.get("d") || 90;
  if (v && VENUES[v] && v !== state.venue) await selectVenue(v);
  if (t && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t)) { state.plan = { start: t, dur: d }; renderContext(); if (q.get("s") === "call") go("call"); }
});
