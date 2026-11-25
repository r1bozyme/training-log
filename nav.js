/* ═══════════════════════════════════════════════════
   nav.js – Navigation in drei Bereichen (22.10.2026)

   Unten nur noch drei Bereiche, oben Chips im Stil des
   Finanz-Cockpits:
     Training   Log · Stats · Plan     + Eintrag als schwebender Knopf
     Ernährung  Heute · Vorrat · Einkauf   (Vorrat & Einkauf seit 31.10., vorrat.js)
     Körper     Werte · Tracker

   Die Views bleiben, wie sie sind (add, log, stats, plan, food,
   weight, health). Die alten fünf Knöpfe der .bnav sind seit dem 12.11.
   aus index.html entfernt; die Leiste ist dort leer und wird hier
   gefüllt. Gesteuert wird nur über showView (view.js).

   Ein Tipp auf einen Bereich öffnet die Ansicht, die dort zuletzt
   offen war (nur für diese Sitzung).

   25.11.: Leiste als schwebende Pille (Vorbild Orva): Icon + kleines
   Label, aktiver Bereich zart getönt in seiner Farbe (Training orange,
   Ernährung grün, Körper blau) statt schwarzem Block. Die schwebenden
   Knöpfe (navfab, ffab, scanfab, Undo, Hinweise) sitzen 16 px höher.
   Auf der Leiste selbst wechselt ein Wisch nach links/rechts den
   Bereich (Training ↔ Ernährung ↔ Körper, ohne Rundlauf); das Wischen
   im Inhalt (swipe.js) bleibt bei den Unteransichten.

   Lädt als letztes Modul und hört auf den Ansichtswechsel (tl:view, view.js).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var AREAS = [
  { id: "training", label: "Training",  icon: "training", views: [["log", "Log"], ["stats", "Stats"], ["plan", "Plan"]], extra: ["add"] },
  { id: "food",     label: "Ernährung", icon: "food", views: [["food", "Heute"], ["vorrat", "Vorrat"], ["einkauf", "Einkauf"]] },
  { id: "body",     label: "Körper",    icon: "body", views: [["weight", "Werte"], ["health", "Tracker"]] }
];
var DEFAULT = { training: "log", food: "food", body: "weight" };
window.tlNavAreas = AREAS;   // swipe.js wischt entlang dieser Reihenfolge
var last = {};        // zuletzt offene Ansicht je Bereich

/* Linien-Icons (24er Raster, Strich in currentColor) */
var ICONS = {
  training: '<path d="M2 12h2M20 12h2M7 12h10"/><rect x="4" y="8" width="3" height="8" rx="1"/><rect x="17" y="8" width="3" height="8" rx="1"/><rect x="7" y="6" width="2.5" height="12" rx="1"/><rect x="14.5" y="6" width="2.5" height="12" rx="1"/>',
  food: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 11c0-2.5 1.5-4 3.5-4.5M12 11c0-3 2-5 5-5M15 6.5c.5-1.5 1.8-2.5 3.5-2.5"/>',
  body: '<path d="M20.5 12.6A5 5 0 0 0 12 6.4a5 5 0 0 0-8.5 6.2L12 21l8.5-8.4z"/><path d="M3 12h4l2-3 3 6 2-3h7"/>'
};
var cur = "add";

function areaOf(v) {
  for (var i = 0; i < AREAS.length; i++) {
    var a = AREAS[i];
    if (a.views.some(function (x) { return x[0] === v; }) || (a.extra || []).indexOf(v) >= 0) return a;
  }
  return null;
}

var CSS = [
  /* nur Bereichsknöpfe zeigen (falls index.html noch mit den alten Knöpfen aus dem Cache kommt), größer als die 10px aus tracker.js */
  ".bnav .nbtn:not(.nav3) { display:none; }",
  ".bnav .nbtn.nav3 { display:flex; flex-direction:column; align-items:center; gap:2px; padding:7px 0 6px;",
  "  font-size:11px; font-weight:600; letter-spacing:0; color:var(--muted); background:transparent; }",
  ".bnav .nav3 svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }",
  ".bnav .nav3.active[data-a=training] { background:var(--legs-bg); color:var(--legs); }",
  ".bnav .nav3.active[data-a=food] { background:var(--go-bg); color:var(--go); }",
  ".bnav .nav3.active[data-a=body] { background:var(--blue-bg); color:var(--blue); }",

  ".chipnav { position:sticky; top:env(safe-area-inset-top, 0px); z-index:90; display:flex; gap:6px; overflow-x:auto; scrollbar-width:none;",
  "  padding:10px 20px; margin-top:14px; background:var(--bg); border-bottom:1px solid var(--border); }",
  ".chipnav[hidden] { display:none; }",
  ".chipnav::-webkit-scrollbar { display:none; }",
  ".chipnav button { flex:none; font-family:var(--fb); font-size:13px; font-weight:600; color:var(--text); padding:7px 14px;",
  "  border-radius:99px; background:var(--surface); border:1px solid var(--border); white-space:nowrap; cursor:pointer; }",
  ".chipnav button.on { background:var(--neutral); border-color:var(--neutral); color:var(--on-neutral); }",
  ".chipnav .soon { flex:none; font-size:12px; color:var(--dim); padding:7px 4px; white-space:nowrap; }",

  ".navfab { position:fixed; right:max(16px, calc(50% - 224px)); bottom:calc(92px + var(--sb)); z-index:101;",
  "  border:none; border-radius:99px; padding:14px 20px; background:var(--neutral); color:var(--on-neutral);",
  "  font-family:var(--fb); font-weight:700; font-size:14px; box-shadow:0 4px 14px rgba(0,0,0,.18); cursor:pointer; }",
  ".navfab[hidden] { display:none; }",
  /* Platz unter dem letzten Inhalt, damit der schwebende Knopf nichts verdeckt */
  "body.has-fab #app { padding-bottom:calc(156px + var(--sb)); }"
].join("\n");

var bar, fab, areaBtns = {}, noClick = 0;

/* Bereich öffnen: dort zuletzt offene Ansicht, sonst die erste */
function goArea(a) {
  window.showView(last[a.id] || DEFAULT[a.id]);
  (window.tlScrollTop || function () { window.scrollTo(0, 0); })();
}

function renderChips() {
  var a = areaOf(cur);
  if (!bar) return;
  if (!a) { bar.hidden = true; return; }
  bar.hidden = false;
  var h = a.views.map(function (x) {
    return '<button type="button" data-v="' + x[0] + '"' + (x[0] === cur ? ' class="on"' : '') + '>' + x[1] + '</button>';
  }).join("");
  bar.innerHTML = h;
}

function sync() {
  var a = areaOf(cur);
  Object.keys(areaBtns).forEach(function (id) { areaBtns[id].classList.toggle("active", !!a && a.id === id); });
  if (a && a.views.some(function (x) { return x[0] === cur; })) last[a.id] = cur;
  renderChips();
  var showFab = !!(a && a.id === "training" && cur !== "add");
  if (fab) fab.hidden = !showFab;
  document.body.classList.toggle("has-fab", showFab);
}

function init() {
  var nav = document.querySelector(".bnav");
  var app = document.getElementById("app");
  if (!nav || !app || document.getElementById("chipnav")) return;

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  /* Bereichsknöpfe unten */
  AREAS.forEach(function (a) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "nbtn nav3";
    b.dataset.a = a.id;
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[a.icon] + '</svg><span>' + a.label + '</span>';
    b.onclick = function () {
      if (Date.now() < noClick) return;   // Wisch auf der Leiste, kein Tipp
      /* Erneuter Tipp auf den aktiven Bereich: zurück zur ersten Ansicht */
      var here = areaOf(cur);
      if (here && here.id === a.id) { window.showView(a.views[0][0]); (window.tlScrollTop || function () { window.scrollTo(0, 0); })(); }
      else goArea(a);
    };
    areaBtns[a.id] = b;
    nav.appendChild(b);
  });

  /* 25.11.: Wisch auf der Leiste wechselt den Bereich */
  var t0 = null;
  nav.addEventListener("touchstart", function (e) {
    var t = e.touches[0]; t0 = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, ts: Date.now() } : null;
  }, { passive: true });
  nav.addEventListener("touchend", function (e) {
    if (!t0) return;
    var t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
    t0 = null;
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    var here = areaOf(cur), i = here ? AREAS.indexOf(here) : 0, j = i + (dx < 0 ? 1 : -1);
    noClick = Date.now() + 400;
    if (j < 0 || j >= AREAS.length) return;
    goArea(AREAS[j]);
  }, { passive: true });
  nav.addEventListener("touchcancel", function () { t0 = null; }, { passive: true });

  /* Chips oben, direkt unter dem Kopf */
  bar = document.createElement("div");
  bar.id = "chipnav";
  bar.className = "chipnav";
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]");
    if (b && b.dataset.v !== cur) { window.showView(b.dataset.v); (window.tlScrollTop || function () { window.scrollTo(0, 0); })(); }
  });
  var hdr = app.querySelector(".hdr");
  if (hdr && hdr.nextSibling) app.insertBefore(bar, hdr.nextSibling); else app.insertBefore(bar, app.firstChild);

  /* + Eintrag schwebend */
  fab = document.createElement("button");
  fab.type = "button";
  fab.className = "navfab";
  fab.textContent = "＋ Eintrag";
  fab.onclick = function () { window.showView("add"); (window.tlScrollTop || function () { window.scrollTo(0, 0); })(); };
  document.body.appendChild(fab);

  /* Aktive Ansicht beim Start übernehmen */
  ["add", "log", "stats", "plan", "food", "vorrat", "einkauf", "weight", "health"].forEach(function (id) {
    var v = document.getElementById("view-" + id);
    if (v && v.classList.contains("active")) cur = id;
  });

  document.addEventListener("tl:view", function (e) { cur = e.detail.view; sync(); });

  /* 11.11.: App startet im Log statt im Eintrag (index.html öffnet
     view-add). Über showView, damit alle Module ihren Log-Teil zeichnen;
     Sprünge aus Erinnerungen (push.js, ?go=…) kommen danach. */
  if (cur === "add") { window.showView("log"); return; }

  sync();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
