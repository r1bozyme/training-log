/* ═══════════════════════════════════════════════════
   werte.js – gemeinsamer Aufbau des Werte-Tabs (13.11.2026)

   Werkzeuge für einheitliche Karten im Werte-Tab (Mockup
   „Werte-Tab – vereinheitlicht“). Die Inhalte liefern die Module
   (daily.js, später Gewicht und InBody), hier liegen nur:
     • Bedienzustand: aufgeklappte Abschnitte und Zeitraum 1M/3M/Alles,
       gemerkt unter "tlui-werte" (bewusst kein tl-*-Key: gehört nicht
       ins Backup und löst keinen Sync aus), dazu sitzungsweise
       „✎ bearbeiten“ und angetippte Kurzzeilen
     • graph(): Verlauf mit Tageswert (grau) und Ø 7 Tage, abtastbar
       per Gedrückthalten (scrub.js)
     • ma7(): gleitender Schnitt über die letzten 7 Kalendertage

   Lädt vor daily.js.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var KEY = "tlui-werte";
var sess = { edit: {}, show: {} };   // nur für diese Sitzung

function st() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* privat/voll – egal */ } }
function rebuild() { if (typeof window.buildDaily === "function") window.buildDaily(); }

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function dnum(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function dm(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function f1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); }

/* ─── Bedienzustand ─────────────────────────────── */
function isMore(k) { return !!(st().more || {})[k]; }
function more(k) { var s = st(); s.more = s.more || {}; s.more[k] = !s.more[k]; save(s); rebuild(); }

function range() { var r = st().range; return r === 30 || r === 90 || r === 0 ? r : 90; }
function setRange(d) {
  var s = st(); s.range = d; save(s);
  if (typeof window.setWRange === "function") window.setWRange(d);   // Gewichtsgraph (index.html)
  rebuild();
}

function isEdit(k) { return !!sess.edit[k]; }
function edit(k, on) { sess.edit[k] = on === undefined ? !sess.edit[k] : !!on; rebuild(); }
function isShown(k) { return !!sess.show[k]; }
function show(k) { sess.show[k] = true; rebuild(); }
function showEdit(k) { sess.show[k] = true; sess.edit[k] = true; rebuild(); }   // Zeile aufklappen und gleich Eingabe öffnen

/* ─── Ø 7 Tage ──────────────────────────────────── */
/* vals: { "2026-11-13": 1, … } → Schnitt der Werte in [d−6, d], null ohne Wert */
function ma7(vals, d) {
  var s = 0, n = 0;
  for (var i = 0; i < 7; i++) {
    var v = vals[addDays(d, -i)];
    if (typeof v === "number") { s += v; n++; }
  }
  return n ? s / n : null;
}

/* ─── Graph ─────────────────────────────────────── */
/* o.series: [{ vals, kind: "raw" | "avg", color, width, dash, name }]
   o.end: letzter Tag (ISO), o.days: Tage (0 = ab erstem Wert), o.unit: Text hinter dem Wert */
function graph(o) {
  var W = 310, H = 110, X0 = 26, X1 = 304, Y0 = 92, Y1 = 14;
  var first = null;
  o.series.forEach(function (s) {
    Object.keys(s.vals).forEach(function (k) { if (typeof s.vals[k] === "number" && (!first || k < first)) first = k; });
  });
  if (!first) return "";
  var start = o.days ? addDays(o.end, -(o.days - 1)) : first;
  if (start < first) start = first;   // Zeitraum länger als die Daten: ab erstem Wert
  var n = dnum(o.end) - dnum(start);
  if (n < 1) return "";
  var days = []; for (var i = 0; i <= n; i++) days.push(addDays(start, i));

  /* Linien vorbereiten */
  var lines = o.series.map(function (s) {
    return days.map(function (d) {
      var v = s.kind === "avg" ? ma7(s.vals, d) : s.vals[d];
      return typeof v === "number" ? v : null;
    });
  });
  var hi = 0;
  lines.forEach(function (l) { l.forEach(function (v) { if (v !== null && v > hi) hi = v; }); });
  var max = Math.max(o.minMax || 4, Math.ceil(hi / 2) * 2);
  var x = function (i) { return X0 + i * (X1 - X0) / n; };
  var y = function (v) { return Y0 - (v / max) * (Y0 - Y1); };

  var svg = "";
  [0, max / 2, max].forEach(function (t) {
    svg += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="#EEEEEE"/>' +
           '<text x="' + (X0 - 5) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#8A8A8A" font-family="Figtree,sans-serif">' + String(t).replace(".", ",") + '</text>';
  });
  lines.forEach(function (l, si) {
    var s = o.series[si], seg = [], segs = [];
    l.forEach(function (v, i) {
      if (v === null) { if (seg.length) segs.push(seg); seg = []; }
      else seg.push(x(i).toFixed(1) + "," + y(v).toFixed(1));
    });
    if (seg.length) segs.push(seg);
    segs.forEach(function (p) {
      if (p.length === 1) { svg += '<circle cx="' + p[0].split(",")[0] + '" cy="' + p[0].split(",")[1] + '" r="1.6" fill="' + s.color + '"/>'; return; }
      svg += '<polyline points="' + p.join(" ") + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.width || 2.5) + '"' +
             (s.dash ? ' stroke-dasharray="5 3"' : "") + ' stroke-linecap="round" stroke-linejoin="round"/>';
    });
  });
  /* Endpunkt der ersten Ø-Linie */
  var ai = -1;
  o.series.forEach(function (s, si) { if (ai < 0 && s.kind === "avg") ai = si; });
  if (ai >= 0 && lines[ai][n] !== null) svg += '<circle cx="' + x(n).toFixed(1) + '" cy="' + y(lines[ai][n]).toFixed(1) + '" r="3.5" fill="' + o.series[ai].color + '"/>';
  svg += '<text x="' + X0 + '" y="107" font-size="9" fill="#8A8A8A" font-family="Figtree,sans-serif">' + dm(start) + '</text>' +
         '<text x="' + X1 + '" y="107" text-anchor="end" font-size="9" fill="#8A8A8A" font-family="Figtree,sans-serif">' + dm(o.end) + '</text>';

  /* Abtasten */
  var pts = [];
  days.forEach(function (d, i) {
    var ys = lines.map(function (l) { return l[i] === null ? null : y(l[i]); });
    if (ys.every(function (v) { return v === null; })) return;
    var parts = o.series.map(function (s, si) {
      return lines[si][i] === null ? null : (s.name ? s.name + " " : "") + f1(lines[si][i]);
    }).filter(Boolean);
    pts.push({ x: x(i), y: ys, c: o.series.map(function (s) { return s.color; }), v: parts.join(" · "), t: dm(d) + d.slice(0, 4) });
  });
  var attr = typeof window.scrubAttr === "function" && pts.length ? window.scrubAttr(pts) : "";

  return '<svg class="wt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || "Verlauf") + '"' + attr + '>' + svg + '</svg>';
}

function legend(items) {
  return '<div class="wt-leg">' + items.map(function (it) {
    return '<span><i style="background:' + it[1] + '"></i>' + it[0] + '</span>';
  }).join("") + '</div>';
}

function rangeRow() {
  var r = range();
  return [[30, "1M"], [90, "3M"], [0, "Alles"]].map(function (p) {
    return '<button type="button" class="' + (r === p[0] ? "on" : "") + '" onclick="tlWerte.setRange(' + p[0] + ')">' + p[1] + '</button>';
  }).join("");
}

/* ─── CSS ───────────────────────────────────────── */
var CSS = [
  ".wt-date { display:flex; align-items:center; justify-content:space-between; margin:14px 12px 0; }",
  ".wt-date > button { width:44px; height:44px; border:none; background:transparent; font-size:22px; color:var(--muted); cursor:pointer; }",
  ".wt-date > button:disabled { color:var(--dim); cursor:default; }",
  ".wt-dt { position:relative; font-family:var(--fd); font-size:21px; letter-spacing:1px; color:var(--text); padding:6px 4px; white-space:nowrap; }",
  ".wt-dt.past { color:#2F5D8A; }",
  ".wt-dt input { position:absolute; inset:0; width:100%; height:100%; opacity:0; margin:0; padding:0; border:none; cursor:pointer; }",
  ".wt-range { display:flex; justify-content:flex-end; gap:6px; margin:14px 20px 0; }",
  ".wt-range button { padding:7px 14px; border-radius:16px; border:1.5px solid var(--border); background:transparent; color:var(--muted); font-family:var(--fb); font-size:12px; font-weight:700; cursor:pointer; }",
  ".wt-range button.on { background:var(--text); border-color:var(--text); color:#FFF; }",
  ".wt-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; margin:12px 20px 0; }",
  ".wt-hd { display:flex; align-items:baseline; gap:10px; }",
  ".wt-lbl { flex:1; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--muted); }",
  ".wt-k { text-align:right; }",
  ".wt-kv { font-family:var(--fd); font-size:26px; line-height:1; color:var(--text); }",
  ".wt-ks { font-size:11px; font-weight:700; color:var(--muted); margin:0 1px 0 8px; }",
  ".wt-ks:first-child { margin-left:0; }",
  ".wt-kd { font-size:12px; font-weight:700; color:var(--muted); margin-left:4px; }",
  ".wt-kd.good { color:#2A7A2A; } .wt-kd.warn { color:#B33A3A; }",
  ".wt-sub { font-size:11px; color:var(--muted); margin-top:2px; }",
  ".wt-today { display:flex; align-items:center; gap:10px; margin-top:12px; padding:6px 4px 6px 12px; background:var(--bg); border-radius:10px; min-height:36px; }",
  ".wt-tl { font-size:12px; font-weight:600; color:var(--muted); flex-shrink:0; }",
  ".wt-tv { flex:1; font-size:14px; font-weight:700; color:var(--text); }",
  ".wt-tv.dim { color:var(--muted); font-weight:600; }",
  ".wt-ed { width:44px; height:36px; border:none; background:transparent; font-size:16px; color:var(--muted); cursor:pointer; flex-shrink:0; }",
  ".wt-in { margin-top:12px; }",
  ".wt-done { display:block; width:100%; margin-top:10px; padding:10px 0; border-radius:10px; border:1.5px solid var(--border); background:transparent; font-family:var(--fb); font-weight:700; font-size:12px; color:var(--muted); cursor:pointer; }",
  ".wt-chart { display:block; width:100%; height:auto; margin-top:12px; }",
  ".wt-leg { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:10.5px; color:var(--muted); margin-top:4px; }",
  ".wt-leg i { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; }",
  ".wt-more { display:flex; justify-content:space-between; align-items:center; width:100%; margin-top:10px; padding:10px 0 0; border:none; border-top:1px solid var(--border); background:transparent; font-family:var(--fb); font-size:12px; font-weight:600; color:var(--muted); cursor:pointer; text-align:left; }",
  ".wt-more.open { color:var(--text); }",
  ".wt-mini { display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin:12px 20px 0; cursor:pointer; }",
  ".wt-mv { font-size:12px; color:var(--muted); font-weight:600; }",
  ".wt-mv.warn { color:#9A6410; font-weight:700; }",
  ".wt-mini > span:last-child { color:var(--dim); }",
  ".wt-mplus { width:40px; height:32px; margin:-6px -6px -6px 0; border:1.5px solid var(--border); border-radius:10px; background:transparent; font-size:16px; color:var(--text); cursor:pointer; flex-shrink:0; }",
  ".wt-grid { display:grid; grid-template-columns:38px repeat(7, minmax(0,1fr)) 66px; gap:4px; align-items:center; margin-top:12px; }",
  ".wt-c { height:24px; border-radius:5px; background:var(--bg); border:1px solid var(--border); box-sizing:border-box; }",
  ".wt-c.hit { background:#4FA34F; border-color:#4FA34F; } .wt-c.under { background:#E8A33D; border-color:#E8A33D; } .wt-c.over { background:#D96A6A; border-color:#D96A6A; }",
  ".wt-c.est { border:2px dashed var(--text); } .wt-c.trip { box-shadow:inset 0 0 0 2px #2F5D8A; }",
  ".wt-c.fut { background:transparent; border:1px dashed var(--border); }",
  ".wt-c.sel { outline:2px solid var(--text); outline-offset:1px; }",
  ".wt-wk { font-size:11px; font-weight:600; color:var(--muted); white-space:nowrap; }",
  ".wt-wk.c { text-align:center; } .wt-wk.good { color:#2A7A2A; } .wt-wk.warn { color:#9A6410; }",
  /* Gewicht: Zeitraum kommt von oben (Push 2 baut die Karte um) */
  "#weight-cont .wrange { display:none; }"
].join("\n");

var s = document.createElement("style");
s.textContent = CSS;
document.head.appendChild(s);

window.tlWerte = {
  isMore: isMore, more: more,
  range: range, setRange: setRange, rangeRow: rangeRow,
  isEdit: isEdit, edit: edit, isShown: isShown, show: show, showEdit: showEdit,
  ma7: ma7, graph: graph, legend: legend,
  addDays: addDays, dm: dm, f1: f1
};
})();
