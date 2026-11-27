/* ═══════════════════════════════════════════════════
   abw.js – Abweichungsstreifen „Alles auf einen Blick“ (27.11.2026)

   Eine Karte oben in Körper › Tracker: je Wert eine Zeile, je Tag eine
   Spalte. Die Farbe zeigt, wie weit der Wert vom eigenen Normal abweicht –
   rot = schlechter, grün = besser, grau = im Normalbereich. So sieht man
   auf einen Blick, wann sich viele Werte gemeinsam in eine Richtung bewegen
   (Partynacht, Impfung, Infekt).

   NORMAL je Zeile: Median und MAD (robuste Streuung) aller Tage bis zum
   Ende des Zeitraums, höchstens 60 Tage zurück, ohne markierte Nächte
   („Letzte Nacht“: alk/spaet/krank = diese Nacht, krank auch die nächste,
   impf diese und die drei danach – wie im Frühindikator). So verschiebt
   ein Ausreißer das Normal nicht.
   Abweichung z = Richtung · (Wert − Median) / max(1,4826·MAD, Mindeststreuung).
   |z| < 1 gilt als normal (sonst färbt das Tagesrauschen), Sättigung bei 2,5.
   Temperatur nur einseitig (nur „höher“ ist ein Signal).

   Zeilen: Readiness, Schlaf-Score, Schlaf, HRV, Ruhepuls (tl-d, Oura),
   Temperatur (oura/data.json, Feld temp), Steifigkeit (rate) und Daumen
   (max hgL/hgR) aus dem Werte-Tab.

   Zeitraum 1M/3M/Alles wie im Werte-Tab, frühestens ab Ring-Start.
   Oben die Ereignisse (Symbole aus ereignis.js) und Reisetage (blauer
   Strich). Abtastbar per Gedrückthalten (scrub.js, gekoppelt mit den
   Oura-Karten darunter); zeichnet Ereignisse selbst (data-noev).

   Aufgerufen von oura.js (render). Aufklappzustand unter "tlui-werte"
   (Zweig ou.abw), nicht im Backup. Keine eigenen Keys.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var ROWS = [
  { k: "ready",    l: "Readiness",    dir: 1,  min: 3 },
  { k: "sscore",   l: "Schlaf-Score", dir: 1,  min: 3 },
  { k: "sleepMin", l: "Schlaf",       dir: 1,  min: 20 },
  { k: "hrv",      l: "HRV",          dir: 1,  min: 3 },
  { k: "rhr",      l: "Ruhepuls",     dir: -1, min: 1 },
  { k: "temp",     l: "Temperatur",   dir: -1, min: 0.1, one: 1 },
  { k: "rate",     l: "Steifigkeit",  dir: -1, min: 1 },
  { k: "hg",       l: "Daumen",       dir: -1, min: 1 }
];
var BASE_DAYS = 60;

function pad(n) { return (n < 10 ? "0" : "") + n; }
function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function dnum(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function dm(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function num(v) { return typeof v === "number" && !isNaN(v); }
function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function ui() { try { return JSON.parse(ls("tlui-werte")) || {}; } catch (e) { return {}; } }
function isOpen() { var o = ui().ou || {}; return o.abw === undefined ? true : !!o.abw; }

function median(a) {
  var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Werte je Tag: { "2026-11-23": { ready, …, temp, rate, hg }, … } */
function sammeln(ouraDays) {
  var by = {}, arr;
  try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { arr = []; }
  arr.forEach(function (d) {
    if (!d || !d.date) return;
    var r = by[d.date] = by[d.date] || {};
    ["ready", "sscore", "sleepMin", "hrv", "rhr", "rate"].forEach(function (k) { if (num(d[k])) r[k] = d[k]; });
    if (num(d.hgL) || num(d.hgR)) r.hg = Math.max(num(d.hgL) ? d.hgL : -1, num(d.hgR) ? d.hgR : -1);
  });
  Object.keys(ouraDays || {}).forEach(function (k) {
    var o = ouraDays[k];
    if (o && num(o.temp)) { by[k] = by[k] || {}; by[k].temp = o.temp; }
  });
  return by;
}

/* Tage, die nicht ins Normal eingehen */
function ausnahmen() {
  var ev = window.tlEv ? window.tlEv.map() : {}, out = {};
  Object.keys(ev).forEach(function (d) {
    var n = ev[d] === "impf" ? 3 : ev[d] === "krank" ? 1 : 0;
    for (var i = 0; i <= n; i++) out[addDays(d, i)] = 1;
  });
  return out;
}

function normal(by, end, aus) {
  var von = addDays(end, -(BASE_DAYS - 1)), nm = {};
  ROWS.forEach(function (r) {
    var v = [];
    Object.keys(by).forEach(function (d) { if (d >= von && d <= end && !aus[d] && num(by[d][r.k])) v.push(by[d][r.k]); });
    if (v.length < 5) return;
    var m = median(v), mad = median(v.map(function (x) { return Math.abs(x - m); }));
    nm[r.k] = { m: m, s: Math.max(1.4826 * mad, r.min), n: v.length };
  });
  return nm;
}

function zOf(r, nm, v) {
  if (!nm || !num(v)) return null;
  var z = r.dir * (v - nm.m) / nm.s;
  if (r.one && z > 0) z = 0;
  return Math.max(-2.5, Math.min(2.5, z));
}

function fmt(k, v) {
  if (k === "sleepMin") { v = Math.round(v); return Math.floor(v / 60) + ":" + pad(v % 60) + " h"; }
  if (k === "temp") return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2).replace(".", ",") + " °C";
  if (k === "hrv") return Math.round(v) + " ms";
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

function streifen(by, nm, start, end) {
  var W = 310, X0 = 70, X1 = 304, TOP = 16, RH = 12, GAP = 2;
  var n = dnum(end) - dnum(start) + 1;
  var cw = (X1 - X0) / n, H = TOP + ROWS.length * (RH + GAP) + 14;
  var font = ' font-size="9" fill="var(--ch-lbl)" font-family="Figtree,sans-serif"';
  var svg = "", pts = [], i, d;
  var ev = window.tlEv ? window.tlEv.map() : {}, ic = window.tlEv ? window.tlEv.icon : {};

  ROWS.forEach(function (r, ri) {
    var y = TOP + ri * (RH + GAP);
    svg += '<text x="' + (X0 - 6) + '" y="' + (y + 9) + '" text-anchor="end"' + font + '>' + r.l + '</text>';
  });
  for (i = 0, d = start; i < n; i++, d = addDays(d, 1)) {
    var x = X0 + i * cw, cx = x + cw / 2, row = by[d] || {}, bad = [], good = 0;
    ROWS.forEach(function (r, ri) {
      var y = TOP + ri * (RH + GAP), z = zOf(r, nm[r.k], row[r.k]), fill, op = 1;
      if (z === null) fill = "none";
      else if (Math.abs(z) < 1) fill = "var(--ch-grid)";
      else {
        fill = z < 0 ? "var(--bad)" : "var(--go-dot)";
        op = Math.min(0.95, 0.3 + 0.45 * (Math.abs(z) - 1));
        if (z < 0) bad.push({ r: r, z: z, v: row[r.k] }); else good++;
      }
      if (fill === "none") svg += '<rect x="' + (x + 0.5).toFixed(1) + '" y="' + y + '" width="' + Math.max(cw - 1, 0.6).toFixed(1) + '" height="' + RH + '" rx="1.5" fill="none" stroke="var(--ch-grid)" stroke-width="0.6"/>';
      else svg += '<rect x="' + (x + 0.5).toFixed(1) + '" y="' + y + '" width="' + Math.max(cw - 1, 0.6).toFixed(1) + '" height="' + RH + '" rx="1.5" fill="' + fill + '"' + (op < 1 ? ' fill-opacity="' + op.toFixed(2) + '"' : "") + '/>';
    });
    if (window.tlEv && window.tlEv.trip(d)) svg += '<rect x="' + x.toFixed(1) + '" y="' + (TOP - 4) + '" width="' + cw.toFixed(1) + '" height="2" fill="var(--blue)"/>';
    if (ev[d]) svg += '<text x="' + cx.toFixed(1) + '" y="' + (TOP - 6) + '" text-anchor="middle" font-size="8">' + ic[ev[d]] + '</text>';

    var any = ROWS.some(function (r) { return num(row[r.k]); });
    if (any) {
      bad.sort(function (a, b) { return a.z - b.z; });
      pts.push({
        x: cx, y: [], d: d,
        v: bad.length ? bad.length + (bad.length === 1 ? " Wert" : " Werte") + " schlechter als normal" : good ? "unauffällig · " + good + " besser" : "unauffällig",
        t: dm(d) + d.slice(0, 4) + (bad.length ? " · " + bad.slice(0, 2).map(function (b) { return b.r.l + " " + fmt(b.r.k, b.v); }).join(", ") : "")
      });
    }
  }
  svg += '<text x="' + X0 + '" y="' + (H - 2) + '"' + font + '>' + dm(start) + '</text>'
       + '<text x="' + X1 + '" y="' + (H - 2) + '" text-anchor="end"' + font + '>' + dm(end) + '</text>';
  var attr = typeof window.scrubAttr === "function" && pts.length ? window.scrubAttr(pts) : "";
  return '<svg class="wt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Abweichungen vom Normal" data-noev="1"' + attr + '>' + svg + '</svg>';
}

/* ouraStart: erster Tag mit dem Ring (oura.js) */
function card(ouraDays, ouraStart) {
  var by = sammeln(ouraDays);
  var keys = Object.keys(by).filter(function (d) { return d >= ouraStart; }).sort();
  if (keys.length < 3) return "";
  var end = keys[keys.length - 1];
  var range = window.tlWerte ? window.tlWerte.range() : 30;
  var start = range ? addDays(end, -(range - 1)) : ouraStart;
  if (start < ouraStart) start = ouraStart;
  var aus = ausnahmen(), nm = normal(by, end, aus);

  /* Kennzahl: letzter Tag – wie viele Werte schlechter als normal */
  var last = by[end] || {}, nBad = 0, nAll = 0;
  ROWS.forEach(function (r) { var z = zOf(r, nm[r.k], last[r.k]); if (z !== null) { nAll++; if (z <= -1) nBad++; } });

  if (!isOpen()) {
    return '<div class="wt-mini" onclick="abwFold()"><div class="wt-lbl">Alles auf einen Blick</div>'
         + '<div class="wt-mv' + (nBad >= 3 ? " warn" : "") + '">' + dm(end) + ' · ' + nBad + ' von ' + nAll + ' schlechter</div><span>▸</span></div>';
  }
  return '<div class="wt-card">'
    + '<div class="wt-hd"><button type="button" class="wt-lbl wt-fold" onclick="abwFold()">Alles auf einen Blick <span>▾</span></button><div class="wt-k">'
    + '<span class="wt-kv">' + nBad + '<span class="wt-ks" style="margin-left:4px">/ ' + nAll + '</span></span>'
    + '<div class="wt-sub">schlechter als normal · ' + dm(end) + '</div></div></div>'
    + streifen(by, nm, start, end)
    + '<div class="wt-leg"><span><i style="background:var(--bad)"></i>schlechter</span><span><i style="background:var(--go-dot)"></i>besser</span>'
    + '<span><i style="background:var(--ch-grid)"></i>normal</span><span><i style="background:var(--blue)"></i>Reise</span></div>'
    + '<div class="ou-cmp">Normal = Median der letzten ' + BASE_DAYS + ' Tage ohne markierte Nächte, je Wert. Gedrückt halten zeigt den Tag in allen Graphen.</div>'
    + '</div>';
}

window.abwFold = function () {
  var s = ui(); s.ou = s.ou || {}; s.ou.abw = !isOpen();
  try { localStorage.setItem("tlui-werte", JSON.stringify(s)); } catch (e) {}
  if (window.tlOura) window.tlOura.render();
};
window.tlAbw = { card: card };
})();
