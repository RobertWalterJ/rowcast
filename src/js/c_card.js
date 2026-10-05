/* ================= share as a picture: a conditions card for the crew chat =================
   The card shows what the forecast says and where it sits against your own limits. It never says go or stay ashore:
   the call is the crew's to make. Drawn on a canvas, 1080 x 1350 (4:5, fits a chat without cropping). */
const INK = "#F2F7F9", MUTED = "#8AA4B1", CYAN = "#6FE0F0", SAND = "#F4C27A", PANEL = "rgba(255,255,255,0.055)", EDGE = "rgba(255,255,255,0.09)";

function cardData(win) {
  const c = computeCall(win); if (!c) return null; const v = fcVenue(), h = v.hourly;
  const from = addMin(win.start, -60).slice(0, 13) + ":00", to = addMin(win.start, win.dur + 60);
  const ix = h.time.map((t, i) => i).filter((i) => h.time[i] >= from && h.time[i] < to);
  const ev = activeEvent();
  return { c, win, venue: V().name, event: ev && ev.name, limits: state.limits, series: ix.map((i) => ({ t: h.time[i], wind: h.wind[i] || 0, gust: h.gust[i] || 0 })),
    run: (runConditions(win) || []).filter((r) => !r.none).slice(0, 4), lightning: state.lightning && state.lightning[state.venue], stamp: dataStamp(), sun: c.f.light };
}

function drawCard(cv, d) {
  const W = 1080, H = 1350; cv.width = W; cv.height = H; const g = cv.getContext("2d"); const f = d.c.f; const L = d.limits;
  const T = (s, x, y, o = {}) => { g.font = `${o.weight || 500} ${o.size || 30}px Figtree, system-ui, sans-serif`; g.fillStyle = o.color || INK; g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic";
    g.letterSpacing = (o.ls || 0) + "px"; g.fillText(s, x, y); g.letterSpacing = "0px"; };
  const panel = (x, y, w, h, r = 28) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = PANEL; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 2; g.stroke(); };

  // background: deep water gradient with faint sounding rings
  const bg = g.createLinearGradient(0, 0, W * 0.4, H); bg.addColorStop(0, "#08151E"); bg.addColorStop(1, "#103447"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(111,224,240,0.07)"; g.lineWidth = 2; for (let r = 260; r < 1700; r += 70) { g.beginPath(); g.arc(W + 120, H + 160, r, 0, 7); g.stroke(); }
  g.fillStyle = CYAN; g.fillRect(0, 0, W, 10);

  // header
  const P = 72;
  T("ROW CONDITIONS", P, 100, { size: 26, weight: 700, color: CYAN, ls: 6 });
  T(d.venue, P, 178, { size: 72, weight: 800 });
  const when = `${dayLbl(d.c.start)}  ·  ${d.c.start.slice(11)} to ${d.c.end.slice(11)}`;
  T(when, P, 238, { size: 40, weight: 600, color: INK });
  if (d.event) T(d.event, W - P, 100, { size: 26, weight: 600, color: MUTED, align: "right" });

  // wind dial: where the wind comes FROM sits on the ring, the arrow points inward
  const cx = 300, cy = 498, R = 168;
  g.beginPath(); g.arc(cx, cy, R, 0, 7); g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.18)"; g.stroke();
  g.beginPath(); g.arc(cx, cy, R - 34, 0, 7); g.fillStyle = "rgba(255,255,255,0.04)"; g.fill();
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, big = i % 18 === 0, mid = i % 6 === 0, r0 = R + 8, r1 = R + (big ? 30 : mid ? 22 : 14);
    g.beginPath(); g.moveTo(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a)); g.lineTo(cx + r1 * Math.sin(a), cy - r1 * Math.cos(a)); g.strokeStyle = big ? INK : "rgba(255,255,255,0.28)"; g.lineWidth = big ? 4 : 2; g.stroke(); }
  [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([s, a]) => { const r = R + 62, rad = (a * Math.PI) / 180; T(s, cx + r * Math.sin(rad), cy - r * Math.cos(rad) + 11, { size: 30, weight: 700, color: MUTED, align: "center" }); });
  const from = (f.wind.dir * Math.PI) / 180; g.save(); g.translate(cx, cy); g.rotate(from);
  g.beginPath(); g.moveTo(0, -R + 4); g.lineTo(-30, -R - 40); g.lineTo(30, -R - 40); g.closePath(); g.fillStyle = CYAN; g.shadowColor = CYAN; g.shadowBlur = 24; g.fill(); g.restore(); g.shadowBlur = 0;
  T(String(spd(f.wind.v)), cx, cy + 34, { size: 118, weight: 800, align: "center" });
  T(uLbl(), cx, cy + 78, { size: 30, weight: 600, color: MUTED, align: "center" });
  T(`WIND FROM ${compass(f.wind.dir)}`, cx, cy - 78, { size: 24, weight: 700, color: CYAN, align: "center", ls: 3 });

  // stat stack (right of the dial)
  const sx = 600;
  const stat = (label, value, unit, sub, y, col) => { T(label, sx, y, { size: 24, weight: 700, color: MUTED, ls: 4 }); T(value, sx, y + 68, { size: 70, weight: 800, color: col || INK });
    if (unit) { g.font = "800 70px Figtree, system-ui, sans-serif"; const w = g.measureText(value).width; T(unit, sx + w + 12, y + 68, { size: 30, weight: 600, color: MUTED }); } if (sub) T(sub, sx, y + 106, { size: 26, weight: 500, color: MUTED }); };
  stat("GUSTS", String(spd(f.wind.g)), uLbl(), `strongest in the row`, 318, SAND);
  const hs = f.waves.v; stat("WAVES", hs < 0.1 ? String(Math.round(hs * 100)) : hs.toFixed(1), hs < 0.1 ? "cm" : "m", f.waveEst ? "estimated river chop" : "model, open water", 462);
  stat("WHITECAPS", f.wcap.short.charAt(0).toUpperCase() + f.wcap.short.slice(1), "", "estimated from wind and gusts", 606);

  // wind through the row
  const cxp = P, cyp = 770, cw = W - 2 * P, ch = 214; panel(cxp, cyp, cw, ch);
  T("WIND THROUGH THE ROW", cxp + 28, cyp + 44, { size: 22, weight: 700, color: MUTED, ls: 4 });
  const s = d.series; if (s.length >= 2) {
    const px0 = cxp + 70, px1 = cxp + cw - 36, py0 = cyp + 70, py1 = cyp + ch - 46; const ymax = Math.max(L.windS + 6, ...s.map((p) => p.gust)) * 1.05;
    const X = (i) => px0 + (px1 - px0) * (i / (s.length - 1)); const Y = (v) => py1 - (py1 - py0) * (v / ymax);
    // row window band
    const t0 = localToDate(d.c.start).getTime(), t1 = localToDate(d.c.end).getTime(), ta = localToDate(s[0].t).getTime(), tb = localToDate(s[s.length - 1].t).getTime();
    const bx = (t) => px0 + (px1 - px0) * ((t - ta) / (tb - ta)); g.fillStyle = "rgba(111,224,240,0.12)"; g.fillRect(Math.max(px0, bx(t0)), py0 - 8, Math.min(px1, bx(t1)) - Math.max(px0, bx(t0)), py1 - py0 + 8);
    // your limits, dashed
    [[L.windC, "caution"], [L.windS, "stop"]].forEach(([v, lab]) => { g.setLineDash([8, 8]); g.strokeStyle = "rgba(242,247,249,0.38)"; g.lineWidth = 2; g.beginPath(); g.moveTo(px0, Y(v)); g.lineTo(px1, Y(v)); g.stroke(); g.setLineDash([]);
      T(`${spd(v)}`, px0 - 12, Y(v) + 8, { size: 20, weight: 600, color: MUTED, align: "right" }); });
    T("your limits", px0 + 10, Y(L.windC) + 26, { size: 20, weight: 600, color: MUTED });
    // gust area then wind line
    g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.gust)) : g.moveTo(X(i), Y(p.gust)))); g.lineTo(X(s.length - 1), py1); g.lineTo(X(0), py1); g.closePath(); g.fillStyle = "rgba(244,194,122,0.16)"; g.fill();
    g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.gust)) : g.moveTo(X(i), Y(p.gust)))); g.strokeStyle = SAND; g.lineWidth = 4; g.lineJoin = "round"; g.stroke();
    g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.wind)) : g.moveTo(X(i), Y(p.wind)))); g.strokeStyle = CYAN; g.lineWidth = 7; g.lineCap = "round"; g.stroke();
    s.forEach((p, i) => { T(p.t.slice(11, 13), X(i), py1 + 30, { size: 22, weight: 600, color: MUTED, align: "center" }); });
    T("wind", px1 - 150, cyp + 44, { size: 22, weight: 700, color: CYAN, align: "right" }); T("gusts", px1, cyp + 44, { size: 22, weight: 700, color: SAND, align: "right" });
  }

  // lightning line: the one number that never waits
  const ly = 1004; g.beginPath(); g.roundRect(P, ly, W - 2 * P, 58, 29); g.fillStyle = "rgba(244,194,122,0.10)"; g.fill(); g.strokeStyle = "rgba(244,194,122,0.35)"; g.lineWidth = 2; g.stroke();
  let ltxt = "Lightning: not checked";
  const lg = d.lightning; if (lg && !lg.error) ltxt = lg.nearestKm == null ? `Lightning: none detected within ${lg.radiusKm} km in the last hour` : `Lightning: nearest strike ${lg.nearestKm} km ${compass(lg.bearing)}, ${lg.minutesAgo} min ago`;
  T("⚡", P + 34, ly + 40, { size: 30, color: SAND }); T(ltxt, P + 78, ly + 40, { size: 28, weight: 700, color: INK });

  // tiles
  const ty = 1080, tw = (W - 2 * P - 3 * 18) / 4, th = 112; const rain = f.storm.rainMax;
  const tiles = [["RAIN", rain < 0.1 ? "Dry" : rainWord(rain).replace(/^./, (x) => x.toUpperCase()), rain < 0.1 ? `${f.storm.pop}% chance` : `${rain.toFixed(1)} mm/h`],
    ["VISIBILITY", `${f.vis.v.toFixed(f.vis.v < 10 ? 1 : 0)} km`, f.vis.steam ? "steam fog likely" : "lowest in the row"],
    ["FEELS LIKE", `${Math.round(f.cold.v)}°C`, `air ${Math.round(d.c.temp)}°C`],
    ["LIGHT", f.light.dark ? "Lights on" : "Daylight", `sunrise ${hm(f.light.sunrise)}`]];
  tiles.forEach(([a, b, c], i) => { const x = P + i * (tw + 18); panel(x, ty, tw, th, 22); T(a, x + 20, ty + 34, { size: 19, weight: 700, color: MUTED, ls: 3 }); T(b, x + 20, ty + 72, { size: 36, weight: 800 }); T(c, x + 20, ty + 99, { size: 21, weight: 500, color: MUTED }); });

  // along the run
  if (d.run.length) {
    const ry = 1230; T("ALONG THE RUN  (wind / gusts)", P, ry, { size: 20, weight: 700, color: MUTED, ls: 4 });
    const rw = (W - 2 * P) / d.run.length; d.run.forEach((r, i) => { const x = P + i * rw; T(r.sp.name, x, ry + 38, { size: 24, weight: 700 }); T(`${spd(r.ws)} / ${spd(r.g)}${r.hs != null ? `  ·  ${r.hs.toFixed(1)} m` : ""}`, x, ry + 70, { size: 24, weight: 500, color: CYAN }); });
  }

  // footer
  T(`${d.stamp.live ? "Live forecast" : "Saved forecast"} ${new Date(state.fc.updated).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })}  ·  an estimate, not a safety guarantee`, P, 1332, { size: 21, weight: 500, color: MUTED });
  T("rowcast", W - P, 1332, { size: 24, weight: 800, color: CYAN, align: "right", ls: 1 });
}

async function shareCardSheet(win) {
  const d = cardData(win); if (!d) { toast("No forecast covers that time yet"); return; }
  try { await Promise.all(["500 24px Figtree", "700 24px Figtree", "800 70px Figtree"].map((f) => document.fonts.load(f))); } catch (e) { /* system font fallback */ }
  openSheet("Share as a picture", `<canvas id="cardCv" class="cardcv"></canvas><div class="sharerow" style="margin-top:12px"><button class="btn primary" id="cardShare">Share picture</button><button class="btn" id="cardSave">Save to phone</button></div>
    <p class="small muted" style="margin-top:8px">The picture shows conditions and your own limits. It does not say whether to row.</p>`, (b) => {
    const cv = b.querySelector("#cardCv"); drawCard(cv, d);
    const blob = () => new Promise((res) => cv.toBlob(res, "image/png"));
    b.querySelector("#cardShare").onclick = async () => {
      const file = new File([await blob()], "row-conditions.png", { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Row conditions" }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
      saveBlob(file);
    };
    b.querySelector("#cardSave").onclick = async () => saveBlob(new File([await blob()], "row-conditions.png", { type: "image/png" }));
  });
}
function saveBlob(file) { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast("Saved"); }
