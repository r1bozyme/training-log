/* ═══════════════════════════════════════════════════
   nav.js – Navigation in drei Bereichen (22.10.2026)

   Unten nur noch drei Bereiche, oben Chips im Stil des
   Finanz-Cockpits:
     Training   Log · Stats · Plan     + Eintrag als schwebender Knopf
     Ernährung  Heute                  (Vorrat · Einkauf folgen im November)
     Körper     Werte · Tracker

   Die Views bleiben, wie sie sind (add, log, stats, plan, food,
   weight, health). Die alten Knöpfe der .bnav bleiben im DOM, aber
   unsichtbar – index.html und die Module schalten deren .active
   weiter um, ohne Null-Prüfung. Gesteuert wird nur über showView.

   Ein Tipp auf einen Bereich öffnet die Ansicht, die dort zuletzt
   offen war (nur für diese Sitzung).

   Lädt als letztes Modul: äußerste showView-Schicht.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var AREAS = [
  { id: "training", label: "Training",  views: [["log", "Log"], ["stats", "Stats"], ["plan", "Plan"]], extra: ["add"] },
  { id: "food",     label: "Ernährung", views: [["food", "Heute"]] },
  { id: "body",     label: "Körper",    views: [["weight", "Werte"], ["health", "Tracker"]] }
];
var DEFAULT = { training: "log", food: "food", body: "weight" };
var last = {};        // zuletzt offene Ansicht je Bereich
var cur = "add";

function areaOf(v) {
  for (var i = 0; i < AREAS.length; i++) {
    var a = AREAS[i];
    if (a.views.some(function (x) { return x[0] === v; }) || (a.extra || []).indexOf(v) >= 0) return a;
  }
  return null;
}

var CSS = [
  /* alte Knöpfe aus, neue Bereichsknöpfe größer (schlägt die 10px aus tracker.js) */
  ".bnav .nbtn:not(.nav3) { display:none; }",
  ".bnav .nbtn.nav3 { font-size:13px; padding:12px 0; letter-spacing:0; }",

  ".chipnav { position:sticky; top:env(safe-area-inset-top, 0px); z-index:90; display:flex; gap:6px; overflow-x:auto; scrollbar-width:none;",
  "  padding:10px 20px; margin-top:14px; background:var(--bg); border-bottom:1px solid var(--border); }",
  ".chipnav[hidden] { display:none; }",
  ".chipnav::-webkit-scrollbar { display:none; }",
  ".chipnav button { flex:none; font-family:var(--fb); font-size:13px; font-weight:600; color:var(--text); padding:7px 14px;",
  "  border-radius:99px; background:var(--surface); border:1px solid var(--border); white-space:nowrap; cursor:pointer; }",
  ".chipnav button.on { background:var(--neutral); border-color:var(--neutral); color:#FFFFFF; }",
  ".chipnav .soon { flex:none; font-size:12px; color:var(--dim); padding:7px 4px; white-space:nowrap; }",

  ".navfab { position:fixed; right:max(16px, calc(50% - 224px)); bottom:calc(76px + var(--sb)); z-index:101;",
  "  border:none; border-radius:99px; padding:14px 20px; background:var(--neutral); color:#FFFFFF;",
  "  font-family:var(--fb); font-weight:700; font-size:14px; box-shadow:0 4px 14px rgba(0,0,0,.18); cursor:pointer; }",
  ".navfab[hidden] { display:none; }",
  /* Platz unter dem letzten Inhalt, damit der schwebende Knopf nichts verdeckt */
  "body.has-fab #app { padding-bottom:calc(140px + var(--sb)); }"
].join("\n");

var bar, fab, areaBtns = {};

function renderChips() {
  var a = areaOf(cur);
  if (!bar) return;
  if (!a) { bar.hidden = true; return; }
  bar.hidden = false;
  var h = a.views.map(function (x) {
    return '<button type="button" data-v="' + x[0] + '"' + (x[0] === cur ? ' class="on"' : '') + '>' + x[1] + '</button>';
  }).join("");
  if (a.id === "food") h += '<span class="soon">Vorrat · Einkauf ab November</span>';
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
    b.textContent = a.label;
    b.onclick = function () {
      var target = last[a.id] || DEFAULT[a.id];
      /* Erneuter Tipp auf den aktiven Bereich: zurück zur ersten Ansicht */
      var here = areaOf(cur);
      if (here && here.id === a.id) target = a.views[0][0];
      window.showView(target);
      window.scrollTo(0, 0);
    };
    areaBtns[a.id] = b;
    nav.appendChild(b);
  });

  /* Chips oben, direkt unter dem Kopf */
  bar = document.createElement("div");
  bar.id = "chipnav";
  bar.className = "chipnav";
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]");
    if (b && b.dataset.v !== cur) { window.showView(b.dataset.v); window.scrollTo(0, 0); }
  });
  var hdr = app.querySelector(".hdr");
  if (hdr && hdr.nextSibling) app.insertBefore(bar, hdr.nextSibling); else app.insertBefore(bar, app.firstChild);

  /* + Eintrag schwebend */
  fab = document.createElement("button");
  fab.type = "button";
  fab.className = "navfab";
  fab.textContent = "＋ Eintrag";
  fab.onclick = function () { window.showView("add"); window.scrollTo(0, 0); };
  document.body.appendChild(fab);

  /* Aktive Ansicht beim Start übernehmen */
  ["add", "log", "stats", "plan", "food", "weight", "health"].forEach(function (id) {
    var v = document.getElementById("view-" + id);
    if (v && v.classList.contains("active")) cur = id;
  });

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      var r = origShow.apply(this, arguments);
      cur = v;
      sync();
      return r;
    };
  }

  sync();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
