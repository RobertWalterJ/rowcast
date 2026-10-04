/* RowCast service worker. VERSION and PRECACHE are filled in by scripts/build_site.py. */
const VERSION = "de91ba58e7";
const PRECACHE = ["./", "apple-touch-icon.png", "fc.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "index.html", "map_argo.json", "map_trent.json", "maplibre-gl.js", "relief.json", "relief_argo.png", "relief_trent.png", "shell_1x.png", "shell_2x.png", "shell_4x.png", "shell_8p.png", "suncalc.js", "wx.json"];
const FONTS = "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap";
const SHELL = "rowcast-shell-" + VERSION, RUNTIME = "rowcast-runtime";
const LIVE = /^(api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.weather\.gc\.ca|geo\.weather\.gc\.ca|www\.ndbc\.noaa\.gov)$/;

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
