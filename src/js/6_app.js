/* ================= races ================= */
const BOATS = ["1x", "2x", "4x", "8+"];
function raceTimes(r) { const launch = addMin(r.start, -(r.marshal + r.launch)), marshal = addMin(r.start, -r.marshal);
  const ev = state.events.find((e) => e.id === r.event); const km = (ev && ev.km) || 4.7; const fin = addMin(r.start, Math.round(((km * 1000) / 500) * (r.pace || 2.2)));
  return { launch, marshal, start: r.start, finish: fin }; }
function countdown(s) { const ms = localToDate(s) - Date.now(); if (ms < 0) return "done"; const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return h > 47 ? Math.round(h / 24) + " d" : h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; }
function condAt(s) { const v = fcVenue(); if (!v) return null; const i = v.hourly.time.indexOf(s.slice(0, 13) + ":00"); if (i < 0) return null; const h = v.hourly;
  return { wind: h.wind[i], gust: h.gust[i], dir: h.dir[i], vis: h.vis[i], t: h.t[i] }; }
function renderRaces() {
  const ev = activeEvent(); const evs = state.events.filter((e) => e.venue === state.venue);
  let html = `<div><div class="eyebrow">${esc(V().name)}</div><h1>Races</h1></div>`;
  if (ev) {
    const races = state.races.filter((r) => r.event === ev.id).sort((a, b) => a.start.localeCompare(b.start));
    html += `<div class="event"><div class="hero"><canvas id="evHero"></canvas><span class="tag">${esc(evDates(ev))}</span></div><div class="body"><h2>${esc(ev.name)}</h2>
      <div class="small">${esc(ev.detail || "")}</div><div class="small muted">${esc(ev.host || "")}${ev.entries ? " · entries on " + esc(ev.entries) : ""}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn primary" id="btnImport">Import heat sheet</button><button class="btn" id="btnAddRace">Add a race</button>${ev.url ? `<a class="btn" href="${esc(ev.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--ink)">Event page</a>` : ""}</div></div></div>`;
    html += `<h2 style="font-size:1.05rem;margin-top:6px">My races</h2>`;
    if (!races.length) html += `<div class="empty">No races yet. Import your club's heat sheet or add your crew's bow number and start time.</div>`;
    races.forEach((r) => { const t = raceTimes(r); const c = condAt(r.start); const st = sunTimes(r.start); const dark = localToDate(t.launch) < st.sunrise;
      const nowS = nowLocal(); const stage = nowS < t.launch ? 0 : nowS < t.marshal ? 1 : nowS < t.start ? 2 : 3;
      html += `<div class="race" data-id="${r.id}"><img src="${shellSrc(r.boat)}" alt="${esc(r.boat)} shell">
        <div style="min-width:0"><b>${esc(r.title)}</b> ${r.example ? '<span class="tag ex">example</span>' : ""}<div class="small muted">${esc(r.boat)} · bow ${esc(r.bow || "—")} · start ${r.start.slice(11)} ${esc(wdLbl(r.start))}</div>
          ${c ? `<div class="small" style="margin-top:3px">${spd(c.wind)} ${uLbl()} ${compass(c.dir)}${V().heading != null ? relWind(c.dir) : ""} · vis ${(c.vis / 1000).toFixed(0)} km · ${Math.round(c.t)}°C${dark ? ' · <b style="color:var(--caution)">lights to launch</b>' : ""}</div>` : ""}</div>
        <div class="cd">${countdown(t.start)}<small>to start</small></div>
        <div class="tl">${[["Launch", t.launch], ["Marshal", t.marshal], ["Start", t.start], ["Finish ~", t.finish]].map(([k, x], i) => `<div class="${i <= stage ? "on" : ""}">${k}<b>${x.slice(11)}</b></div>`).join("")}</div></div>`; });
    html += `<p class="small muted">Times work back from your start: launch ${races[0] ? races[0].launch : 20} min before marshalling, marshal ${races[0] ? races[0].marshal : 30} min before start. Tap a race to change it.</p>`;
  } else html += `<div class="empty">No event selected at ${esc(V().name)}. Pick or add an event from the menu.</div>`;
  const others = state.events.filter((e) => !ev || e.id !== ev.id);
  html += `<div class="card"><h2>Events</h2>${others.map((e) => `<button class="ditem" data-ev="${e.id}"><span class="ic">${flagIcon()}</span><span class="tx"><b>${esc(e.name)}</b><span>${esc(VENUES[e.venue].name)} · ${esc(evDates(e))}</span></span></button>`).join("") || '<div class="small muted">No other events yet.</div>'}
    <button class="btn full" id="btnAddEvent" style="margin-top:8px">Add an event</button></div>
    <div class="card"><h2>Schedules from RegattaCentral</h2><div class="small">Head of the Trent publishes entries on RegattaCentral. Its pages block automated readers, so in the installed app this will connect through RegattaCentral's official API with your RegattaCentral login. Until then, paste or photograph the heat sheet and RowCast pulls out your crews.</div></div>`;
  $("racesInner").innerHTML = html;
  if (ev) { drawHero(); $("btnImport").onclick = openImport; $("btnAddRace").onclick = () => openRace(); }
  $("btnAddEvent").onclick = openAddEvent;
  $("racesInner").querySelectorAll(".race").forEach((el) => el.onclick = () => openRace(state.races.find((r) => r.id === el.dataset.id)));
  $("racesInner").querySelectorAll("[data-ev]").forEach((b) => b.onclick = () => selectEvent(b.dataset.ev));
}
async function drawHero() {
  const c = $("evHero"); if (!c) return; const v = V(); if (!state.data[v.id]) { const r = await fetch(v.map); state.data[v.id] = await r.json(); }
  const d = state.data[v.id]; const rect = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); c.width = rect.width * dpr; c.height = rect.height * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr); const [w, s, e, n] = d._bbox; const course = state.courses[courseKey()] || [];
  let bw = w, bs = s, be = e, bn = n; if (course.length > 1) { bw = Math.min(...course.map((p) => p[0])) - 0.004; be = Math.max(...course.map((p) => p[0])) + 0.004; bs = Math.min(...course.map((p) => p[1])) - 0.003; bn = Math.max(...course.map((p) => p[1])) + 0.003; }
  else { const cx = v.center[0], cy = v.center[1]; bw = cx - 0.035; be = cx + 0.035; bs = cy - 0.02; bn = cy + 0.02; }
  const k = Math.cos((bs + bn) / 2 * Math.PI / 180); const sx = rect.width / ((be - bw) * k), sy = rect.height / (bn - bs); const sc = Math.min(sx, sy);
  const ox = (rect.width - (be - bw) * k * sc) / 2, oy = (rect.height - (bn - bs) * sc) / 2; const P = (p) => [ox + (p[0] - bw) * k * sc, oy + (bn - p[1]) * sc];
  const PL = pal(); g.fillStyle = PL.bg; g.fillRect(0, 0, rect.width, rect.height);
  const im = new Image(); im.src = "relief_" + v.id + ".png"; await new Promise((r) => { im.onload = r; im.onerror = r; });
  const rc = state.relief[v.id].relief; const a = P(rc[0]), b = P(rc[2]); if (im.width) { g.globalAlpha = 0.8; g.drawImage(im, a[0], a[1], b[0] - a[0], b[1] - a[1]); g.globalAlpha = 1; }
  g.fillStyle = PL.water; g.strokeStyle = PL.shore; g.lineWidth = 0.8;
  d.water.features.forEach((f) => { const gm = f.geometry; (gm.type === "Polygon" ? [gm.coordinates] : gm.coordinates).forEach((poly) => { g.beginPath(); poly.forEach((r) => r.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); })); g.fill("evenodd"); g.stroke(); }); });
  g.strokeStyle = PL.river; g.lineWidth = 3; d.waterway.features.filter((f) => f.properties.kind === "canal").forEach((f) => { g.beginPath(); (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates).forEach((ln) => ln.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); })); g.stroke(); });
  if (course.length > 1) { g.strokeStyle = "#fff"; g.lineWidth = 7; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); course.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke();
    g.strokeStyle = cssv("--accent"); g.lineWidth = 3.5; g.stroke(); }
  else { g.fillStyle = "rgba(255,255,255,.88)"; roundRect(g, 12, rect.height - 40, 210, 28, 8); g.fill(); g.fillStyle = "#0E1B22"; g.font = "600 12px Figtree"; g.fillText("Trace the course on the map to see it here", 20, rect.height - 22); }
  if (shellImgs["8p"]) { const sp = shellImgs["8p"]; g.save(); g.translate(rect.width - 40, rect.height / 2); g.rotate(0.5); g.drawImage(sp, -sp.width / sp.height * 55, -55, sp.width / sp.height * 110, 110); g.restore(); }
}
const flagIcon = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>`;

/* ================= sheets ================= */
function openSheet(title, html, mount) { $("sheetTitle").textContent = title; $("sheetBody").innerHTML = html; $("sheet").classList.add("on"); $("scrim").classList.add("on"); closeDrawer(true); syncOverlay(); mount && mount($("sheetBody")); }
function closeSheet() { $("sheet").classList.remove("on"); if (!$("drawer").classList.contains("on")) $("scrim").classList.remove("on"); syncOverlay(); }
function openDrawer() { renderDrawer(); $("drawer").classList.add("on"); $("scrim").classList.add("on"); syncOverlay(); }
function closeDrawer(keepScrim) { $("drawer").classList.remove("on"); if (!keepScrim) $("scrim").classList.remove("on"); syncOverlay(); }

function openLayers() {
  const modes = [["plan", "Plan"], ["water", "On the water"], ["dark", "Dark"]];
  openSheet("Map layers", `<div class="seg" id="modeSeg">${modes.map(([k, l]) => `<button data-m="${k}" aria-pressed="${state.mode === k}">${l}</button>`).join("")}</div>
   <div class="small muted" id="modeNote"></div>
   <div class="layers">${LAYER_DEFS.map(([k, l]) => `<button class="layer" data-k="${k}" aria-pressed="${state.layers[k]}"><canvas width="88" height="60" data-k="${k}"></canvas>${l}</button>`).join("")}</div>
   <button class="btn full" id="openLegend">Map legend and symbols</button>`, (b) => {
    const note = () => b.querySelector("#modeNote").textContent = { plan: "Terrain, roads and access on land. Best the night before.", water: "Chart style: land steps back, depth, buoys, bridges and hazards lead.", dark: "Dim palette that protects night vision for pre-dawn rows." }[state.mode];
    note();
    b.querySelectorAll("canvas").forEach((c) => { const g = c.getContext("2d"); g.scale(2, 2); LAYER_DEFS.find((d) => d[0] === c.dataset.k)[2](g); });
    b.querySelectorAll(".layer").forEach((el) => el.onclick = () => { state.layers[el.dataset.k] = !state.layers[el.dataset.k]; el.setAttribute("aria-pressed", state.layers[el.dataset.k]); setLayerVis(); });
    b.querySelectorAll("#modeSeg button").forEach((el) => el.onclick = () => { setMode(el.dataset.m); b.querySelectorAll("#modeSeg button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.m === state.mode)); note(); });
    b.querySelector("#openLegend").onclick = openLegend;
  });
}
function setMode(m) { state.mode = m; save(); buildLayers(); overlay.dirty = true; overlay.resetTrails(); }
function lgIcon(fn, w = 34, h = 24) { const c = iconCanvas(w, h, fn); c.style.width = w + "px"; c.style.height = h + "px"; return c; }
function openLegend() {
  const P = pal();
  const items = [
    ["Navigation marks (red right returning)", [
      ["Starboard-hand buoy, red", (g) => { g.translate(7, 1); MARK.stbd(g, 20, 22); }], ["Port-hand buoy, green", (g) => { g.translate(7, 1); MARK.port(g, 20, 22); }],
      ["Special-purpose buoy, yellow", (g) => { g.translate(7, 1); MARK.special(g, 20, 22); }], ["Mooring buoy", (g) => { g.translate(11, 6); MARK.mooring(g, 12, 12); }],
      ["Light", (g) => { g.translate(4, 4); MARK.light(g, 26, 26); }], ["Marina or harbour", (g) => { g.translate(7, 2); MARK.marina(g, 20, 20); }], ["Wreck", (g) => { g.translate(6, 5); MARK.wreck(g, 22, 14); }]]],
    ["Hazards and structures", [
      ["Dam or weir: danger", (g) => { g.strokeStyle = P.hazard; g.globalAlpha = .35; g.lineWidth = 8; g.beginPath(); g.moveTo(2, 12); g.lineTo(32, 12); g.stroke(); g.globalAlpha = 1; g.lineWidth = 2; g.stroke(); }],
      ["Lockstation", (g) => { g.translate(6, 1); MARK.lock(g, 22, 22); }], ["Lock gate", (g) => { g.strokeStyle = P.lock; g.lineWidth = 4; g.beginPath(); g.moveTo(17, 3); g.lineTo(17, 21); g.stroke(); }],
      ["Bridge over water", (g) => { g.fillStyle = P.water; g.fillRect(0, 0, 34, 24); g.strokeStyle = P.bridgeCase; g.lineWidth = 10; g.beginPath(); g.moveTo(2, 12); g.lineTo(32, 12); g.stroke(); g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke(); }],
      ["Pier or breakwall", (g) => { g.strokeStyle = P.pier; g.lineWidth = 4; g.beginPath(); g.moveTo(2, 18); g.lineTo(32, 6); g.stroke(); }],
      ["Overhead cable", (g) => { g.strokeStyle = P.power; g.setLineDash([6, 3]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(2, 12); g.lineTo(32, 12); g.stroke(); }],
      ["Restricted or harbour limit", (g) => { g.strokeStyle = P.hazard; g.setLineDash([3, 2]); g.lineWidth = 1.5; g.strokeRect(3, 4, 28, 16); }],
      ["Conspicuous landmark", (g) => { g.translate(10, 1); MARK.tower(g, 14, 22); }]]],
    ["Water", [
      ["0 to 2 m (shallow)", (g) => { g.fillStyle = P.depth[0]; g.fillRect(0, 2, 34, 20); }], ["2 to 5 m", (g) => { g.fillStyle = P.depth[1]; g.fillRect(0, 2, 34, 20); }],
      ["5 to 10 m", (g) => { g.fillStyle = P.depth[2]; g.fillRect(0, 2, 34, 20); }], ["10 m and deeper", (g) => { g.fillStyle = P.depth[4]; g.fillRect(0, 2, 34, 20); g.strokeStyle = P.line || "#ccc"; g.strokeRect(0, 2, 34, 20); }],
      ["2 m safety contour", (g) => { g.strokeStyle = P.safety; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 12); g.lineTo(32, 12); g.stroke(); }],
      ["River with no depth survey", (g) => { g.fillStyle = P.water; g.fillRect(0, 2, 34, 20); }]]],
    ["Weather", [
      ["Wind under your caution limit", (g) => { g.strokeStyle = dim() ? "#9cc" : "#0B5A6E"; g.lineWidth = 1.6; [6, 12, 18].forEach((y) => { g.beginPath(); g.moveTo(3, y); g.lineTo(31, y - 2); g.stroke(); }); }],
      ["Wind at caution", (g) => { g.strokeStyle = "#C87800"; g.lineWidth = 1.6; [6, 12, 18].forEach((y) => { g.beginPath(); g.moveTo(3, y); g.lineTo(31, y - 2); g.stroke(); }); }],
      ["Wind above stop limit", (g) => { g.strokeStyle = "#C8282A"; g.lineWidth = 1.6; [6, 12, 18].forEach((y) => { g.beginPath(); g.moveTo(3, y); g.lineTo(31, y - 2); g.stroke(); }); }],
      ["Waves, low to over limit", (g) => { const gr = g.createLinearGradient(0, 0, 34, 0); gr.addColorStop(0, "rgba(40,140,190,.5)"); gr.addColorStop(.6, "rgba(230,160,30,.8)"); gr.addColorStop(1, "rgba(200,50,90,.85)"); g.fillStyle = gr; g.fillRect(0, 2, 34, 20); }],
      ["Fog veil (thicker = lower visibility)", (g) => { g.fillStyle = P.water; g.fillRect(0, 2, 34, 20); g.fillStyle = "rgba(255,255,255,.75)"; g.fillRect(0, 2, 34, 20); }],
      ["Rain radar, light to heavy", (g) => { const gr = g.createLinearGradient(0, 0, 34, 0); ["#4aa8ff", "#00d4c8", "#18b030", "#ffe800", "#ff9a00", "#ff2a00", "#c800b4"].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 6, 34, 12); }],
      ["Lightning strike square, last hour", (g) => { [["#1a6bd1", 6, 14], ["#18b030", 14, 10], ["#ffe800", 22, 6], ["#ff2a00", 28, 12]].forEach(([c, x, y]) => { g.fillStyle = c; g.fillRect(x, y, 5, 5); }); }],
      ["Official chart (CHS): depths in metres, soundings, marks", (g) => { g.fillStyle = "#A9D0F5"; g.fillRect(0, 2, 34, 20); g.fillStyle = "#AF9B57"; g.fillRect(0, 2, 12, 20); g.fillStyle = "#33424a"; g.font = "9px sans-serif"; g.fillText("7", 18, 14); }],
      ["Weather alert area", (g) => { g.strokeStyle = "#C9A400"; g.lineWidth = 2; for (let i = -24; i < 40; i += 6) { g.beginPath(); g.moveTo(i, 24); g.lineTo(i + 24, 0); g.stroke(); } }]]],
    ["Rowing", [
      ["Your course, ticks every 250 m", (g) => { g.strokeStyle = "#fff"; g.lineWidth = 6; g.beginPath(); g.moveTo(2, 12); g.lineTo(32, 12); g.stroke(); g.strokeStyle = cssv("--accent"); g.lineWidth = 3; g.stroke(); g.fillStyle = "#fff"; g.lineWidth = 1.5; [8, 26].forEach((x) => { g.beginPath(); g.arc(x, 12, 3, 0, 7); g.fill(); g.stroke(); }); }],
      ["Rowing club", (g) => { if (shellImgs["1x"]) { g.translate(17, 12); g.rotate(-0.6); const im = shellImgs["1x"]; g.drawImage(im, -im.width / im.height * 11, -11, im.width / im.height * 22, 22); } }]]]
  ];
  openSheet("Legend", items.map(([h, list]) => `<div class="lg-h">${h}</div><div class="lg">${list.map(([l], i) => `<div data-h="${esc(h)}" data-i="${i}"><span class="slot"></span>${esc(l)}</div>`).join("")}</div>`).join("") +
    `<p class="small muted">Symbols follow Canadian chart conventions where they exist (CHS Chart 1 / INT 1). Depth from NOAA Great Lakes bathymetry. A planning aid, not a navigation chart.</p>`, (b) => {
      b.querySelectorAll("[data-h]").forEach((el) => { const grp = items.find((x) => x[0] === el.dataset.h)[1][+el.dataset.i]; el.querySelector(".slot").replaceWith(lgIcon(grp[1])); }); });
}
function openRace(r) {
  const ev = activeEvent(); const isNew = !r; r = r || { id: "r" + Date.now(), event: ev.id, title: "", boat: "1x", bow: "", start: `${ev.end}T09:00`, marshal: 30, launch: 20, pace: 2.2 };
  openSheet(isNew ? "Add a race" : "Edit race", `<label class="field">Event or category<input id="rTitle" value="${esc(r.title)}" placeholder="e.g. Masters Men 1x"></label>
   <div class="field">Boat<div class="boatpick">${BOATS.map((b) => `<button type="button" data-b="${b}" aria-pressed="${r.boat === b}"><img src="${shellSrc(b)}" alt="">${b}</button>`).join("")}</div></div>
   <div class="row2"><label class="field">Bow number<input id="rBow" inputmode="numeric" value="${esc(r.bow)}"></label><label class="field">Start time<input id="rStart" type="datetime-local" value="${r.start}"></label></div>
   <div class="row2"><label class="field">Marshal (min before start)<input id="rMarshal" type="number" value="${r.marshal}"></label><label class="field">Launch (min before marshal)<input id="rLaunch" type="number" value="${r.launch}"></label></div>
   <label class="field">Pace per 500 m (minutes)<input id="rPace" type="number" step="0.05" value="${r.pace}"></label>
   <div style="display:flex;gap:8px">${isNew ? "" : '<button class="btn" id="rDel" style="color:var(--stop)">Delete</button>'}<button class="btn primary" id="rSave" style="flex:1">${isNew ? "Add race" : "Save"}</button></div>`, (b) => {
    let boat = r.boat; b.querySelectorAll("[data-b]").forEach((x) => x.onclick = () => { boat = x.dataset.b; b.querySelectorAll("[data-b]").forEach((y) => y.setAttribute("aria-pressed", y.dataset.b === boat)); });
    b.querySelector("#rSave").onclick = () => { Object.assign(r, { title: b.querySelector("#rTitle").value || "Untitled race", boat, bow: b.querySelector("#rBow").value, start: b.querySelector("#rStart").value || r.start,
      marshal: +b.querySelector("#rMarshal").value || 0, launch: +b.querySelector("#rLaunch").value || 0, pace: +b.querySelector("#rPace").value || 2.2, example: false });
      if (isNew) state.races.push(r); save(); closeSheet(); renderRaces(); renderContext(); toast(isNew ? "Race added" : "Race saved"); };
    const del = b.querySelector("#rDel"); if (del) del.onclick = () => { state.races = state.races.filter((x) => x.id !== r.id); save(); closeSheet(); renderRaces(); toast("Race removed"); };
  });
}
function parseHeatSheet(text, day) {
  const out = [];
  text.split(/\n+/).forEach((line) => { const t = line.match(/\b([01]?\d|2[0-3])[:h.]([0-5]\d)(?::[0-5]\d)?\s*(am|pm)?\b/i); if (!t) return;
    let hh = +t[1]; if (t[3]) { const pm = /pm/i.test(t[3]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
    const rest = line.replace(t[0], " ");
    const bowM = rest.match(/(?:bow|#|no\.?)\s*(\d{1,4})/i) || rest.match(/^\s*(\d{1,4})\b/);
    const boatM = rest.match(/\b(1x|2x|2-|4x|4\+|4-|8\+)\b/i);
    const title = rest.replace(bowM ? bowM[0] : "", " ").replace(/\s{2,}/g, " ").replace(/^[\s,;|\-–]+|[\s,;|\-–]+$/g, "");
    out.push({ start: `${day}T${String(hh).padStart(2, "0")}:${t[2]}`, bow: bowM ? bowM[1] : "", boat: boatM ? (boatM[1].includes("8") ? "8+" : boatM[1].includes("4") ? "4x" : boatM[1].includes("2") ? "2x" : "1x") : "1x", title: title.slice(0, 60) || "Race" }); });
  return out;
}
function openImport() {
  const ev = activeEvent(); const days = []; for (let d = localToDate(ev.start + "T12:00"); torLocal(d).slice(0, 10) <= ev.end; d = new Date(d.getTime() + 864e5)) days.push(torLocal(d).slice(0, 10));
  openSheet("Import heat sheet", `<div class="small">Paste the lines for your crews from the heat sheet or start list. RowCast looks for a start time, a bow number and a boat class on each line. In the installed app you can also take a photo of a printed sheet.</div>
    <label class="field">Race day<select id="iDay">${days.map((d) => `<option value="${d}" ${d === ev.end ? "selected" : ""}>${esc(dayLbl(d))}</option>`).join("")}</select></label>
    <label class="field">Heat sheet text<textarea id="iText" rows="6" placeholder="Bow 212  Masters Men 1x  Argonaut RC  10:42"></textarea></label>
    <div id="iPrev"></div><button class="btn primary full" id="iAdd" disabled>Add selected races</button>`, (b) => {
    let rows = [];
    const upd = () => { rows = parseHeatSheet(b.querySelector("#iText").value, b.querySelector("#iDay").value);
      b.querySelector("#iPrev").innerHTML = rows.length ? `<div class="lg-h">Found ${rows.length}</div>` + rows.map((r, i) => `<label style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" checked data-i="${i}"><img src="${shellSrc(r.boat)}" style="height:34px" alt=""><span style="flex:1;min-width:0"><b>${esc(r.title)}</b><br><span class="small muted">bow ${esc(r.bow || "—")} · ${r.start.slice(11)} · ${r.boat}</span></span></label>`).join("") : (b.querySelector("#iText").value.trim() ? `<div class="small muted">No start times found yet. Each line needs a time such as 10:42.</div>` : "");
      b.querySelector("#iAdd").disabled = !rows.length; };
    b.querySelector("#iText").oninput = upd; b.querySelector("#iDay").onchange = upd;
    b.querySelector("#iAdd").onclick = () => { const pick = [...b.querySelectorAll("input[type=checkbox]")].filter((x) => x.checked).map((x) => rows[+x.dataset.i]);
      pick.forEach((r, i) => state.races.push(Object.assign({ id: "r" + Date.now() + i, event: ev.id, marshal: 30, launch: 20, pace: 2.2 }, r)));
      state.races = state.races.filter((r) => !r.example || r.event !== ev.id); save(); closeSheet(); renderRaces(); toast(`${pick.length} race${pick.length === 1 ? "" : "s"} added`); };
  });
}
function openAddEvent() {
  openSheet("Add an event", `<label class="field">Event name<input id="eName" placeholder="e.g. Head of the Rideau"></label>
    <label class="field">Venue<select id="eVenue">${Object.values(VENUES).map((v) => `<option value="${v.id}" ${v.id === state.venue ? "selected" : ""}>${esc(v.name)} · ${esc(v.place)}</option>`).join("")}</select></label>
    <div class="row2"><label class="field">First day<input id="eStart" type="date"></label><label class="field">Last day<input id="eEnd" type="date"></label></div>
    <div class="row2"><label class="field">Course length (km)<input id="eKm" type="number" step="0.1" value="5"></label><label class="field">Format<select id="eFmt"><option>Head race</option><option>Side-by-side</option><option>Time trial</option></select></label></div>
    <div class="small muted">New venues come from place search in the installed app. This prototype has map data for the two venues above.</div>
    <button class="btn primary full" id="eSave">Add event</button>`, (b) => {
    b.querySelector("#eSave").onclick = () => { const name = b.querySelector("#eName").value.trim(); const st = b.querySelector("#eStart").value; if (!name || !st) { toast("Add a name and a first day"); return; }
      const e = { id: "e" + Date.now(), name, venue: b.querySelector("#eVenue").value, start: st, end: b.querySelector("#eEnd").value || st, km: +b.querySelector("#eKm").value || 5, detail: `${b.querySelector("#eFmt").value}, ${b.querySelector("#eKm").value} km` };
      state.events.push(e); save(); closeSheet(); selectEvent(e.id); toast("Event added"); };
  });
}
function openLimits() {
  const lab = { windC: ["Wind caution", uLbl(), 1], windS: ["Wind stop", uLbl(), 1], gustC: ["Gust caution", uLbl(), 1], gustS: ["Gust stop", uLbl(), 1], waveC: ["Wave caution", "m", 0.05], waveS: ["Wave stop", "m", 0.05], visC: ["Visibility caution", "km", 0.5], visS: ["Visibility stop", "km", 0.5], feelsC: ["Cold: feels-like at or below", "°C", 1] };
  openSheet("Go / no-go limits", `<div class="small muted">These drive the row call, the wind colours on the map and the wave colours. Club and regatta rules come first.</div>` +
    Object.entries(lab).map(([k, [l, u, st]]) => `<label class="field">${l} <span class="mono" style="text-transform:none">${k.startsWith("wind") || k.startsWith("gust") ? spd(state.limits[k]) : state.limits[k]} ${u}</span><input type="range" data-k="${k}" min="0" max="${k.startsWith("wave") ? 1.5 : k.startsWith("vis") ? 10 : k === "feelsC" ? 15 : 60}" step="${st}" value="${state.limits[k]}"></label>`).join("") +
    `<button class="btn full" id="limReset">Reset to defaults</button>`, (b) => {
    b.querySelectorAll("input[type=range]").forEach((x) => x.oninput = () => { state.limits[x.dataset.k] = +x.value; x.previousElementSibling.textContent = `${x.dataset.k.startsWith("wind") || x.dataset.k.startsWith("gust") ? spd(+x.value) : x.value} ${lab[x.dataset.k][1]}`; save(); renderContext(); renderLegendMini(); overlay.dirty = true; });
    b.querySelector("#limReset").onclick = () => { state.limits = Object.assign({}, DEFAULT_LIMITS); save(); openLimits(); };
  });
}
function openSources() {
  openSheet("Data sources", `<div class="small" style="display:flex;flex-direction:column;gap:8px">
   <div><b>Map</b> OpenStreetMap contributors (ODbL). Nav marks from OpenSeaMap tags in OSM.</div>
   <div><b>Relief</b> Terrain from AWS Terrain Tiles, shaded in Blender with a north-west light.</div>
   <div><b>Depth</b> NOAA NCEI Great Lakes bathymetry, lake datum. The Otonabee and Trent Canal have no open depth survey.</div>
   <div><b>Forecast</b> Open-Meteo (Canadian GEM and HRDPS models). Lake waves from Open-Meteo Marine.</div>
   <div><b>Alerts and radar</b> Environment and Climate Change Canada (MSC GeoMet).</div>
   <div><b>Boats</b> 3D shells modelled and rendered in Blender for RowCast.</div>
   <div class="muted">This prototype uses a snapshot. The installed app pulls live data each time you open it.</div></div>`);
}
function renderDrawer() {
  const evIcon = flagIcon(); const pin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const home = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11 12 4l9 7v9H3z"/></svg>`;
  const ic = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${p}</svg>`;
  let h = `<header><img src="shell_1x.png" alt=""><b>RowCast</b></header><div class="dbody"><div class="dsec">Where you're rowing</div>`;
  Object.values(VENUES).forEach((v) => { h += `<button class="ditem" data-v="${v.id}" aria-current="${state.venue === v.id && !activeEvent()}"><span class="ic">${v.kind === "home" ? home : pin}</span><span class="tx"><b>${esc(v.name)}</b><span>${esc(v.place)}${v.kind === "home" ? " · home water" : ""}</span></span></button>`;
    state.events.filter((e) => e.venue === v.id).forEach((e) => h += `<button class="ditem" data-ev="${e.id}" aria-current="${activeEvent() && activeEvent().id === e.id}" style="padding-left:28px"><span class="ic">${evIcon}</span><span class="tx"><b>${esc(e.name)}</b><span>${esc(evDates(e))}</span></span></button>`); });
  h += `<button class="ditem" id="dAddEv"><span class="ic">${ic('<path d="M12 5v14M5 12h14"/>')}</span><span class="tx"><b>Add an event</b><span>Regatta, head race or training camp</span></span></button>
    <button class="ditem" id="dAddVen"><span class="ic">${ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')}</span><span class="tx"><b>Find a venue</b><span>Search any lake, river or club</span></span></button>
    <div class="dsec">Settings</div>
    <div style="padding:4px 10px 8px"><div class="small muted" style="margin-bottom:6px">Wind units</div><div class="seg" id="dUnits"><button data-u="kmh" aria-pressed="${state.unit === "kmh"}">km/h</button><button data-u="kn" aria-pressed="${state.unit === "kn"}">knots</button></div></div>
    <button class="ditem" id="dLimits"><span class="ic">${ic('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>')}</span><span class="tx"><b>Go / no-go limits</b><span>Wind ${spd(state.limits.windC)}/${spd(state.limits.windS)} ${uLbl()} · waves ${state.limits.waveC}/${state.limits.waveS} m</span></span></button>
    <button class="ditem" id="dLegend"><span class="ic">${ic('<path d="M4 6h16M4 12h16M4 18h10"/>')}</span><span class="tx"><b>Map legend</b><span>Buoys, hazards, depth and weather symbols</span></span></button>
    <button class="ditem" id="dLayers"><span class="ic">${ic('<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/>')}</span><span class="tx"><b>Map style and layers</b><span>${{ plan: "Plan", water: "On the water", dark: "Dark" }[state.mode]}</span></span></button>
    <div class="dsec">About</div>
    <button class="ditem" id="dSources"><span class="ic">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>')}</span><span class="tx"><b>Data sources</b><span>Where every layer comes from</span></span></button>
    <div class="small muted" style="padding:12px 10px">A planning aid, not a navigation chart. Look at the water and follow your club's safety rules.</div></div>`;
  $("drawer").innerHTML = h; const D = $("drawer");
  D.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => selectVenue(b.dataset.v));
  D.querySelectorAll("[data-ev]").forEach((b) => b.onclick = () => selectEvent(b.dataset.ev));
  D.querySelector("#dAddEv").onclick = openAddEvent;
  D.querySelector("#dAddVen").onclick = () => openSheet("Find a venue", `<label class="field">Search<input placeholder="Lake, river, club or regatta course" disabled></label><div class="small muted">Place search, map data and forecasts for any venue come with the installed app. The prototype includes the Otonabee River and the Argonaut waters.</div>`);
  D.querySelectorAll("#dUnits button").forEach((b) => b.onclick = () => { state.unit = b.dataset.u; save(); renderDrawer(); renderLegendMini(); refreshScreen(); });
  D.querySelector("#dLimits").onclick = openLimits; D.querySelector("#dLegend").onclick = openLegend; D.querySelector("#dLayers").onclick = openLayers; D.querySelector("#dSources").onclick = openSources;
}
async function selectVenue(id) { state.venue = id; state.event = null; state.hour = 0; state.plan = null; save(); closeDrawer(); await switchVenue(); }
async function selectEvent(id) { const e = state.events.find((x) => x.id === id); state.venue = e.venue; state.event = id; state.plan = null; save(); closeDrawer(); closeSheet(); await switchVenue(); }
async function switchVenue() {
  renderContext(); renderQuickChips(); renderTime();
  if (mapReady) { await loadVenueData(); buildLayers(); map.jumpTo({ center: V().center, zoom: V().zoom }); overlay.seed(); overlay.dirty = true; }
  refreshScreen(); liveRefresh();
}
function refreshScreen() { renderContext(); if (state.screen !== "map") go(state.screen); else { overlay.dirty = true; } }

/* ================= boot ================= */
async function boot() {
  document.documentElement.classList.toggle("night", state.night);
  const [rel, wx, fc] = await Promise.all(["relief.json", "wx.json", "fc.json"].map((u) => fetch(u).then((r) => r.json())));
  state.relief = rel; state.wx = wx; state.fc = fc; await loadShells();
  if (state.event && !state.events.find((e) => e.id === state.event)) state.event = null;
  renderContext(); renderQuickChips(); renderTime();
  document.querySelectorAll(".nav button").forEach((b) => b.onclick = () => go(b.dataset.s));
  $("btnMenu").onclick = openDrawer; $("scrim").onclick = () => { closeSheet(); closeDrawer(); }; $("sheetClose").onclick = closeSheet;
  $("ctxBtn").onclick = openDrawer; $("btnLayers").onclick = openLayers;
  $("btnMode").onclick = () => { setMode({ plan: "water", water: "dark", dark: "plan" }[state.mode]); toast({ plan: "Plan map", water: "On-the-water chart", dark: "Dark map" }[state.mode]); };
  $("btnNight").onclick = () => { state.night = !state.night; document.documentElement.classList.toggle("night", state.night); save(); buildLayers(); overlay.dirty = true; toast(state.night ? "Night vision on" : "Night vision off"); refreshScreen(); };
  $("btnHome").onclick = () => { const c = state.courses[courseKey()]; if (c && c.length > 1) { const b = new maplibregl.LngLatBounds(); c.forEach((p) => b.extend(p)); map.fitBounds(b, { padding: 70 }); } else map.flyTo({ center: V().center, zoom: V().zoom }); };
  $("btnDraw").onclick = () => (drawing ? endDraw(false) : startDraw());
  $("drawUndo").onclick = () => { drawing.pop(); updateCourse(drawing); $("drawLen").textContent = fmtLen(courseLen(drawing)); };
  $("drawDone").onclick = () => endDraw(true);
  $("hourSlider").oninput = (e) => setHour(+e.target.value);
  $("playBtn").onclick = () => { state.playing = !state.playing; $("playBtn").innerHTML = state.playing ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
    clearInterval(state._pt); if (state.playing) state._pt = setInterval(() => setHour((state.hour + 1) % state.wx[state.venue].wind.time.length), 900); };
  initMap();
  liveRefresh();
  setInterval(() => { if (state.screen === "races") renderRaces(); renderContext(); }, 60000);
}
const booted = boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("beforeend", `<div class="toast on">Could not load the prototype data</div>`); });
if ("serviceWorker" in navigator) addEventListener("load", () => {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e));
  // A new version took over: reload once so the phone shows it now, not on the next launch.
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
  // The app used to live at /rowcast/. Remove that old worker so it cannot answer for this page.
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => { if (new URL(r.scope).pathname === "/rowcast/") r.unregister(); })).catch(() => {});
});
