/* ================= symbology: palettes, nautical icons, labels ================= */
// Three cartographic modes. Plan = terrestrial context. Water = chart style (land recedes to buff,
// water and nav information lead, S-52 inspired). Dark = night palette that protects dark adaptation.
const PAL = {
  plan: { bg: "#EEF0EA", wood: "#CFE0C3", park: "#D9E8CC", grass: "#E2ECD5", wetland: "#D2E4DC", sand: "#EDE4C8", farm: "#ECEBDD", marina: "#D9E6EE",
    water: "#A8D2EC", shore: "#6A9EC4", river: "#A8D2EC", bld: "#D8D3C9", bldLine: "#C4BEB2", road: "#FFFFFF", roadCase: "#D3CFC6", major: "#FCE3A4", majorCase: "#D9AE5E",
    rail: "#8F8F8F", bridgeCase: "#3B3B3B", pier: "#7B7F82", bwCase: "#2E3337", bwFill: "#C4C9CC", power: "#A35FA0", label: "#33424A", waterLabel: "#2F6E9E", halo: "rgba(255,255,255,.9)",
    depth: ["#C4E2F4", "#AED6EF", "#98CAE9", "#83BDE3", "#6FB0DC", "#5DA3D4"], contour: "#5F92BB", safety: "#1D5C8C",
    hazard: "#C2185B", lock: "#1E2A33", relief: 0.6, landmark: "#1E2A33" },
  water: { bg: "#EFE4C2", wood: "#E4D7AE", park: "#E8DDB8", grass: "#EADFBA", wetland: "#DCD8B4", sand: "#F1E7C6", farm: "#EDE2BF", marina: "#E3DCC0",
    water: "#C9E4F5", shore: "#3B4650", river: "#C9E4F5", bld: "#D5C59A", bldLine: "#B8A677", road: "#E4D6AE", roadCase: "#C9B98C", major: "#DCCB98", majorCase: "#B9A56D",
    rail: "#A9997A", bridgeCase: "#2C2C2C", pier: "#4B4F52", bwCase: "#23272A", bwFill: "#9AA1A6", power: "#B0177F", label: "#4A4232", waterLabel: "#1F5F92", halo: "rgba(244,236,210,.92)",
    depth: ["#79B6E2", "#97C8EA", "#B5D9F1", "#D1E8F7", "#E8F3FB", "#FFFFFF"], contour: "#4F86B3", safety: "#0D3E66",
    hazard: "#B0177F", lock: "#1B1B1B", relief: 0.35, landmark: "#1B1B1B" },
  dark: { bg: "#0E1013", wood: "#11161A", park: "#121719", grass: "#121619", wetland: "#11171A", sand: "#16150F", farm: "#121314", marina: "#101820",
    water: "#07121B", shore: "#2E4252", river: "#07121B", bld: "#1A1D21", bldLine: "#24282D", road: "#23272C", roadCase: "#16191C", major: "#3A3324", majorCase: "#1C1A14",
    rail: "#3A3D40", bridgeCase: "#6B7177", pier: "#5A6268", bwCase: "#0B0E10", bwFill: "#8A949B", power: "#7A2B5E", label: "#8C9AA4", waterLabel: "#5D8DB0", halo: "rgba(5,8,10,.85)",
    depth: ["#0F2B42", "#0C2336", "#0A1C2C", "#081723", "#07131D", "#061018"], contour: "#2B4D66", safety: "#5D8DB0",
    hazard: "#C2367F", lock: "#9AA7B0", relief: 0.25, landmark: "#9AA7B0" }
};
const pal = () => (state.night ? PAL.dark : PAL[state.mode]);
const dim = () => state.night || state.mode === "dark";

// Canadian buoyage (IALA Region B): red right returning. Starboard = red cone/nun, port = green can.
function iconCanvas(w, h, draw, scale = 2) {
  const c = document.createElement("canvas"); c.width = w * scale; c.height = h * scale;
  const g = c.getContext("2d"); g.scale(scale, scale); g.lineJoin = "round"; g.lineCap = "round"; draw(g, w, h); return c;
}
const MARK = {
  stbd: (g, w, h, P) => { const c = dim() ? "#A8352E" : "#D13A2E"; g.fillStyle = c; g.strokeStyle = dim() ? "#000" : "#3A0E0A"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w / 2, 3); g.lineTo(w / 2 + 6, h - 6); g.lineTo(w / 2 - 6, h - 6); g.closePath(); g.fill(); g.stroke(); posDot(g, w, h); },
  port: (g, w, h) => { const c = dim() ? "#2E7D4F" : "#1E8E4E"; g.fillStyle = c; g.strokeStyle = dim() ? "#000" : "#0B3A1F"; g.lineWidth = 1;
    g.beginPath(); g.rect(w / 2 - 5.5, 4, 11, h - 10); g.fill(); g.stroke(); posDot(g, w, h); },
  special: (g, w, h) => { g.fillStyle = dim() ? "#8C7A1A" : "#F2C811"; g.strokeStyle = dim() ? "#000" : "#5A4A00"; g.lineWidth = 1;
    g.beginPath(); g.ellipse(w / 2, h / 2 + 2, 5, 6.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = dim() ? "#8C7A1A" : "#5A4A00"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(w / 2 - 3, 1.5); g.lineTo(w / 2 + 3, 6.5); g.moveTo(w / 2 + 3, 1.5); g.lineTo(w / 2 - 3, 6.5); g.stroke(); posDot(g, w, h); },
  mooring: (g, w, h) => { g.strokeStyle = dim() ? "#7D8790" : "#2B3238"; g.fillStyle = dim() ? "#1A1F24" : "#FFFFFF"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(w / 2, h / 2, 3.6, 0, Math.PI * 2); g.fill(); g.stroke(); },
  light: (g, w, h) => { g.fillStyle = dim() ? "#8E2A66" : "#C2177F"; g.beginPath(); g.moveTo(w / 2, h / 2 + 1);
    g.bezierCurveTo(w / 2 + 3, h / 2 - 5, w / 2 + 9, h / 2 - 9, w / 2 + 11, h / 2 - 14); g.bezierCurveTo(w / 2 + 4, h / 2 - 11, w / 2 - 1, h / 2 - 6, w / 2, h / 2 + 1); g.fill();
    g.fillStyle = dim() ? "#9AA7B0" : "#1B1B1B"; g.beginPath(); g.arc(w / 2, h / 2 + 1, 2, 0, Math.PI * 2); g.fill(); },
  marina: (g, w, h) => { g.fillStyle = dim() ? "#1B3A55" : "#2E6DA4"; roundRect(g, 2, 2, w - 4, h - 4, 4); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(w / 2 + 1, 5); g.lineTo(w / 2 + 1, h - 8); g.lineTo(w / 2 + 6, h - 8); g.closePath(); g.fill();
    g.fillRect(w / 2 - 6, h - 7, 13, 2); },
  wreck: (g, w, h) => { g.strokeStyle = dim() ? "#9AA7B0" : "#1B1B1B"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(3, h / 2); g.lineTo(w - 3, h / 2);
    [w / 2 - 5, w / 2, w / 2 + 5].forEach((x) => { g.moveTo(x, h / 2 - 4); g.lineTo(x, h / 2 + 4); }); g.stroke(); },
  lock: (g, w, h) => { g.fillStyle = dim() ? "#1A1F24" : "#FFFFFF"; g.strokeStyle = dim() ? "#9AA7B0" : "#1E2A33"; g.lineWidth = 1.5; roundRect(g, 1.5, 1.5, w - 3, h - 3, 4); g.fill(); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(5, 6); g.lineTo(w / 2, h / 2); g.lineTo(5, h - 6); g.moveTo(w - 5, 6); g.lineTo(w / 2, h / 2); g.lineTo(w - 5, h - 6); g.stroke(); },
  dam: (g, w, h) => { g.fillStyle = dim() ? "#5A1E3E" : "#C2185B"; g.beginPath(); g.moveTo(w / 2, 2); g.lineTo(w - 2, h - 3); g.lineTo(2, h - 3); g.closePath(); g.fill();
    g.fillStyle = "#fff"; g.fillRect(w / 2 - 1, 7, 2, 6); g.fillRect(w / 2 - 1, 15, 2, 2); },
  tower: (g, w, h) => { const c = dim() ? "#9AA7B0" : "#1B1B1B"; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1.3;
    g.beginPath(); g.arc(w / 2, h - 6, 3.2, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(w / 2, h - 6, 1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(w / 2, h - 9.5); g.lineTo(w / 2, 3); g.stroke(); },
  club: null // filled with the Blender shell sprite
};
function posDot(g, w, h) { g.fillStyle = dim() ? "#9AA7B0" : "#1B1B1B"; g.beginPath(); g.arc(w / 2, h - 3, 1.6, 0, Math.PI * 2); g.fill(); }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function markIcon(p) {
  const t = p.type || "", c = (p.colour || "") + " " + (p.cat || "");
  if (t.includes("lateral")) return /red|starboard/.test(c) ? "stbd" : "port";
  if (t.includes("special")) return "special";
  if (t === "mooring") return "mooring";
  if (t.startsWith("light")) return "light";
  if (t === "harbour" || t === "small_craft_facility") return "marina";
  if (t === "wreck") return "wreck";
  return "mooring";
}
function markName(p) {
  const t = p.type || "";
  if (t.includes("lateral")) return /red|starboard/.test((p.colour || "") + (p.cat || "")) ? "Starboard-hand buoy (red, keep on your right heading upstream)" : "Port-hand buoy (green)";
  return ({ buoy_special_purpose: "Special-purpose buoy (yellow): swim area, race course or restricted zone", mooring: "Mooring buoy", light_minor: "Minor light", light_major: "Major light",
    harbour: "Harbour or marina", small_craft_facility: "Small-craft facility", wreck: "Wreck", restricted_area: "Restricted area" })[t] || t.replace(/_/g, " ");
}
function lightText(p) { return p.light ? `${p.char || ""}${p.light ? " " + p.light.slice(0, 1).toUpperCase() : ""}${p.period ? " " + p.period + "s" : ""}`.trim() : ""; }

// Text labels are drawn to canvas and registered as images (no glyph server needed).
const labelCache = new Set();
function labelImage(map, id, text, style) {
  const key = "lbl-" + id; if (labelCache.has(key) && map.hasImage(key)) map.removeImage(key);
  const P = pal(); const s = 2;
  const font = `${style.italic ? "italic " : ""}${style.weight || 600} ${style.size || 12}px Figtree, system-ui, sans-serif`;
  const m = document.createElement("canvas").getContext("2d"); m.font = font;
  const tw = Math.ceil(m.measureText(text).width + (style.spacing || 0) * text.length) + 10, th = Math.ceil((style.size || 12) * 1.5) + 4;
  const c = document.createElement("canvas"); c.width = tw * s; c.height = th * s; const g = c.getContext("2d"); g.scale(s, s);
  g.font = font; g.textBaseline = "middle"; g.lineJoin = "round"; g.strokeStyle = P.halo; g.lineWidth = 3.2;
  if (style.spacing) { g.letterSpacing = style.spacing + "px"; }
  g.strokeText(text, 4, th / 2); g.fillStyle = style.color || P.label; g.fillText(text, 4, th / 2);
  map.addImage(key, { width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data }, { pixelRatio: s });
  labelCache.add(key); return key;
}
function stripeImage(color) {
  const c = iconCanvas(12, 12, (g) => { g.strokeStyle = color; g.lineWidth = 2.2; g.globalAlpha = 0.55;
    for (let i = -12; i < 24; i += 6) { g.beginPath(); g.moveTo(i, 12); g.lineTo(i + 12, 0); g.stroke(); } }, 2);
  return { width: c.width, height: c.height, data: c.getContext("2d").getImageData(0, 0, c.width, c.height).data };
}
function addIcons(map) {
  const add = (name, w, h, fn) => { if (map.hasImage(name)) map.removeImage(name); const c = iconCanvas(w, h, fn);
    map.addImage(name, { width: c.width, height: c.height, data: c.getContext("2d").getImageData(0, 0, c.width, c.height).data }, { pixelRatio: 2 }); };
  add("m-stbd", 20, 22, (g, w, h) => MARK.stbd(g, w, h)); add("m-port", 20, 22, (g, w, h) => MARK.port(g, w, h));
  add("m-special", 20, 22, (g, w, h) => MARK.special(g, w, h)); add("m-mooring", 12, 12, (g, w, h) => MARK.mooring(g, w, h));
  add("m-light", 26, 26, (g, w, h) => MARK.light(g, w, h)); add("m-marina", 20, 20, (g, w, h) => MARK.marina(g, w, h));
  add("m-wreck", 22, 14, (g, w, h) => MARK.wreck(g, w, h)); add("m-lock", 22, 22, (g, w, h) => MARK.lock(g, w, h));
  add("m-dam", 18, 20, (g, w, h) => MARK.dam(g, w, h)); add("m-tower", 14, 22, (g, w, h) => MARK.tower(g, w, h));
  ["yellow", "orange", "red"].forEach((c) => { if (map.hasImage("hatch-" + c)) map.removeImage("hatch-" + c);
    map.addImage("hatch-" + c, stripeImage({ yellow: "#C9A400", orange: "#E07B00", red: "#D0302A" }[c]), { pixelRatio: 2 }); });
  if (shellImgs["1x"] && !map.hasImage("m-club")) { const im = shellImgs["1x"]; const c = document.createElement("canvas"); c.width = 44; c.height = 64;
    const g = c.getContext("2d"); g.translate(22, 32); g.rotate(-0.6); g.drawImage(im, -im.width / im.height * 30, -30, im.width / im.height * 60, 60);
    map.addImage("m-club", { width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data }, { pixelRatio: 2 }); }
  // wind barb style arrow for zoomed-in point values
  add("wind-arrow", 18, 18, (g, w, h) => { g.fillStyle = dim() ? "#9AA7B0" : "#0E1B22"; g.beginPath(); g.moveTo(w / 2, 1); g.lineTo(w / 2 + 5, h - 3); g.lineTo(w / 2, h - 6); g.lineTo(w / 2 - 5, h - 3); g.closePath(); g.fill(); });
}
const shellImgs = {};
function loadShells() {
  return Promise.all(["1x", "2x", "4x", "8p"].map((k) => new Promise((res) => { const im = new Image(); im.onload = () => { shellImgs[k] = im; res(); }; im.onerror = res; im.src = "shell_" + k + ".png"; })));
}
const shellSrc = (b) => "shell_" + (b === "8+" ? "8p" : b) + ".png";
