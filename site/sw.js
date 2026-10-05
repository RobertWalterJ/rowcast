/* RowCast service worker. VERSION and PRECACHE are filled in by scripts/build_site.py. */
self.window = self; // suncalc.js expects a browser global
importScripts("callcore.js", "suncalc.js"); // the same go / caution / stay ashore rules the page uses
const VERSION = "6a41f1d32d";
const PRECACHE = ["./", "apple-touch-icon.png", "callcore.js", "fc.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "index.html", "map_argo.json", "map_trent.json", "maplibre-gl.js", "relief.json", "relief_argo.png", "relief_trent.png", "shell_1x.png", "shell_2x.png", "shell_4x.png", "shell_8p.png", "suncalc.js", "wx.json"];
const FONTS = "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap";
const SHELL = "rowcast-shell-" + VERSION, RUNTIME = "rowcast-runtime";
const LIVE = /^(api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.weather\.gc\.ca|geo\.weather\.gc\.ca|www\.ndbc\.noaa\.gov|api-iwls\.dfo-mpo\.gc\.ca)$/;

self.addEventListener("install", (e) => {
  // Fonts are best effort: a failed stylesheet fetch must not block the install.
  e.waitUntil(Promise.all([caches.open(SHELL).then((c) => c.addAll(PRECACHE)),
    caches.open(RUNTIME).then((c) => c.add(new Request(FONTS, { mode: "no-cors" })).catch(() => {}))]).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("rowcast-shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (cache, req, res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; };

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App shell and data: cache first, so the app opens on the water with no signal.
    // Navigations fall back to the cached index.html.
    // Only our own cache is read (never global caches.match, other apps share this origin).
    // The manifest is never served from cache, so install identity updates reach the phone.
    if (url.pathname.endsWith("/manifest.webmanifest")) return e.respondWith(fetch(req, { cache: "no-cache" }));
    e.respondWith(caches.open(SHELL).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => req.mode === "navigate" ? c.match("index.html") : Response.error()))));
  } else if (url.hostname === "geo.weather.gc.ca" && /request=GetMap/i.test(url.search)) {
    return; // radar tiles: straight to the network, never stored (every frame is a new URL)
  } else if (url.hostname === "egisp.dfo-mpo.gc.ca") {
    // Official chart tiles do not change often: keep the ones you have viewed so the chart works on the water without signal.
    e.respondWith(caches.open("rowcast-chart").then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { c.put(req, r.clone()); c.keys().then((ks) => { if (ks.length > 900) ks.slice(0, ks.length - 900).forEach((k) => c.delete(k)); }); } return r; }))));
  } else if (LIVE.test(url.hostname)) {
    // Live weather: network first, last good answer when offline.
    e.respondWith(caches.open(RUNTIME).then((c) => fetch(req).then((r) => put(c, req, r)).catch(() => c.match(req).then((h) => h || Response.error()))));
  } else {
    // Fonts: serve the cached copy, refresh it in the background.
    e.respondWith(caches.open(RUNTIME).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((r) => put(c, req, r)).catch(() => hit);
      return hit || net;
    })));
  }
});

/* ---------- background check of watched rows (Periodic Background Sync, when Chrome allows it) ---------- */
self.addEventListener("periodicsync", (e) => { if (e.tag === "rowcast-watch") e.waitUntil(swCheckWatches()); });
async function swCheckWatches() {
  const db = await idbOpen(); const watches = (await idbGet(db, "watches")) || []; const set = await idbGet(db, "settings");
  if (!watches.length || !set) return;
  const now = torLocal(new Date()); const alerts = (await idbGet(db, "alerts")) || [];
  const byVenue = {}; watches.filter((w) => addMin(w.start, w.dur) > now).forEach((w) => (byVenue[w.venue] = byVenue[w.venue] || []).push(w));
  for (const vid of Object.keys(byVenue)) {
    const ven = set.venues[vid]; if (!ven) continue;
    let lightning = null; try { lightning = await lightningScan(ven.lat, ven.lon, 100); } catch (err) { /* no lightning data: the forecast rules still run */ }
    let pt, marine = null; try { pt = await fetchPoint(ven); if (ven.marine) marine = await fetchMarine(ven.marine[0], ven.marine[1]); } catch (err) { continue; }
    for (const w of byVenue[vid]) {
      const c = callCore({ hourly: pt.hourly, waves: marine, win: { start: w.start, dur: w.dur }, limits: set.limits, waterTemp: ven.water, lightning,
        sun: (d) => SunCalc.getTimes(localToDate(d.slice(0, 10) + "T12:00"), ven.center[1], ven.center[0]) });
      if (!c) continue; const sum = watchSummary(c);
      if (!w.base) { w.base = sum; continue; }
      const msgs = diffCall(w.base, sum);
      if (msgs.length) {
        const a = { id: w.id, title: `${w.label}: ${sum.word}`, msgs, cls: sum.cls, at: Date.now(), start: w.start, venue: w.venue };
        alerts.push(a); w.base = sum;
        try { await self.registration.showNotification(a.title, { body: msgs.join(" "), tag: w.id, renotify: true, icon: "icon-192.png", badge: "icon-192.png", data: { url: `./?s=call&v=${w.venue}&t=${encodeURIComponent(w.start)}&d=${w.dur}` } }); } catch (err) { /* permission off: the banner still shows next time the app opens */ }
      }
    }
  }
  await idbSet(db, "watches", watches); await idbSet(db, "alerts", alerts.slice(-10));
}
self.addEventListener("notificationclick", (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ("focus" in c) { if ("navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
