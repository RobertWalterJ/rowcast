/* ================= extras: calendar export, saved launch times, measured buoy waves ================= */

/* ---------- add a row or a race to the phone calendar (.ics) ---------- */
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
function downloadIcs(title, startLocal, durMin, desc, where) {
  const s = localToDate(startLocal), e = new Date(s.getTime() + durMin * 60000);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RowCast//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rowcast`, `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(s)}`, `DTEND:${icsStamp(e)}`, `SUMMARY:${icsEsc(title)}`, `LOCATION:${icsEsc(where)}`, `DESCRIPTION:${icsEsc(desc)}`,
    "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", "DESCRIPTION:Check the conditions", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "row.ics"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Calendar file ready. Open it to add the event.");
}
function addRowToCalendar(c, win) {
  const ev = activeEvent(); const f = c.f;
  downloadIcs(`Row: ${ev ? ev.name : V().name}`, win.start, win.dur,
    `Forecast when added: wind ${spd(f.wind.v)} ${uLbl()}, gusts ${spd(f.wind.g)} from ${compass(f.wind.dir)}; waves ${f.waves.v.toFixed(1)} m; whitecaps ${f.wcap.short}; rain ${rainWord(f.storm.rainMax)}.\nCheck RowCast before you launch: ${shareUrl(win)}`, V().name + ", " + V().place);
}

/* ---------- saved launch times (for example Tuesday 06:30) ---------- */
state.presets = store.get("presets", []);   // { id, dow 0-6, time "HH:MM", dur }
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowOf = (d) => DOW.indexOf(wdLbl(d + "T12:00"));
function nextOccurrence(p) {
  const now = nowLocal();
  for (let k = 0; k < 8; k++) { const d = torLocal(new Date(Date.now() + k * 864e5)).slice(0, 10); const t = `${d}T${p.time}`; if (dowOf(d) === p.dow && t > now) return t; }
  return null;
}
const presetLabel = (p) => `${DOW[p.dow]} ${p.time}`;
function presetChips() {
  const chips = state.presets.map((p) => `<span class="chip pchip" data-p="${p.id}"><button class="pgo" data-pgo="${p.id}">★ ${presetLabel(p)}</button><button class="px" data-pdel="${p.id}" aria-label="Remove saved time ${presetLabel(p)}">×</button></span>`).join("");
  return chips;
}
function savePresetRow(win) {
  const dow = dowOf(win.start.slice(0, 10)), time = win.start.slice(11);
  const has = state.presets.some((p) => p.dow === dow && p.time === time && p.dur === win.dur);
  return has ? "" : `<button class="btn small" id="btnSavePreset">★ Save ${DOW[dow]} ${time} as a regular launch time</button>`;
}
function wirePresets(win) {
  const root = $("callInner");
  root.querySelectorAll("[data-pgo]").forEach((b) => b.onclick = () => { const p = state.presets.find((x) => x.id === b.dataset.pgo); const t = nextOccurrence(p); if (t) { state.plan = { start: t, dur: p.dur }; renderCall(); renderContext(); } });
  root.querySelectorAll("[data-pdel]").forEach((b) => b.onclick = () => { state.presets = state.presets.filter((x) => x.id !== b.dataset.pdel); store.set("presets", state.presets); renderCall(); });
  const sp = $("btnSavePreset"); if (sp) sp.onclick = () => { const dow = dowOf(win.start.slice(0, 10)); state.presets.push({ id: "p" + Date.now(), dow, time: win.start.slice(11), dur: win.dur }); store.set("presets", state.presets); toast("Saved. It shows as a button above."); renderCall(); };
  const cal = $("btnCal"); if (cal) cal.onclick = () => { const c = computeCall(win); if (c) addRowToCalendar(c, win); };
}

/* ---------- measured buoy (Toronto side of the lake) ---------- */
// NDBC does not allow browser reads, so the deploy job saves buoy.json next to the app every 30 minutes (see .github/workflows/pages.yml).
state.buoy = null;
async function loadBuoy() {
  try { const r = await fetch("buoy.json", { cache: "no-store" }); if (!r.ok) throw new Error(r.status); state.buoy = await r.json(); } catch (e) { state.buoy = null; }
  if (state.screen === "call") renderCall();
}
function buoyObs() { const b = state.buoy; if (!b || !b.obs || !b.obs.length) return null; const o = b.obs.find((x) => x.wvht != null || x.wspd != null); return o ? { b, o } : null; }
function buoyCardHtml() {
  if (state.venue !== "argo") return "";
  const got = buoyObs();
  if (!got) return `<div class="card" id="buoyCard"><div class="top" style="font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Measured on the lake</div><p class="small muted" style="margin-top:6px">No recent reading from the lake buoy. It is usually taken out of the water from late fall to spring, and the reading needs the live site to refresh.</p></div>`;
  const { b, o } = got; const when = new Date(o.t); const age = Math.round((Date.now() - when) / 60000); const old = age > 180;
  const fv = fcVenue(); let model = null; if (fv && fv.waves) { const k = fv.waves.time.indexOf(torLocal(when).slice(0, 13) + ":00"); if (k >= 0) model = fv.waves.hs[k]; }
  const hm2 = when.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return `<div class="card" id="buoyCard"><div class="top" style="font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Measured on the lake</div>
    <div class="buoygrid">${o.wvht != null ? `<div><span class="k">Waves</span><b>${o.wvht.toFixed(1)}<small> m</small></b>${o.dpd ? `<span class="small muted">${o.dpd} s apart</span>` : ""}</div>` : ""}
      ${o.wspd != null ? `<div><span class="k">Wind</span><b>${spd(o.wspd * 3.6)}<small> ${uLbl()}</small></b><span class="small muted">${o.gst != null ? `gusts ${spd(o.gst * 3.6)}` : ""}${o.wdir != null ? ` from ${compass(o.wdir)}` : ""}</span></div>` : ""}
      ${o.wtmp != null ? `<div><span class="k">Water</span><b>${Math.round(o.wtmp)}<small> °C</small></b></div>` : ""}</div>
    <p class="small muted">${esc(b.name)} at ${hm2}${old ? `, ${Math.round(age / 60)} h old` : ""}.${model != null && o.wvht != null ? ` The forecast model said ${model.toFixed(1)} m for that hour.` : ""} It sits out in the lake, not at your club, so waves inside the breakwall are usually smaller.</p></div>`;
}
booted.then(() => loadBuoy());
setInterval(() => { if (!document.hidden) loadBuoy(); }, 30 * 60000);
