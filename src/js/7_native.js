/* ================= app behaviour: Android Back button, install, shortcuts ================= */
// Back closes the open sheet or drawer first, then returns from a tab to the map, and only then leaves the app.
// One history entry stands for "an overlay is open" and one for "a tab other than the map is showing".
const nav = { overlay: false, tab: false, skip: 0 };
const overlayOpen = () => $("sheet").classList.contains("on") || $("drawer").classList.contains("on");
function syncOverlay() {
  if (overlayOpen() && !nav.overlay) { nav.overlay = true; history.pushState({ rc: "overlay" }, ""); }
  else if (!overlayOpen() && nav.overlay) { nav.overlay = false; nav.skip++; history.back(); }
}
function navHistory(screen, fromBack) {
  if (screen !== "map" && !nav.tab) { nav.tab = true; history.pushState({ rc: "tab" }, ""); }
  else if (screen === "map" && nav.tab && !fromBack) { nav.tab = false; nav.skip++; history.back(); }
}
history.replaceState({ rc: "root" }, "");
addEventListener("popstate", () => {
  if (nav.skip > 0) { nav.skip--; return; }
  if (nav.overlay) { nav.overlay = false; closeSheet(); closeDrawer(); return; }
  if (nav.tab) { nav.tab = false; go("map", true); }
});

// Install button in the menu while the browser offers it and the app is still running in a tab.
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let installEvt = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
addEventListener("appinstalled", () => { installEvt = null; });
const drawerBase = renderDrawer;
renderDrawer = function () {
  drawerBase();
  if (standalone) return;
  const body = $("drawer").querySelector(".dbody"); if (!body) return;
  body.insertAdjacentHTML("afterbegin", `<button class="ditem" id="dInstall"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg></span><span class="tx"><b>Install RowCast</b><span>${installEvt ? "Open it like any other app, even offline" : "Chrome menu, then Install app"}</span></span></button>`);
  $("dInstall").onclick = async () => { if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; closeDrawer(); } else toast("Chrome menu, then Install app"); };
};

// Home-screen shortcuts open straight to a tab: ./?s=call, fc, light, races.
booted.then(() => { const s = new URLSearchParams(location.search).get("s"); if (["call", "fc", "light", "races"].includes(s)) go(s); });
