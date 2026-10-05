/* ================= chrome: nav, top bar, chips, time bar ================= */
function go(screen, fromBack) {
  navHistory(screen, fromBack);
  state.screen = screen;
  document.querySelectorAll(".nav button").forEach((b) => b.setAttribute("aria-current", b.dataset.s === screen ? "page" : "false"));
  ["map", "call", "fc", "light", "races"].forEach((s) => ($("s-" + s).hidden = s !== screen));
  if (screen === "map") { overlay.resize(); map && map.resize(); overlay.dirty = true; }
  if (screen === "call") renderCall(); if (screen === "fc") renderForecast(); if (screen === "light") renderLight(); if (screen === "races") renderRaces();
}
function renderContext() {
  const ev = activeEvent(); const v = V();
  $("ctxName").textContent = ev ? ev.name : v.name;
  $("ctxSub").textContent = ev ? `${v.name} · ${evDates(ev)}` : v.place;
  const c = computeCall(defaultWindow()); $("ctxDot").style.background = c ? `var(--${c.cls})` : "var(--muted)";
  $("callBadge").hidden = !c || c.cls === "go";
}
const evDates = (e) => { const a = dayLbl(e.start + "T12:00"), b = dayLbl(e.end + "T12:00"); return a === b ? a : `${a.replace(/^\w+, /, "")} to ${b.replace(/^\w+, /, "")}`; };
const LAYER_DEFS = [
  ["wind", "Wind", (g) => { g.strokeStyle = "#0B6E82"; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(6 + i * 3, 8 + i * 5); g.bezierCurveTo(16, 4 + i * 5, 26, 12 + i * 5, 38, 7 + i * 5); g.stroke(); } }],
  ["waves", "Waves", (g) => { const gr = g.createLinearGradient(0, 0, 44, 0); gr.addColorStop(0, "rgba(40,140,190,.5)"); gr.addColorStop(.6, "rgba(230,160,30,.8)"); gr.addColorStop(1, "rgba(200,50,90,.85)"); g.fillStyle = gr; g.fillRect(0, 0, 44, 30); }],
  ["vis", "Fog", (g) => { g.fillStyle = "#9cc"; g.fillRect(0, 0, 44, 30); const gr = g.createLinearGradient(0, 0, 0, 30); gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(1, "rgba(255,255,255,.2)"); g.fillStyle = gr; g.fillRect(0, 0, 44, 30); }],
  ["radar", "Radar", (g) => { g.fillStyle = "#e9eef0"; g.fillRect(0, 0, 44, 30); [["#4caf50", 18, 16, 12], ["#ffeb3b", 20, 15, 7], ["#f44336", 21, 15, 3]].forEach(([c, x, y, r]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); }],
  ["alerts", "Alerts", (g) => { g.strokeStyle = "#C9A400"; g.lineWidth = 2.2; for (let i = -30; i < 50; i += 6) { g.beginPath(); g.moveTo(i, 30); g.lineTo(i + 30, 0); g.stroke(); } }],
  ["depth", "Depth", (g) => { ["#79B6E2", "#B5D9F1", "#E8F3FB"].forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 15, 0, 15, 30); }); g.strokeStyle = "#0D3E66"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(15, 0); g.lineTo(15, 30); g.stroke(); }],
  ["marks", "Nav marks", (g) => { g.save(); g.translate(4, 4); MARK.stbd(g, 20, 22); g.restore(); g.save(); g.translate(20, 4); MARK.port(g, 20, 22); g.restore(); }],
  ["relief", "Relief", (g) => { const im = new Image(); g.fillStyle = "#e6e8e2"; g.fillRect(0, 0, 44, 30); for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(24,38,52,${0.08 + i * 0.04})`; g.beginPath(); g.ellipse(8 + i * 6, 15, 3, 12, 0.6, 0, 7); g.fill(); } }],
  ["course", "Course", (g) => { g.strokeStyle = "#0B6E82"; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 24); g.bezierCurveTo(16, 4, 28, 28, 40, 6); g.stroke(); g.fillStyle = "#fff"; g.strokeStyle = "#0B6E82"; g.lineWidth = 1.5; [[4, 24], [22, 16], [40, 6]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.stroke(); }); }],
  ["landmarks", "Landmarks", (g) => { g.save(); g.translate(15, 4); MARK.tower(g, 14, 22); g.restore(); }]
];
function renderQuickChips() {
  const items = [["wind", "Wind", "#0B6E82"], ["vis", "Fog", "#9aa"], ["waves", "Waves", "#E6A01E"], ["radar", "Radar", "#4caf50"], ["alerts", "Alerts", "#C9A400"], ["depth", "Depth", "#4F86B3"]]
    .filter(([k]) => k !== "waves" || state.wx[state.venue].waves).filter(([k]) => k !== "depth" || V().depth);
  $("quickChips").innerHTML = items.map(([k, l, c]) => `<button class="chip" data-k="${k}" aria-pressed="${state.layers[k]}"><i style="background:${c}"></i>${l}</button>`).join("");
  $("quickChips").querySelectorAll(".chip").forEach((b) => b.onclick = () => { state.layers[b.dataset.k] = !state.layers[b.dataset.k]; setLayerVis(); });
}
function renderLegendMini() {
  const L = state.limits; const parts = [];
  if (state.layers.wind) { const mx = L.windS * 1.4, c = Math.round(L.windC / mx * 100), s2 = Math.round(L.windS / mx * 100);
    parts.push(`<div><b>Wind</b> <span class="muted">${uLbl()}</span></div><div style="display:flex;gap:6px;align-items:center"><span class="ramp" style="width:90px;background:linear-gradient(90deg,${dim() ? "#9cc" : "#0B5A6E"} 0 ${c}%,#C87800 ${c}% ${s2}%,#C8282A ${s2}%)"></span><span class="mono" style="font-size:.66rem">${spd(L.windC)} · ${spd(L.windS)}</span></div><div class="muted" style="font-size:.66rem;line-height:1.25">Lines turn amber at your caution limit, red at your stop limit.</div>`); }
  if (state.layers.radar) parts.push(`<div style="display:flex;gap:6px;align-items:center"><b>Rain</b><span class="ramp" style="width:90px;background:linear-gradient(90deg,#4aa8ff,#00d4c8 18%,#18b030 36%,#0a7a1a 55%,#ffe800 66%,#ff9a00 76%,#ff2a00 86%,#c800b4 94%,#5a1e96)"></span><span class="mono" style="font-size:.66rem">0.1 → 50+ mm/h</span></div>`);
  if (state.layers.waves && state.wx[state.venue].waves) parts.push(`<div style="display:flex;gap:6px;align-items:center"><b>Waves</b><span class="ramp" style="width:70px;background:linear-gradient(90deg,rgba(40,140,190,.4),rgba(230,160,30,.8) 60%,rgba(200,50,90,.9))"></span><span class="mono" style="font-size:.66rem">${L.waveS} m</span></div>`);
  if (state.layers.depth && V().depth) parts.push(`<div style="display:flex;gap:6px;align-items:center"><b>Depth</b><span class="ramp" style="width:70px;background:linear-gradient(90deg,${pal().depth.join(",")})"></span><span class="mono" style="font-size:.66rem">0→50 m</span></div>`);
  $("legendMini").innerHTML = parts.join("") || `<span class="muted">No weather layers on</span>`;
  $("legendMini").onclick = () => openLegend();
}
function renderTime() {
  const W = state.wx[state.venue].wind; $("hourSlider").max = W.time.length - 1; $("hourSlider").value = state.hour;
  const t = W.time[Math.min(state.hour, W.time.length - 1)];
  $("timeLbl").textContent = `${wdLbl(t)} ${t.slice(11)}`;
  const diff = Math.round((localToDate(t) - Date.now()) / 3600e3); const st = dataStamp();
  $("timeRel").textContent = (diff === 0 ? "now" : diff < 0 ? `${-diff} h ago` : `in ${diff} h`) + (st.live ? " · live" : " · saved");
  $("timeRel").classList.toggle("c-caution", !st.live);
}
function setHour(h) { state.hour = h; renderTime(); updateWindPts(); overlay.dirty = true; overlay.resetTrails(); }

/* ================= row call ================= */
function defaultWindow() {
  const now = nowLocal(); const hr = +now.slice(11, 13);
  if (state.plan) return state.plan;
  const d = hr >= 9 ? torLocal(new Date(Date.now() + 864e5)).slice(0, 10) : now.slice(0, 10);
  return { start: `${d}T07:00`, dur: 90 };
}
function sunTimes(dateStr) { const v = V(); return SunCalc.getTimes(localToDate(dateStr.slice(0, 10) + "T12:00"), v.center[1], v.center[0]); }
function computeCall(win) {
  const v = fcVenue(); if (!v || !v.hourly) return null;
  return callCore({ hourly: v.hourly, waves: v.waves, win, limits: state.limits, waterTemp: waterTemp(), sun: sunTimes });
}
function gauge(val, c, s, max, lab) { const p = (x) => Math.max(0, Math.min(100, (x / max) * 100)); return `<div class="gauge" style="--a:${p(c)}%;--b:${p(s)}%"><i style="left:${p(val)}%"></i></div>${lab ? `<div class="lim">${lab}</div>` : ""}`; }
function renderCall() {
  const win = defaultWindow(); const c = computeCall(win); const L = state.limits; const ev = activeEvent();
  const quick = [];
  const today = nowLocal().slice(0, 10), tmr = torLocal(new Date(Date.now() + 864e5)).slice(0, 10);
  [[today, "06:30", "Today 06:30"], [today, "17:30", "Today 17:30"], [tmr, "06:30", "Tomorrow 06:30"], [tmr, "07:00", "Tomorrow 07:00"], [tmr, "09:00", "Tomorrow 09:00"], [tmr, "17:30", "Tomorrow 17:30"]]
    .forEach(([d, t, l]) => { if (`${d}T${t}` > nowLocal()) quick.push([`${d}T${t}`, l]); });
  state.races.filter((r) => r.event === (ev && ev.id)).forEach((r) => quick.unshift([addMin(r.start, -(r.marshal + r.launch)), `Race ${r.bow ? "#" + r.bow : ""} launch`]));
  const ring = (cls) => { const segs = c ? ["wind", "waves", "vis", "storm", "cold", "light", "wcap"].map((k) => c.f[k].cls) : []; const n = segs.length || 1;
    return `<svg viewBox="0 0 120 120">${segs.map((s, i) => { const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.06, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - 0.06;
      const p = (a) => [60 + 50 * Math.cos(a), 60 + 50 * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1);
      return `<path d="M${x0} ${y0} A50 50 0 0 1 ${x1} ${y1}" stroke="var(--${s})" stroke-width="10" fill="none" stroke-linecap="round"/>`; }).join("")}</svg>`; };
  let html = `<div><div class="eyebrow">${esc(ev ? ev.name : V().name)}</div><h1>Row call</h1></div>
  <div class="wchips">${quick.map(([s, l]) => `<button class="chip" data-s="${s}" aria-pressed="${s === win.start}">${esc(l)}</button>`).join("")}</div>
  <div class="card"><div class="row2"><label class="field">Launch<input type="datetime-local" id="pStart" value="${win.start}"></label>
    <label class="field">Length<select id="pDur">${[45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === win.dur ? "selected" : ""}>${m < 60 ? m + " min" : m / 60 + " h"}</option>`).join("")}</select></label></div></div>`;
  if (!c) html += `<div class="empty">No forecast covers that window yet. The forecast runs about four days ahead.</div>`;
  else {
    const f = c.f;
    html += `<div class="card verdict"><div class="vring">${ring()}<div class="w c-${c.cls}">${c.word.replace(" ", "<br>")}</div></div>
      <div style="min-width:0"><div class="vtitle c-${c.cls}">${c.word}</div><div class="muted" style="margin-top:4px">${esc(dayLbl(c.start))}, ${c.start.slice(11)} to ${c.end.slice(11)}<br>${esc(WX[c.code] || "")}, ${Math.round(c.temp)}°C</div></div></div>
    ${shareRow()}
    ${watchRow(win)}
    <div class="factors">
      <div class="factor"><div class="top">Wind <span class="pill ${f.wind.cls}">${f.wind.cls}</span></div><div class="val">${spd(f.wind.v)}<small>${uLbl()}</small></div>${gauge(f.wind.g, L.gustC, L.gustS, L.gustS * 1.5, `gust caution ${spd(L.gustC)} · stop ${spd(L.gustS)} ${uLbl()}`)}<div class="note">gusts ${spd(f.wind.g)} from ${compass(f.wind.dir)}${V().heading != null ? relWind(f.wind.dir) : ""}</div></div>
      <div class="factor"><div class="top">${f.waveEst ? "Chop" : "Waves"} <span class="pill ${f.waves.cls}">${f.waves.cls}</span></div><div class="val">${f.waves.v < 0.1 ? Math.round(f.waves.v * 100) + "<small>cm</small>" : f.waves.v.toFixed(1) + "<small>m</small>"}</div>${gauge(f.waves.v, L.waveC, L.waveS, L.waveS * 1.6, `caution ${L.waveC} · stop ${L.waveS} m`)}<div class="note">${f.waveEst ? "estimated from wind over 800 m of river" : "open lake, outside the breakwall"}</div></div>
      <div class="factor"><div class="top">Visibility <span class="pill ${f.vis.cls}">${f.vis.cls}</span></div><div class="val">${f.vis.v.toFixed(f.vis.v < 10 ? 1 : 0)}<small>km</small></div>${gauge(20 - Math.min(20, f.vis.v), 20 - L.visC, 20 - L.visS, 20, `caution under ${L.visC} · stop under ${L.visS} km`)}<div class="note">${f.vis.steam ? `steam fog likely: water ${Math.round(f.cold.water)}°C, air ${Math.round(c.temp)}°C` : `dew-point spread ${f.vis.spread.toFixed(1)}°`}</div></div>
      <div class="factor"><div class="top">Rain and storms <span class="pill ${f.storm.cls}">${f.storm.cls}</span></div><div class="val" style="font-size:1.2rem">${esc(stormWord(f.storm).replace(/^./, (x) => x.toUpperCase()))}</div>${gauge(f.storm.rainMax, RAIN_CAUTION, RAIN_STOP, 12, `caution ${RAIN_CAUTION} · stop ${RAIN_STOP} mm/h. Thunder is always a no.`)}<div class="note">${f.storm.rain.toFixed(1)} mm in the row · ${f.storm.pop}% chance${f.storm.v ? " · lightning risk" : ""}</div></div>
      <div class="factor"><div class="top">Cold <span class="pill ${f.cold.cls}">${f.cold.cls}</span></div><div class="val">${Math.round(f.cold.v)}<small>°C feels</small></div>${gauge(15 - f.cold.v, 15 - L.feelsC, 18, 25, `caution at ${L.feelsC}°C feels or below`)}<div class="note">water about ${Math.round(f.cold.water)}°C</div></div>
      <div class="factor"><div class="top">Light <span class="pill ${f.light.cls}">${f.light.dark ? "lights" : "day"}</span></div><div class="val" style="font-size:1.15rem">${f.light.dark ? "Nav lights on" : "Daylight"}</div><div class="lamps"><i style="background:var(--stbd)"></i><i style="background:var(--port)"></i><i style="background:#fff;border:1px solid var(--line)"></i></div><div class="note">sunrise ${hm(f.light.sunrise)} · sunset ${hm(f.light.sunset)}</div></div>
    </div>`;
  }
  if (c) html += whitecapCard(c.f) + runCard(win);
  html += `<div class="card" id="waterCard"><h2>Water level</h2><p class="small muted">Loading…</p></div>`;
  html += `<p class="proto ${dataStamp().live ? "" : "c-caution"}">${esc(dataStamp().text)}</p>`;
  $("callInner").innerHTML = html; fillWater(); wireCall(c, win); wireWatch(c, win);
  $("callInner").querySelectorAll(".wchips .chip").forEach((b) => b.onclick = () => { state.plan = { start: b.dataset.s, dur: win.dur }; renderCall(); renderContext(); });
  $("pStart").onchange = (e) => { state.plan = { start: e.target.value, dur: win.dur }; renderCall(); renderContext(); };
  $("pDur").onchange = (e) => { state.plan = { start: win.start, dur: +e.target.value }; renderCall(); renderContext(); };
}
function relWind(dir) { const hd = V().heading; const a = Math.abs((((dir - hd) + 540) % 360) - 180); return a < 45 ? " · headwind on course" : a > 135 ? " · tailwind on course" : " · crosswind on course"; }

/* ================= forecast ================= */
function renderForecast() {
  const v = fcVenue(); if (!v) { $("fcInner").innerHTML = `<div class="empty">No forecast for this venue yet.</div>`; return; }
  const h = v.hourly; const now = nowLocal().slice(0, 13) + ":00"; let i0 = h.time.findIndex((t) => t >= now); if (i0 < 0) i0 = 0;
  const N = Math.min(48, h.time.length - i0); const ix = [...Array(N)].map((_, k) => i0 + k); const cw = 30, W = N * cw + 40, H = 250; const L = state.limits;
  const gmax = Math.max(L.gustS + 5, ...ix.map((i) => h.gust[i] || 0)); const Y = (x) => 120 - (x / gmax) * 100;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  ix.forEach((i, k) => { const st = sunTimes(h.time[i]); const t = localToDate(h.time[i]); const night = t < st.sunrise || t > st.sunset;
    if (night) s += `<rect x="${k * cw}" y="0" width="${cw}" height="${H - 18}" fill="var(--ink)" opacity=".05"/>`;
    if (h.time[i].endsWith("00:00")) s += `<line x1="${k * cw}" x2="${k * cw}" y1="0" y2="${H - 14}" stroke="var(--line)"/><text x="${k * cw + 3}" y="10" style="font-weight:600">${wdLbl(h.time[i])}</text>`; });
  [L.windC, L.windS].forEach((l, j) => s += `<line x1="0" x2="${W}" y1="${Y(l)}" y2="${Y(l)}" stroke="var(--${j ? "stop" : "caution"})" stroke-dasharray="3 4" opacity=".7"/><text x="3" y="${j ? Y(l) - 4 : Y(l) + 12}" style="fill:var(--${j ? "stop" : "caution"});font-weight:700;font-size:10px;font-family:var(--f-ui);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round">${j ? "stop" : "caution"} ${spd(l)} ${uLbl()}</text>`);
  const pts = (key) => ix.map((i, k) => `${k * cw + cw / 2},${Y(h[key][i] || 0)}`).join(" ");
  s += `<polygon points="${cw / 2},120 ${pts("gust")} ${(N - 1) * cw + cw / 2},120" fill="var(--caution)" opacity=".14"/><polyline points="${pts("gust")}" fill="none" stroke="var(--caution)" stroke-width="1.5"/>`;
  s += `<polyline points="${pts("wind")}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>`;
  ix.forEach((i, k) => { const x = k * cw + cw / 2;
    s += `<g transform="translate(${x},140) rotate(${(h.dir[i] + 180) % 360})"><path d="M0,-7 L5,6 L0,3 L-5,6Z" fill="var(--ink)"/></g>`;
    s += `<text x="${x}" y="160" text-anchor="middle" style="fill:var(--ink);font-weight:500">${spd(h.wind[i])}</text>`;
    s += `<text x="${x}" y="178" text-anchor="middle">${Math.round(h.t[i])}°</text>`;
    const pp = (h.pop[i] || 0) / 100 * 26; s += `<rect x="${x - 9}" y="${210 - pp}" width="18" height="${pp}" rx="3" fill="var(--info)" opacity="${0.25 + Math.min(0.7, (h.rain[i] || 0) / 2)}"/>`;
    const vis = h.vis[i] / 1000; const wt = waterTemp(); const steam = wt - h.t[i] >= 8 && h.wind[i] < 15;
    s += `<rect x="${k * cw + 1}" y="214" width="${cw - 2}" height="10" rx="2" fill="${vis < 1 ? "var(--stop)" : vis < 5 || steam ? "var(--info)" : "var(--sunk)"}" opacity="${vis < 5 || steam ? 0.75 : 1}"/>`;
    if (+h.time[i].slice(11, 13) % 3 === 0) s += `<text x="${x}" y="${H - 4}" text-anchor="middle">${h.time[i].slice(11, 13)}</text>`; });
  s += `</svg>`;
  const days = (v.daily.time || []).map((d, i) => ({ d, i })).filter((x) => x.d >= now.slice(0, 10)).slice(0, 3);
  $("fcInner").innerHTML = `<div><div class="eyebrow">${esc(V().name)} · next 48 hours</div><h1>Forecast</h1></div>
  <div class="card" style="padding:14px 16px 6px"><div class="small muted" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px"><span><b style="color:var(--accent)">━</b> wind ${uLbl()}</span><span><b style="color:var(--caution)">━</b> gusts</span><span>▲ direction</span><span><b style="color:var(--info)">▮</b> rain chance</span><span><b style="color:var(--info)">▬</b> fog / steam fog</span></div>
    <div class="ribbon">${s}</div></div>
  <div class="days">${days.map(({ d, i }) => `<div class="day"><b>${esc(wdLbl(d + "T12:00"))}</b><span class="small muted">${esc(WX[v.daily.weather_code[i]] || "")}</span><span class="big">${Math.round(v.daily.temperature_2m_max[i])}° <span class="muted" style="font-weight:600">${Math.round(v.daily.temperature_2m_min[i])}°</span></span><span class="small">gusts ${spd(v.daily.wind_gusts_10m_max[i])} ${uLbl()}</span><span class="small">${v.daily.precipitation_sum[i].toFixed(1)} mm</span></div>`).join("")}</div>
  ${(v.alerts || []).length ? `<div class="card"><h2>Active alerts</h2>${v.alerts.map((a) => `<details><summary><b style="color:var(--caution)">${esc(a.name)}</b> <span class="small muted">${esc(a.area)}</span></summary><p class="small" style="white-space:pre-line">${esc(a.text)}</p></details>`).join("")}</div>` : ""}
  <p class="proto ${dataStamp().live ? "" : "c-caution"}">${esc(dataStamp().text)} · Open-Meteo, Environment Canada</p>`;
}

/* ================= light ================= */
function renderLight() {
  const win = defaultWindow(); const d = win.start.slice(0, 10); const v = V(); const t = sunTimes(d);
  const day0 = localToDate(d + "T00:00").getTime(); const ang = (x) => ((x - day0) / 864e5) * Math.PI * 2 - Math.PI / 2; // midnight at top
  const R = 100, cx = 130, cy = 130;
  const arc = (a0, a1, r, w, col, op = 1) => { if (isNaN(a0) || isNaN(a1)) return ""; const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1); const large = a1 - a0 > Math.PI ? 1 : 0; return `<path d="M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}" stroke="${col}" stroke-width="${w}" fill="none" opacity="${op}"/>`; };
  let s = `<svg class="dial" viewBox="-14 -6 288 272" role="img" aria-label="24-hour daylight dial">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" stroke="#14202B" stroke-width="22" fill="none"/>`;
  const seg = [[t.nightEnd, t.nauticalDawn, "#2C4660"], [t.nauticalDawn, t.dawn, "#5B7C9C"], [t.dawn, t.sunrise, "#A9B9C4"], [t.sunrise, t.sunset, "#F3D98A"], [t.sunset, t.dusk, "#A9B9C4"], [t.dusk, t.nauticalDusk, "#5B7C9C"], [t.nauticalDusk, t.night, "#2C4660"]];
  seg.forEach(([a, b, c]) => s += arc(ang(a), ang(b), R, 22, c));
  for (let hh = 0; hh < 24; hh++) { const a = ((hh / 24) * Math.PI * 2) - Math.PI / 2; const r1 = R + 14, r2 = R + (hh % 6 === 0 ? 20 : 17);
    s += `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" stroke="var(--muted)" stroke-width="${hh % 6 === 0 ? 1.5 : 0.7}"/>`;
    if (hh % 6 === 0) s += `<text x="${cx + (R + 28) * Math.cos(a)}" y="${cy + (R + 28) * Math.sin(a) + 3}" text-anchor="middle">${String(hh).padStart(2, "0")}</text>`; }
  // planned row
  const ps = localToDate(win.start).getTime(), pe = ps + win.dur * 60000; s += arc(ang(ps), ang(pe), R - 19, 7, "var(--accent)");
  const now = Date.now(); if (now > day0 && now < day0 + 864e5) { const a = ang(now); s += `<line x1="${cx}" y1="${cy}" x2="${cx + (R + 12) * Math.cos(a)}" y2="${cy + (R + 12) * Math.sin(a)}" stroke="var(--caution)" stroke-width="2.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4" fill="var(--caution)"/>`; }
  s += `<text x="${cx}" y="${cy - 8}" text-anchor="middle" style="font-family:var(--f-ui);font-size:12px;font-weight:700;fill:var(--ink)">${hm(t.sunrise)} → ${hm(t.sunset)}</text><text x="${cx}" y="${cy + 10}" text-anchor="middle">${(((t.sunset - t.sunrise) / 36e5) | 0)} h ${Math.round((((t.sunset - t.sunrise) / 36e5) % 1) * 60)} min daylight</text></svg>`;
  const mi = SunCalc.getMoonIllumination(localToDate(d + "T12:00")); const mt = SunCalc.getMoonTimes(localToDate(d + "T00:00"), v.center[1], v.center[0]);
  const rows = [["Astronomical dawn", t.nightEnd], ["Nautical dawn", t.nauticalDawn], ["Civil dawn", t.dawn], ["Sunrise", t.sunrise], ["Sunset", t.sunset], ["Civil dusk", t.dusk], ["Nautical dusk", t.nauticalDusk], ["Astronomical dusk", t.night]];
  $("lightInner").innerHTML = `<div><div class="eyebrow">${esc(dayLbl(d))} · ${esc(v.name)}</div><h1>Light</h1></div>
   <div class="card">${s}<div class="small muted" style="text-align:center;margin-top:4px">Teal arc: your planned row (${win.start.slice(11)}, ${win.dur} min).</div>
     <div class="lkey"><span><i style="background:#F3D98A"></i>Daylight</span><span><i style="background:#A9B9C4"></i>Civil twilight</span><span><i style="background:#5B7C9C"></i>Nautical</span><span><i style="background:#2C4660"></i>Astronomical</span><span><i style="background:#14202B"></i>Night</span></div></div>
   <div class="card" style="display:flex;gap:12px;align-items:center"><div class="lamps"><i style="background:var(--stbd)"></i><i style="background:var(--port)"></i><i style="background:#fff;border:1px solid var(--line)"></i></div>
     <div><b>Lights on before ${hm(t.sunrise)} and after ${hm(t.sunset)}</b><div class="small muted">and whenever visibility is restricted. Usable light from civil dawn ${hm(t.dawn)} to civil dusk ${hm(t.dusk)}.</div></div></div>
   <div class="card"><div class="ltimes">${rows.map(([k, x]) => `<div><span class="muted">${k}</span><b>${hm(x)}</b></div>`).join("")}<div><span class="muted">Moon ${Math.round(mi.fraction * 100)}% lit</span><b>${mt.rise ? "↑" + hm(mt.rise) : ""} ${mt.set ? "↓" + hm(mt.set) : ""}</b></div></div></div>`;
}
