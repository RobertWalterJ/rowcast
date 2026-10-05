/* ================= watch a row: an alert when the call changes ================= */
// You watch a launch window (button on Row call). Races with a start time are watched automatically.
// While the app is open the check runs every time the forecast refreshes. When it is closed, the service worker
// runs the same rules (callcore.js) if Chrome allows periodic background checks. Chrome decides how often.
// Nothing leaves the phone except the same public forecast requests the app already makes.
state.watches = store.get("watches", []);       // explicit: { id, venue, start, dur, label }
state.watchBase = store.get("watchBase", {});   // last summary per watch id: what the alert compares against
state.alerts = store.get("alerts", []);         // recent alerts: { id, title, msgs, cls, at, start, venue }
state.bg = "";

const winId = (venue, start, dur) => `${venue}|${start}|${dur}`;
const isWatched = (win) => state.watches.some((w) => w.id === winId(state.venue, win.start, win.dur));
function raceTargets() {
  return state.races.filter((r) => !r.example).map((r) => { const ev = state.events.find((e) => e.id === r.event); if (!ev) return null;
    const start = addMin(r.start, -(r.marshal + r.launch)), dur = r.marshal + r.launch + 60;
    return { id: winId(ev.venue, start, dur), venue: ev.venue, start, dur, label: `${r.title || "Race"} (${dayLbl(r.start)} ${r.start.slice(11)})` }; }).filter(Boolean);
}
function watchTargets() {
  const now = nowLocal(), horizon = addMin(now, 5 * 24 * 60); const seen = new Set();
  return state.watches.concat(raceTargets()).filter((t) => addMin(t.start, t.dur) > now && t.start < horizon && !seen.has(t.id) && seen.add(t.id));
}
function waterTempFor(vid) { const v = VENUES[vid]; if (v.water != null) return v.water; const fv = state.fc.venues[v.fc]; const o = fv && fv.buoy && fv.buoy.obs && fv.buoy.obs.find((x) => x.wtmp != null); return o ? o.wtmp : 15; }
function computeFor(t) {
  const v = VENUES[t.venue], fv = state.fc && state.fc.venues && state.fc.venues[v.fc]; if (!fv || !fv.hourly) return null;
  return callCore({ hourly: fv.hourly, waves: fv.waves, win: { start: t.start, dur: t.dur }, limits: state.limits, waterTemp: waterTempFor(t.venue), fetchM: v.fetchM, lightning: state.lightning && state.lightning[t.venue],
    sun: (d) => SunCalc.getTimes(localToDate(d.slice(0, 10) + "T12:00"), v.center[1], v.center[0]) });
}

/* ---------- the check ---------- */
async function checkWatches() {
  if (!state.fc) return;
  const targets = watchTargets(); const found = [];
  for (const t of targets) {
    if (t.venue !== state.venue) continue; // only the venue whose forecast is live right now
    const c = computeFor(t); if (!c) continue; const sum = watchSummary(c); const base = state.watchBase[t.id];
    if (!base) { state.watchBase[t.id] = sum; continue; }
    const msgs = diffCall(base, sum);
    if (msgs.length) { found.push({ id: t.id, title: `${t.label}: ${sum.word}`, msgs, cls: sum.cls, at: Date.now(), start: t.start, venue: t.venue }); state.watchBase[t.id] = sum; }
  }
  Object.keys(state.watchBase).forEach((k) => { if (!targets.some((t) => t.id === k)) delete state.watchBase[k]; });
  state.watches = state.watches.filter((w) => targets.some((t) => t.id === w.id));
  store.set("watchBase", state.watchBase); store.set("watches", state.watches);
  if (found.length) { state.alerts = state.alerts.concat(found).slice(-10); store.set("alerts", state.alerts); found.forEach(notifyAlert); }
  renderAlertBar(); syncWatches();
}
async function notifyAlert(a) {
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(a.title, { body: a.msgs.join(" "), tag: a.id, renotify: true, icon: "icon-192.png", badge: "icon-192.png", data: { url: alertUrl(a) } }); } catch (e) { /* the banner still shows */ }
  }
}
const alertUrl = (a) => `${location.pathname}?s=call&v=${a.venue}&t=${encodeURIComponent(a.start)}&d=${(a.id.split("|")[2]) || 90}`;

/* ---------- the banner ---------- */
function renderAlertBar() {
  const bar = $("alertBar"); if (!bar) return; const list = state.alerts.slice(-2).reverse();
  bar.hidden = !list.length;
  bar.innerHTML = list.map((a) => `<div class="alertitem ${a.cls}"><div><b>${esc(a.title)}</b><div class="small">${a.msgs.map(esc).join(" ")}</div></div><button class="btn" data-open="${esc(alertUrl(a))}">View</button><button class="x" data-dismiss="${a.at}" aria-label="Dismiss">×</button></div>`).join("");
  bar.querySelectorAll("[data-dismiss]").forEach((b) => b.onclick = () => { state.alerts = state.alerts.filter((a) => String(a.at) !== b.dataset.dismiss); store.set("alerts", state.alerts); renderAlertBar(); });
  bar.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => { const u = new URL(b.dataset.open, location.origin); const q = u.searchParams;
    state.plan = { start: q.get("t"), dur: +q.get("d") || 90 }; const go2 = () => go("call"); if (q.get("v") && q.get("v") !== state.venue) selectVenue(q.get("v")).then(go2); else go2(); });
}

/* ---------- the button on Row call ---------- */
function watchRow(win) {
  const on = isWatched(win);
  return `<div class="watchrow"><button class="btn ${on ? "" : "primary"}" id="btnWatch">${on ? "Watching this row. Tap to stop" : "Watch this row"}</button><button class="btn" id="btnLogRow" style="margin-top:6px">Log how this row went</button>
    <div class="small muted">${on ? "You get an alert if the call changes, thunder appears or things improve." : "Get an alert if the call changes before launch."} Races with a start time are watched automatically. ${esc(state.bg)}</div></div>`;
}
function wireWatch(c, win) {
  const lr = $("btnLogRow"); if (lr) lr.onclick = () => openLogEntry({ venue: state.venue, start: win.start, dur: win.dur });
  const b = $("btnWatch"); if (!b) return;
  b.onclick = async () => {
    const id = winId(state.venue, win.start, win.dur);
    if (isWatched(win)) { state.watches = state.watches.filter((w) => w.id !== id); delete state.watchBase[id]; toast("Stopped watching"); }
    else {
      let perm = "unsupported"; if ("Notification" in window) { perm = Notification.permission; if (perm === "default") { try { perm = await Notification.requestPermission(); } catch (e) { /* ignore */ } } }
      const ev = activeEvent(); state.watches.push({ id, venue: state.venue, start: win.start, dur: win.dur, label: `${ev ? ev.name : V().name} ${dayLbl(win.start)} ${win.start.slice(11)}` });
      if (c) state.watchBase[id] = watchSummary(c);
      toast(perm === "granted" ? "Watching. You will get alerts." : "Watching. Alerts show here only, because notifications are off.");
      enableBackground();
    }
    store.set("watches", state.watches); store.set("watchBase", state.watchBase); syncWatches(); renderCall(); renderAlertBar();
  };
}

/* ---------- hand the watch list to the service worker ---------- */
async function syncWatches() {
  if (!state.fc || !("indexedDB" in window)) return;
  try {
    const db = await idbOpen(); const targets = watchTargets().map((t) => Object.assign({}, t, { base: state.watchBase[t.id] || null }));
    const venues = {}; Object.keys(VENUES).forEach((id) => { const v = VENUES[id], fv = state.fc.venues[v.fc]; venues[id] = { lat: fv.lat, lon: fv.lon, center: v.center, marine: id === "argo" ? [43.62, -79.42] : null, water: waterTempFor(id), fetchM: v.fetchM }; });
    await idbSet(db, "watches", targets); await idbSet(db, "settings", { limits: state.limits, venues });
  } catch (e) { console.warn("sync watches", e); }
}
// The worker may have raised alerts or moved baselines while the app was closed.
async function pullFromWorker() {
  if (!("indexedDB" in window)) return;
  try {
    const db = await idbOpen(); const ws = (await idbGet(db, "watches")) || []; const al = (await idbGet(db, "alerts")) || [];
    ws.forEach((w) => { if (w.base && (!state.watchBase[w.id] || w.base.at > state.watchBase[w.id].at)) state.watchBase[w.id] = w.base; });
    if (al.length) { al.forEach((a) => { if (!state.alerts.some((x) => x.at === a.at && x.id === a.id)) state.alerts.push(a); }); state.alerts = state.alerts.slice(-10); await idbSet(db, "alerts", []); }
    store.set("watchBase", state.watchBase); store.set("alerts", state.alerts); renderAlertBar();
  } catch (e) { console.warn("pull from worker", e); }
}
async function enableBackground() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!("periodicSync" in reg)) { state.bg = "Background checks are not available here, so alerts come when you open the app."; return; }
    const st = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (st.state !== "granted") { state.bg = "Chrome has not allowed background checks for this app yet. Alerts come when you open it."; return; }
    await reg.periodicSync.register("rowcast-watch", { minInterval: 3 * 3600 * 1000 }); state.bg = "Background checks are on. Chrome decides how often (about every few hours).";
  } catch (e) { state.bg = "Background checks could not be turned on. Alerts come when you open the app."; }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) pullFromWorker().then(checkWatches); });
booted.then(async () => { await pullFromWorker(); renderAlertBar(); enableBackground(); });
