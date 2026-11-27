/* ═══════════════════════════════════════════════════
   ereignis.js – Ereignisse in allen Verlaufsgraphen (27.11.2026)

   Die Schalter „Letzte Nacht“ (daily.js, Feld aus in tl-d: alk / spaet /
   impf / krank) erscheinen in jedem Verlaufsgraphen als dünne gestrichelte
   Linie mit Symbol oben. Reisetage (tl-d trip bzw. tlReise.aktivAm) als
   hellblaues Band im Hintergrund.

   Datum: aus gilt für die Nacht VOR dem Datum (Oura-Konvention, Tag des
   Aufwachens). Der Marker sitzt also am Aufwachtag – dort, wo Schlaf, HRV,
   Ruhepuls, Readiness und Steifigkeit die Nacht zeigen.

   ZUSAMMENSPIEL: Kein Graph muss etwas dafür tun außer dem Feld d (JJJJ-MM-TT)
   in seinen scrub.js-Punkten (data-scrub). Aus den Punkten mit d wird die
   x-Position jedes Tages linear bestimmt (alle Graphen sind zeitlinear),
   auch für Tage ohne Messwert. Ein MutationObserver bearbeitet neu
   gezeichnete Graphen einmal (data-ev="1"). Graphen mit data-noev (z. B.
   der Abweichungsstreifen, abw.js) zeichnen Ereignisse selbst.
   Optional data-py="oben,unten" (viewBox-y) für die Höhe der Linie.

   window.tlEv.at(date) → { k, l, i } oder null (scrub.js hängt das
   Ereignis an die Nebenzeile des Tooltips). tlEv.map() / tlEv.trip(date)
   für abw.js.

   Keine eigenen Keys, liest nur tl-d.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var ICON = { alk: "🍷", spaet: "🌙", impf: "💉", krank: "🤒" };
var LBL  = { alk: "Alkohol", spaet: "Spät", impf: "Impfung", krank: "Krank" };
var NS = "http://www.w3.org/2000/svg";

var cache = null, cacheAt = 0;
function days() {
  /* tl-d höchstens alle 500 ms neu lesen – der Observer feuert in Schüben */
  if (cache && Date.now() - cacheAt < 500) return cache;
  var arr; try { arr = JSON.parse(localStorage.getItem("tl-d") || "[]"); } catch (e) { arr = []; }
  var ev = {}, trip = {};
  arr.forEach(function (d) {
    if (!d || !d.date) return;
    if (d.aus && ICON[d.aus]) ev[d.date] = d.aus;
    if (d.trip) trip[d.date] = 1;
  });
  cache = { ev: ev, trip: trip }; cacheAt = Date.now();
  return cache;
}
function isTrip(date) {
  if (days().trip[date]) return true;
  return !!(window.tlReise && window.tlReise.aktivAm && window.tlReise.aktivAm(date));
}
function at(date) {
  var k = days().ev[date];
  return k ? { k: k, l: LBL[k], i: ICON[k] } : null;
}

function pad(n) { return (n < 10 ? "0" : "") + n; }
function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function dnum(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }

function el(tag, attrs) {
  var e = document.createElementNS(NS, tag);
  Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}

/* Zeitachse aus den Punkten: x = a + (Tag − d0) · s */
function achse(svg) {
  var pts; try { pts = JSON.parse(svg.getAttribute("data-scrub")); } catch (e) { return null; }
  if (!Array.isArray(pts)) return null;
  var p = pts.filter(function (q) { return q && q.d && typeof q.x === "number"; });
  if (p.length < 2) return null;
  var a = p[0], b = p[p.length - 1], n = dnum(b.d) - dnum(a.d);
  if (n < 1) return null;
  return { d0: a.d, d1: b.d, x0: a.x, s: (b.x - a.x) / n };
}

function zeichnen(svg) {
  svg.setAttribute("data-ev", "1");
  if (svg.hasAttribute("data-noev")) return;
  if ((svg.getAttribute("preserveAspectRatio") || "").indexOf("none") === 0) return;   // gestauchte Sparklines
  var ax = achse(svg);
  if (!ax) return;
  var vb = svg.viewBox.baseVal;
  var py = (svg.getAttribute("data-py") || "").split(",").map(Number);
  var top = py.length === 2 && !isNaN(py[0]) ? py[0] : vb.y + vb.height * 0.12;
  var bot = py.length === 2 && !isNaN(py[1]) ? py[1] : vb.y + vb.height * 0.84;
  var w = Math.max(ax.s, 1.5);
  var D = days();

  /* Reise: zusammenhängende Tage als ein Band, ganz hinten */
  var band = null, first = svg.firstChild;
  for (var d = ax.d0; d <= ax.d1; d = addDays(d, 1)) {
    var x = ax.x0 + (dnum(d) - dnum(ax.d0)) * ax.s;
    if (isTrip(d)) {
      if (!band) {
        band = el("rect", { x: (x - w / 2).toFixed(1), y: top.toFixed(1), width: w.toFixed(1), height: (bot - top).toFixed(1),
                            fill: "var(--blue)", "fill-opacity": "0.09", "class": "ev-trip" });
        svg.insertBefore(band, first);
      } else {
        band.setAttribute("width", (x + w / 2 - parseFloat(band.getAttribute("x"))).toFixed(1));
      }
    } else band = null;
  }

  /* Ereignisse: Linie + Symbol */
  Object.keys(D.ev).forEach(function (date) {
    if (date < ax.d0 || date > ax.d1) return;
    var x = (ax.x0 + (dnum(date) - dnum(ax.d0)) * ax.s).toFixed(1);
    /* über den Daten (Hintergrund-Bänder wie im Frühindikator würden sie verdecken), dafür dünn */
    svg.appendChild(el("line", { x1: x, x2: x, y1: top.toFixed(1), y2: bot.toFixed(1), stroke: "var(--amb)",
      "stroke-width": "1.2", "stroke-opacity": "0.8", "stroke-dasharray": "2 2", "class": "ev-ln" }));
    var t = el("text", { x: x, y: Math.max(vb.y + 9, top - 2).toFixed(1), "text-anchor": "middle", "font-size": "9", "class": "ev-ic" });
    t.textContent = ICON[D.ev[date]];
    svg.appendChild(t);
  });
}

function alle() {
  var list = document.querySelectorAll("svg[data-scrub]:not([data-ev])");
  for (var i = 0; i < list.length; i++) {
    try { zeichnen(list[i]); } catch (e) { setTimeout(function () { throw e; }); }   // → diag.js
  }
}

var plan = false;
function bald() {
  if (plan) return;
  plan = true;
  (window.requestAnimationFrame || setTimeout)(function () { plan = false; alle(); });
}

window.tlEv = { at: at, map: function () { return days().ev; }, trip: isTrip, icon: ICON, label: LBL };

function init() {
  var root = document.getElementById("app") || document.body;
  new MutationObserver(bald).observe(root, { childList: true, subtree: true });
  /* Schalter „Letzte Nacht“ geändert → Cache verwerfen (Neuzeichnen macht daily.js) */
  var setAus = window.setAus;
  if (typeof setAus === "function" && !setAus._ev) {
    window.setAus = function () { cache = null; return setAus.apply(this, arguments); };
    window.setAus._ev = 1;
  }
  bald();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
