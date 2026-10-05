"use strict";
/* ================= core: config, state, time ================= */
const VENUES = {
  trent: { id: "trent", name: "Otonabee River", place: "Peterborough, ON", kind: "venue", center: [-78.296, 44.336], zoom: 13.2,
    map: "map_trent.json", fc: "trent", water: 14, heading: 0,
    note: "River and Trent Canal. No open depth survey for this reach.", depth: false },
  argo: { id: "argo", name: "Argonaut RC", place: "Western Beaches, Toronto", kind: "home", center: [-79.432, 43.628], zoom: 13.6,
    map: "map_argo.json", fc: "argo", water: null, heading: null,
    note: "Western Beaches watercourse and Humber Bay. Depths from NOAA Great Lakes bathymetry.", depth: true }
};
const DEFAULT_EVENTS = [
  { id: "hott-2026", name: "Head of the Trent", venue: "trent", start: "2026-10-03", end: "2026-10-04",
    detail: "4.7 km head race, upstream (north). Finish moved to just before the Bata Library turn (Faryon Bridge works).",
    host: "Trent University & Peterborough Rowing Club", entries: "RegattaCentral", url: "https://alumni.trentu.ca/HOTT", builtin: true }
];
const DEFAULT_LIMITS = { windC: 15, windS: 25, gustC: 30, gustS: 40, waveC: 0.3, waveS: 0.5, visC: 5, visS: 1, feelsC: 5 };

const store = {
  get(k, d) { try { const v = localStorage.getItem("rowcast2:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("rowcast2:" + k, JSON.stringify(v)); } catch (e) {} }
};
const state = {
  screen: "map", venue: store.get("venue", "trent"), event: store.get("event", "hott-2026"),
  mode: store.get("mode", "plan"), unit: store.get("unit", "kmh"), night: store.get("night", false),
  limits: Object.assign({}, DEFAULT_LIMITS, store.get("limits", {})),
  layers: Object.assign({ wind: true, waves: true, vis: true, radar: false, alerts: true, depth: true, marks: true, relief: true, course: true, landmarks: true }, store.get("layers", {})),
  events: DEFAULT_EVENTS.concat(store.get("userEvents", [])),
  races: store.get("races", null), courses: store.get("courses", {}),
  hour: 0, playing: false, plan: null,
  data: {}, wx: null, fc: null, relief: null
};
if (state.races === null) state.races = [{ id: "ex1", example: true, event: "hott-2026", title: "Masters Men 1x (example)", boat: "1x", bow: "212", start: "2026-10-04T10:42", marshal: 30, launch: 20, pace: 2.3 }];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtHM = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hm = (d) => (d instanceof Date && !isNaN(d) ? fmtHM.format(d) : "—");
const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const fmtWd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short" });
const dayLbl = (s) => fmtDay.format(localToDate(s.slice(0, 10) + "T12:00"));
const wdLbl = (s) => fmtWd.format(localToDate(s.slice(0, 10) + "T12:00"));
const nowLocal = () => torLocal(new Date());
const spd = (v) => (v == null ? "—" : state.unit === "kn" ? Math.round(v / 1.852) : Math.round(v));
const uLbl = () => (state.unit === "kn" ? "kn" : "km/h");
const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (d) => (d == null ? "—" : DIRS[Math.round((d % 360) / 22.5) % 16]);
const WX = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" };
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2200); }
function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function save() {
  store.set("venue", state.venue); store.set("event", state.event); store.set("mode", state.mode); store.set("unit", state.unit);
  store.set("night", state.night); store.set("limits", state.limits); store.set("layers", state.layers); store.set("races", state.races);
  store.set("courses", state.courses); store.set("userEvents", state.events.filter((e) => !e.builtin));
}
const activeEvent = () => state.events.find((e) => e.id === state.event && e.venue === state.venue) || null;
const V = () => VENUES[state.venue];
function fcVenue() { return state.fc && state.fc.venues && state.fc.venues[V().fc]; }
function waterTemp() {
  if (V().water != null) return V().water;
  const b = fcVenue() && fcVenue().buoy; const o = b && b.obs && b.obs.find((x) => x.wtmp != null); return o ? o.wtmp : 15;
}
