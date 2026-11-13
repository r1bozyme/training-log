/* ═══════════════════════════════════════════════════
   swipe.js – Wischen wie unter Android (05.11.2026)

   Muster aus dem Finanz-Cockpit (regel-cockpit, Commit 7c4af5f):
   Die Seite folgt dem Finger. Ab 22 % der Breite oder bei mehr als
   0,5 px/ms rastet sie in der Nachbaransicht ein, sonst federt sie
   zurück. Am Rand eines Bereichs gibt sie nur gebremst nach (dx/3).

   Gewischt wird zwischen den Unteransichten eines Bereichs, also
   entlang der Chips oben (Reihenfolge aus nav.js, window.tlNavAreas):
     Training   Log ↔ Stats ↔ Plan
     Ernährung  Heute ↔ Vorrat ↔ Einkauf
     Körper     Werte ↔ Tracker
   Die drei Bereiche unten wechseln nur per Tipp.

   Richtung: nach 10 px Bewegung. Waagerecht nur, wenn die Bewegung
   in den ersten 200 ms beginnt und |dx| > 1,2·|dy|. Bleibt der
   Finger länger ruhig, gehört die Geste den Graphen (scrub.js,
   HOLD = 200) bzw. dem normalen Scrollen.

   Ausgenommen:
   - Eintrag (view-add): Formular mit Pausentimer, gehört zu keinem
     Chip – dort wird gar nicht gewischt
   - Eingabefelder, Chip-Leiste, untere Leiste, schwebende Knöpfe
     („+ Eintrag“, „Tag ▴“ samt Menü), Dialoge (dialog.js)
   - Elemente, die selbst seitlich scrollen (z. B. Filterzeile im Log)

   Lädt nach nav.js und nutzt dessen showView-Schicht.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var HOLD = 200;     // ms – danach gehört die Geste den Graphen
var LOCK = 10;      // px bis die Richtung feststeht
var SNAP = 0.22;    // Anteil der Breite zum Einrasten
var FLING = 0.5;    // px/ms zum Einrasten per Schwung
var MIN = 30;       // px – darunter rastet auch ein schneller Wisch nicht ein

var SKIP = "input,select,textarea,button.nbtn,[contenteditable],.chipnav,.bnav,.navfab,.ffab,.ffov,.ffmenu,.ask-ov,.ask-sh";

var CSS = [
  /* während der Geste nichts seitlich überstehen lassen (clip bricht position:sticky nicht) */
  "body.sw-on #app { overflow-x:clip; }",
  "@keyframes swInL { from { transform:translateX(28px); opacity:.3 } to { transform:none; opacity:1 } }",
  "@keyframes swInR { from { transform:translateX(-28px); opacity:.3 } to { transform:none; opacity:1 } }",
  ".view.sw-in-l { animation:swInL .18s ease-out; }",
  ".view.sw-in-r { animation:swInR .18s ease-out; }"
].join("\n");

var app, s0 = null, busy = false;

function curView() {
  var v = app && app.querySelector(".view.active[id^=\"view-\"]");
  return v ? v.id.replace(/^view-/, "") : null;
}

/* Ansichten des Bereichs, zu dem v als Chip gehört (null für "add") */
function rowOf(v) {
  var A = window.tlNavAreas || [];
  for (var i = 0; i < A.length; i++) {
    var ids = A[i].views.map(function (x) { return x[0]; });
    if (ids.indexOf(v) >= 0) return ids;
  }
  return null;
}

function hScroll(el) {
  for (; el && el !== app && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/* position:fixed innerhalb der Ansicht (z. B. „Tag ▴“) würde unter transform
   mitwandern und an das Seitenende springen – während der Geste ausblenden */
function hideFixed(view) {
  var out = [];
  [].forEach.call(view.querySelectorAll("*"), function (n) {
    if (getComputedStyle(n).position === "fixed" && n.style.visibility !== "hidden") {
      out.push(n); n.style.visibility = "hidden";
    }
  });
  return out;
}
function showFixed(list) { (list || []).forEach(function (n) { n.style.visibility = ""; }); }

function reset(el, fixed) {
  el.style.transition = ""; el.style.transform = "";
  showFixed(fixed);
  document.body.classList.remove("sw-on");
}

function onStart(e) {
  s0 = null;
  if (busy || e.touches.length !== 1) return;
  if (document.querySelector(".ask-ov")) return;           // Dialog offen
  var v = curView(), row = v && rowOf(v);
  if (!row) return;                                          // Eintrag & Co.
  var el = e.target;
  if (el.closest && el.closest(SKIP)) return;
  if (hScroll(el)) return;
  var t = e.touches[0];
  s0 = { x: t.clientX, y: t.clientY, t: Date.now(), lock: null, dx: 0, v: v, row: row,
         el: document.getElementById("view-" + v), fixed: null };
}

function onMove(e) {
  if (!s0) return;
  if (e.touches.length !== 1) { cancel(); return; }
  var t = e.touches[0], dx = t.clientX - s0.x, dy = t.clientY - s0.y;
  if (!s0.lock) {
    if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
    s0.lock = (Date.now() - s0.t < HOLD && Math.abs(dx) > 1.2 * Math.abs(dy)) ? "h" : "v";
    if (s0.lock === "v") { s0 = null; return; }
    document.body.classList.add("sw-on");
    s0.fixed = hideFixed(s0.el);
  }
  var i = s0.row.indexOf(s0.v);
  if ((dx > 0 && i === 0) || (dx < 0 && i === s0.row.length - 1)) dx = dx / 3;   // Widerstand am Rand
  s0.dx = dx;
  s0.el.style.transition = "none";
  s0.el.style.transform = "translateX(" + dx + "px)";
  if (e.cancelable) e.preventDefault();
}

function cancel() {
  if (!s0) return;
  var g = s0;
  s0 = null;
  if (g.lock !== "h") return;
  g.el.style.transition = "transform .2s ease-out";
  g.el.style.transform = "";
  setTimeout(function () { reset(g.el, g.fixed); }, 220);
}

function onEnd() {
  if (!s0) return;
  if (s0.lock !== "h") { s0 = null; return; }
  var g = s0, dx = g.dx, W = window.innerWidth;
  var v = Math.abs(dx) / Math.max(1, Date.now() - g.t);
  var i = g.row.indexOf(g.v), n = i + (dx < 0 ? 1 : -1);
  if ((Math.abs(dx) > W * SNAP || v > FLING) && n >= 0 && n < g.row.length && Math.abs(dx) > MIN) {
    s0 = null; busy = true;
    g.el.style.transition = "transform .16s ease-in";
    g.el.style.transform = "translateX(" + (dx < 0 ? -W : W) + "px)";
    setTimeout(function () {
      reset(g.el, g.fixed);
      document.body.classList.add("sw-on");
      window.showView(g.row[n]);
      (window.tlScrollTop || function () { window.scrollTo(0, 0); })();
      var nv = document.getElementById("view-" + g.row[n]);
      if (nv) {
        nv.classList.remove("sw-in-l", "sw-in-r");
        void nv.offsetWidth;
        nv.classList.add(dx < 0 ? "sw-in-l" : "sw-in-r");
        setTimeout(function () { nv.classList.remove("sw-in-l", "sw-in-r"); document.body.classList.remove("sw-on"); }, 200);
      } else document.body.classList.remove("sw-on");
      busy = false;
    }, 160);
  } else cancel();
}

function init() {
  app = document.getElementById("app");
  if (!app || typeof window.showView !== "function") return;
  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);
  app.addEventListener("touchstart", onStart, { passive: true });
  app.addEventListener("touchmove", onMove, { passive: false });
  app.addEventListener("touchend", onEnd, { passive: true });
  app.addEventListener("touchcancel", cancel, { passive: true });
  window.tlSwipe = { HOLD: HOLD, LOCK: LOCK };   // für Tests
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
