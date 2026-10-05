/* ================= weather overlay: wind particles, visibility veil, wave field ================= */
const overlay = {
  dirty: true, parts: [], raf: 0, cw: 0, ch: 0, dpr: 1,
  init() {
    this.wx = $("wxCanvas"); this.pt = $("ptCanvas"); this.resize();
    window.addEventListener("resize", () => this.resize());
    this.seed(); this.seedSea(); const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); }; loop();
  },
  resize() {
    const r = $("map").getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    [this.wx, this.pt].forEach((c) => { c.width = r.width * this.dpr; c.height = r.height * this.dpr; c.style.width = r.width + "px"; c.style.height = r.height + "px"; });
    this.cw = r.width; this.ch = r.height; this.dirty = true; this.resetTrails();
  },
  grid() { return state.wx[state.venue].wind; },
  hourIdx() { return Math.min(state.hour, this.grid().time.length - 1); },
  timeLabel() { const t = this.grid().time[this.hourIdx()]; return `${wdLbl(t)} ${t.slice(11)}`; },
  // bilinear sample of the forecast grid at lon/lat for the current hour
  sample(lon, lat, lite) {
    const W = this.grid(); const [w, s, e, n] = W.bbox; const h = this.hourIdx();
    const fx = ((lon - w) / (e - w)) * (W.nx - 1), fy = ((n - lat) / (n - s)) * (W.ny - 1);
    if (fx < -0.5 || fy < -0.5 || fx > W.nx - 0.5 || fy > W.ny - 0.5) return null;
    const x0 = Math.max(0, Math.min(W.nx - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(W.ny - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const bl = (arr) => { const a = arr[h]; const k = (j, i) => a[j * W.nx + i];
      return (k(y0, x0) * (1 - tx) + k(y0, x0 + 1) * tx) * (1 - ty) + (k(y0 + 1, x0) * (1 - tx) + k(y0 + 1, x0 + 1) * tx) * ty; };
    const u = bl(W.u), v = bl(W.v);
    if (lite) return { u, v, s: Math.hypot(u, v) };
    const t = bl(W.t), td = bl(W.td);
    const out = { u, v, s: Math.hypot(u, v), dir: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360, g: bl(W.g), vis: bl(W.vis), t, td };
    out.steam = waterTemp() - t >= 8 && out.s < 15;
    const wv = state.wx[state.venue].waves; if (wv) out.hs = this.waveAt(lon, lat);
    return out;
  },
  waveAt(lon, lat) {
    const wv = state.wx[state.venue].waves; const h = Math.min(state.hour, wv.time.length - 1); let num = 0, den = 0;
    wv.pts.forEach((p, i) => { const val = wv.hs[h][i]; if (val == null) return; const d2 = (p[0] - lon) ** 2 / 1.9 + (p[1] - lat) ** 2 + 1e-7; const wgt = 1 / d2; num += val * wgt; den += wgt; });
    return den ? num / den : null;
  },
  seed() {
    const n = Math.round(Math.min(1400, (this.cw * this.ch) / 520)); this.parts = [];
    for (let i = 0; i < n; i++) this.parts.push(this.spawn());
  },
  spawn() { return { x: Math.random() * this.cw, y: Math.random() * this.ch, age: Math.floor(Math.random() * 80), max: 60 + Math.random() * 60 }; },
  resetTrails() { if (!this.pt) return; this.pt.getContext("2d").clearRect(0, 0, this.pt.width, this.pt.height); },
  speedColor(s) {
    const L = state.limits; const dk = dim();
    if (state.night) return s >= L.windS ? "rgba(255,90,70,.95)" : s >= L.windC ? "rgba(220,110,70,.85)" : "rgba(170,80,70,.6)";
    if (s >= L.windS) return dk ? "rgba(255,110,95,.95)" : "rgba(200,40,35,.9)";
    if (s >= L.windC) return dk ? "rgba(245,175,70,.9)" : "rgba(200,120,0,.85)";
    return dk ? "rgba(170,215,235,.6)" : state.mode === "water" ? "rgba(20,60,90,.55)" : "rgba(11,90,110,.6)";
  },
  frame() {
    if (!mapReady || !map || state.screen !== "map") return;
    if (this.dirty) { this.drawStatic(); this.dirty = false; }
    const g = this.pt.getContext("2d"); const d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalCompositeOperation = "destination-in"; g.fillStyle = "rgba(0,0,0,0.93)"; g.fillRect(0, 0, this.cw, this.ch);
    g.globalCompositeOperation = "source-over";
    if (map.isMoving()) { g.clearRect(0, 0, this.cw, this.ch); return; }
    if (state.layers.waves) this.drawSea(g);
    if (!state.layers.wind) return;
    const zoom = map.getZoom(); const k = 0.06 * Math.pow(1.3, zoom - 13); // px per frame per km/h
    g.lineWidth = 1.4; g.lineCap = "round";
    const buckets = {};
    for (const p of this.parts) {
      const ll = map.unproject([p.x, p.y]); const w = this.sample(ll.lng, ll.lat, true);
      if (!w || p.age++ > p.max) { Object.assign(p, this.spawn(), { age: 0 }); continue; }
      const nx = p.x + w.u * k, ny = p.y - w.v * k;
      const col = this.speedColor(w.s); (buckets[col] = buckets[col] || []).push([p.x, p.y, nx, ny]);
      p.x = nx; p.y = ny; if (p.x < 0 || p.y < 0 || p.x > this.cw || p.y > this.ch) Object.assign(p, this.spawn(), { age: 0 });
    }
    for (const col in buckets) { g.strokeStyle = col; g.beginPath(); for (const s of buckets[col]) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); } g.stroke(); }
  },
  // Wave flow: pale crest dashes travel with the wave direction (taller waves, longer crests) and white flecks
  // appear where the wind is strong enough for whitecaps. Drawn on the water only.
  waveDirAt(lon, lat) {
    const wv = state.wx[state.venue].waves; if (!wv) return null; const h = Math.min(state.hour, wv.time.length - 1); let sx = 0, sy = 0;
    wv.pts.forEach((p, i) => { const d = wv.dir[h][i]; if (d == null) return; const d2 = (p[0] - lon) ** 2 / 1.9 + (p[1] - lat) ** 2 + 1e-7, wg = 1 / d2; sx += Math.sin(d * Math.PI / 180) * wg; sy += Math.cos(d * Math.PI / 180) * wg; });
    return sx || sy ? (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360 : null;
  },
  seedSea() { const n = Math.round(Math.min(650, (this.cw * this.ch) / 800)); this.wparts = []; for (let i = 0; i < n; i++) this.wparts.push(this.spawnSea()); },
  spawnSea() { return { x: Math.random() * this.cw, y: Math.random() * this.ch, age: Math.floor(Math.random() * 40), max: 40 + Math.random() * 50, r: Math.random(), q: Math.random() }; },
  drawSea(g) {
    if (!this.wPath) return; if (!this.wparts || !this.wparts.length) this.seedSea();
    const zs = Math.pow(1.3, map.getZoom() - 13); const white = [], crest = [];
    for (const p of this.wparts) {
      const ll = map.unproject([p.x, p.y]); const w = this.sample(ll.lng, ll.lat);
      if (!w || p.age++ > p.max) { Object.assign(p, this.spawnSea(), { age: 0 }); continue; }
      const wd = this.waveDirAt(ll.lng, ll.lat); const from = wd != null ? wd : w.dir; const to = ((from + 180) % 360) * Math.PI / 180;
      const hs = w.hs != null ? w.hs : 0.0016 * (w.s / 3.6) * Math.sqrt((V().fetchM || 800) / 9.81);
      const sp = (0.3 + 1.1 * Math.min(hs, 0.8)) * zs; const dx = Math.sin(to) * sp, dy = -Math.cos(to) * sp;
      const wc = Math.max(0, Math.min(1, (Math.max(w.s, w.g * 0.7) - 17) / 14)), ch = Math.max(0, Math.min(1, (hs - 0.12) / 0.4));
      if (p.r < wc) white.push([p.x, p.y, p.x + dx * 2.4, p.y + dy * 2.4]); else if (p.q < ch) crest.push([p.x, p.y, dx, dy, hs]);
      p.x += dx; p.y += dy; if (p.x < 0 || p.y < 0 || p.x > this.cw || p.y > this.ch) Object.assign(p, this.spawnSea(), { age: 0 });
    }
    g.save(); g.clip(this.wPath, "evenodd"); g.lineCap = "round";
    if (crest.length) { g.strokeStyle = state.night ? "rgba(255,140,120,.55)" : dim() ? "rgba(200,228,242,.55)" : "rgba(20,70,105,.5)"; g.lineWidth = 1.3; g.beginPath();
      for (const [x, y, dx, dy, hs] of crest) { const m = Math.hypot(dx, dy) || 1, px = -dy / m, py = dx / m, len = (5 + hs * 26) * Math.sqrt(zs) / 2; g.moveTo(x - px * len, y - py * len); g.lineTo(x + px * len, y + py * len); } g.stroke(); }
    if (white.length) { g.strokeStyle = state.night ? "rgba(255,205,195,.95)" : "rgba(255,255,255,.97)"; g.lineWidth = 1.8; g.beginPath(); for (const s of white) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); } g.stroke(); }
    g.restore();
  },
  buildWaterPath() {
    const d = state.data[state.venue]; if (!d) return null; const p2 = new Path2D();
    const ring = (r) => { r.forEach((c, i) => { const p = map.project(c); i ? p2.lineTo(p.x, p.y) : p2.moveTo(p.x, p.y); }); p2.closePath(); };
    d.water.features.forEach((f) => { const gm = f.geometry; (gm.type === "Polygon" ? [gm.coordinates] : gm.coordinates).forEach((poly) => poly.forEach(ring)); });
    return p2;
  },
  waterPath(g) {
    const d = state.data[state.venue]; if (!d) return false; g.beginPath();
    const ring = (r) => { r.forEach((c, i) => { const p = map.project(c); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); g.closePath(); };
    d.water.features.forEach((f) => { const gm = f.geometry; (gm.type === "Polygon" ? [gm.coordinates] : gm.coordinates).forEach((poly) => poly.forEach(ring)); });
    return true;
  },
  drawStatic() {
    const g = this.wx.getContext("2d"); const d = this.dpr; g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.cw, this.ch);
    this.wPath = this.buildWaterPath();
    const W = this.grid(); const [w, s, e, n] = W.bbox; const h = this.hourIdx();
    const a = map.project([w, n]), b = map.project([e, s]);
    // waves: colour field over open water
    const wv = state.wx[state.venue].waves;
    if (wv && state.layers.waves) {
      const off = document.createElement("canvas"); off.width = 80; off.height = 50; const og = off.getContext("2d"); const im = og.createImageData(80, 50);
      const [ww, ws, we, wn] = [w, s, e, n];
      for (let y = 0; y < 50; y++) for (let x = 0; x < 80; x++) { const lon = ww + (we - ww) * x / 79, lat = wn - (wn - ws) * y / 49; const hs = this.waveAt(lon, lat) || 0;
        const c = waveRamp(hs); const i = (y * 80 + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = c[3]; }
      og.putImageData(im, 0, 0); g.save(); if (this.waterPath(g)) g.clip("evenodd"); g.imageSmoothingEnabled = true; g.drawImage(off, a.x, a.y, b.x - a.x, b.y - a.y); g.restore();
    }
    if (state.layers.vis) {
      // visibility veil: opacity follows forecast visibility (fog looks like fog)
      const off = document.createElement("canvas"); off.width = W.nx; off.height = W.ny; const og = off.getContext("2d"); const im = og.createImageData(W.nx, W.ny);
      const fogc = state.night ? [40, 18, 14] : dim() ? [120, 135, 148] : [250, 252, 253];
      let steamAny = false;
      for (let k = 0; k < W.nx * W.ny; k++) { const vis = W.vis[h][k]; const al = Math.max(0, Math.min(1, (9000 - vis) / 8000)) * 0.78;
        im.data[k * 4] = fogc[0]; im.data[k * 4 + 1] = fogc[1]; im.data[k * 4 + 2] = fogc[2]; im.data[k * 4 + 3] = al * 255;
        if (waterTemp() - W.t[h][k] >= 8 && Math.hypot(W.u[h][k], W.v[h][k]) < 15) steamAny = true; }
      og.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, a.x, a.y, b.x - a.x, b.y - a.y);
      if (steamAny) { // steam fog hugs the water surface
        g.save(); if (this.waterPath(g)) { g.clip("evenodd"); g.fillStyle = state.night ? "rgba(60,25,20,.5)" : dim() ? "rgba(140,160,175,.45)" : "rgba(255,255,255,.62)"; g.fillRect(0, 0, this.cw, this.ch); } g.restore();
      }
    }
  }
};
function waveRamp(hs) {
  // 0 m transparent, 0.3 m amber, 0.6 m+ red-violet: matches default go/no-go limits
  const L = state.limits; const t = hs / Math.max(0.01, L.waveS);
  if (hs < 0.08) return [0, 0, 0, 0];
  if (t < 0.6) return [30, 120, 175, Math.round(20 + 70 * t)];
  if (t < 1) return [235, 150, 20, 95];
  return [205, 40, 95, 120];
}
