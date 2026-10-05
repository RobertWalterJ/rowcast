/* ================= Strava: read your own rows straight from your account =================
   Strava gives every athlete a free personal API app. You create it once (steps in the sheet), paste its Client ID and
   Secret here, and RowCast reads your activities. The keys and tokens stay on this phone. Garmin rows come through
   Strava once Garmin Connect is set to upload to Strava, so one link covers both. */
state.strava = store.get("strava", null);   // { cid, secret, access, refresh, exp, name }
const STRAVA = "https://www.strava.com";
const stravaRedirect = () => location.origin + location.pathname;
const stravaOn = () => !!(state.strava && state.strava.refresh);
const STRAVA_SPORTS = ["Rowing", "Canoeing", "Kayaking", "StandUpPaddling", "VirtualRow"];

function stravaAuthUrl() {
  return `${STRAVA}/oauth/authorize?` + new URLSearchParams({ client_id: state.strava.cid, redirect_uri: stravaRedirect(), response_type: "code", approval_prompt: "auto", scope: "read,activity:read_all", state: "rowcast" });
}
async function stravaToken(body) {
  const r = await fetch(`${STRAVA}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ client_id: state.strava.cid, client_secret: state.strava.secret }, body)) });
  if (!r.ok) throw new Error(`Strava said no (${r.status}). Check the Client ID and Client Secret.`);
  const t = await r.json();
  Object.assign(state.strava, { access: t.access_token, refresh: t.refresh_token, exp: t.expires_at, name: t.athlete ? t.athlete.firstname || state.strava.name : state.strava.name });
  store.set("strava", state.strava); return t;
}
async function stravaGet(path) {
  if (!state.strava.access || Date.now() / 1000 > (state.strava.exp || 0) - 120) await stravaToken({ grant_type: "refresh_token", refresh_token: state.strava.refresh });
  const r = await fetch(`${STRAVA}/api/v3${path}`, { headers: { Authorization: "Bearer " + state.strava.access } });
  if (r.status === 401) throw new Error("Strava needs to be connected again.");
  if (r.status === 429) throw new Error("Strava asked us to slow down. Try again in 15 minutes.");
  if (!r.ok) throw new Error(`Strava error ${r.status}.`);
  return r.json();
}

/* ---------- coming back from Strava ---------- */
booted.then(async () => {
  const q = new URLSearchParams(location.search); const code = q.get("code");
  if (!code || q.get("state") !== "rowcast" || !state.strava) return;
  history.replaceState({ rc: "root" }, "", location.pathname);
  if (q.get("error")) { toast("Strava was not connected."); return; }
  if (!(q.get("scope") || "").includes("activity")) { toast("Strava needs permission to read your activities. Connect again and keep that box ticked."); return; }
  try { await stravaToken({ code, grant_type: "authorization_code" }); toast("Strava connected"); openStrava(); } catch (e) { toast(e.message); }
});

/* ---------- the sheet ---------- */
function openStrava() {
  if (!stravaOn()) return openStravaSetup();
  openSheet("Strava", `<p class="small muted">Connected${state.strava.name ? " as " + esc(state.strava.name) : ""}. Looking for rowing activities…</p><div id="svList"></div>`, async (b) => {
    const box = b.querySelector("#svList");
    try {
      const acts = (await stravaGet("/athlete/activities?per_page=60")).filter((a) => STRAVA_SPORTS.includes(a.sport_type || a.type));
      const have = new Set(state.log.map((e) => e.stravaId).filter(Boolean)); const fresh = acts.filter((a) => !have.has(a.id));
      box.innerHTML = acts.length ? `<p class="small">${fresh.length ? `<b>${fresh.length} new</b> of your last ${acts.length} rowing activities.` : "Everything recent is already in your log."}</p>
        <div class="loglist">${acts.map((a) => { const isNew = !have.has(a.id); const when = torLocal(new Date(a.start_date));
          return `<label class="logcard" style="cursor:pointer"><span class="lgtxt"><b>${esc(dayLbl(when))} · ${when.slice(11)} · ${esc(a.name || "Row")}</b><span class="small muted">${(a.distance / 1000).toFixed(1)} km · ${fmtDur(a.moving_time)}${a.average_heartrate ? ` · heart rate ${Math.round(a.average_heartrate)}` : ""}${isNew ? "" : " · in your log"}</span></span><input type="checkbox" data-sv="${a.id}" ${isNew ? "checked" : "disabled"} style="width:22px;height:22px"></label>`; }).join("")}</div>
        <div class="sharerow" style="margin-top:12px"><button class="btn primary" id="svImport">Import selected</button><button class="btn" id="svOff">Disconnect</button></div>`
        : `<p class="muted">No rowing activities found in your last 60. In Strava, rows must have the sport type Rowing.</p><div class="sharerow"><button class="btn" id="svOff">Disconnect</button></div>`;
      const imp = box.querySelector("#svImport"); if (imp) imp.onclick = async () => {
        const ids = [...box.querySelectorAll("[data-sv]:checked")].map((x) => +x.dataset.sv); if (!ids.length) return; imp.disabled = true; imp.textContent = "Importing…";
        let n = 0; for (const id of ids) { try { await importStravaActivity(acts.find((a) => a.id === id)); n++; } catch (e) { toast(e.message); break; } }
        saveLog(); toast(`${n} row${n === 1 ? "" : "s"} added`); openLog();
      };
      const off = box.querySelector("#svOff"); if (off) off.onclick = () => { if (confirm("Disconnect Strava from RowCast? Your logged rows stay.")) { state.strava = Object.assign({ cid: state.strava.cid, secret: state.strava.secret }); store.set("strava", state.strava); toast("Disconnected"); openStravaSetup(); } };
    } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p><div class="sharerow"><button class="btn" id="svRe">Connect again</button></div>`; const re = box.querySelector("#svRe"); if (re) re.onclick = () => { state.strava.refresh = null; store.set("strava", state.strava); openStravaSetup(); }; }
  });
}
function openStravaSetup() {
  const s = state.strava || {};
  openSheet("Connect Strava", `<ol class="steps">
    <li>On a computer or in Chrome, open <b>strava.com/settings/api</b> and log in.</li>
    <li>Tap <b>Create and manage your app</b>. Name it RowCast. For Website use <b>${esc(location.origin + location.pathname)}</b></li>
    <li>For <b>Authorization Callback Domain</b> type exactly: <b>${esc(location.hostname)}</b></li>
    <li>Save. Strava shows a <b>Client ID</b> and a <b>Client Secret</b>. Paste them below.</li></ol>
    <label class="field">Client ID<input id="svId" inputmode="numeric" value="${esc(s.cid || "")}"></label>
    <label class="field">Client Secret<input id="svSecret" type="password" autocomplete="off" value="${esc(s.secret || "")}"></label>
    <div class="sharerow" style="margin-top:12px"><button class="btn primary" id="svGo">Connect to Strava</button></div>
    <p class="small muted" style="margin-top:10px">The ID and Secret stay on this phone and are only sent to Strava. They are your own keys: anyone who gets them could read your Strava, so do not share screenshots of this page.</p>
    <p class="small muted"><b>Garmin:</b> in Garmin Connect, open Settings and find Connected apps (or Connections), and link Strava. Your Garmin rows then upload to Strava and show up here too.</p>`, (b) => {
    b.querySelector("#svGo").onclick = () => { const cid = b.querySelector("#svId").value.trim(), secret = b.querySelector("#svSecret").value.trim(); if (!/^\d+$/.test(cid) || secret.length < 20) { toast("Paste the Client ID (numbers) and the Client Secret."); return; }
      state.strava = { cid, secret }; store.set("strava", state.strava); location.href = stravaAuthUrl(); };
  });
}

/* ---------- one activity into the log ---------- */
async function importStravaActivity(a) {
  let track = null;
  try { const st = await stravaGet(`/activities/${a.id}/streams?keys=latlng,time&key_by_type=true`); const ll = st.latlng && st.latlng.data;
    if (ll && ll.length > 4) track = simplify(ll.map((p) => ({ lat: p[0], lon: p[1] })), 6); } catch (e) { if (/slow down/.test(e.message)) throw e; }
  const start = torLocal(new Date(a.start_date)); const ll0 = (a.start_latlng && a.start_latlng.length === 2) ? a.start_latlng : null;
  const venue = ll0 ? nearestVenue(ll0[0], ll0[1]) : state.venue; const speed = a.average_speed || (a.moving_time ? a.distance / a.moving_time : 0);
  const entry = { id: "r" + Date.now() + a.id, stravaId: a.id, venue, start, dur: Math.max(10, Math.round(a.elapsed_time / 60)), source: "strava", boat: "",
    act: { distM: Math.round(a.distance), durS: a.elapsed_time, movingS: a.moving_time, splitS: speed ? Math.round(500 / speed) : null, avgSpeed: +(speed || 0).toFixed(2), maxSpeed: +(a.max_speed || 0).toFixed(2),
      avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null, maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : null, avgCad: a.average_cadence ? Math.round(a.average_cadence) : null, track },
    felt: "as expected", wcSeen: "none", wavesFelt: "small", rain: "none", storm: "none", cutShort: false, notes: (a.name || "").slice(0, 120), cond: null };
  try { entry.cond = await conditionsFor(entry.venue, entry.start, entry.dur); } catch (e) { /* looked up when the row is opened */ }
  state.log.push(entry);
}
