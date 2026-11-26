/* ═══════════════════════════════════════════════════
   oura.js – Oura-Ring, Körper → Tracker (05.11.2026)

   Liest oura/data.json aus dem privaten Daten-Repo (geschrieben vom
   Workflow "oura" in training-log-data, 2x täglich + nach jedem
   reminders-Lauf). Kein eigenes Token in der App: der Abruf läuft
   über window.tlSync.get, also mit dem Backup-Token aus sync.js.

   MODUS (data.mode, gesetzt von oura/fetch.js)
     sandbox → nur Vorschau mit Testdaten, NICHTS wird gespeichert.
     live    → Werte wandern in tl-d: steps, sleepMin, rhr, hrv, ready
               (Readiness) und sscore (Schlaf-Score). Damit laufen sie
               über sync.js ins Backup und in export.csv.

   16.11.: Google Health (ghealth.js) ist entfernt. Die Ansicht "health"
   (Körper → Tracker) legt jetzt diese Datei an; die alten Schlüssel
   tl-ghc/tl-ght/tl-ghs werden beim Start gelöscht. Schritte vor dem
   05.11. in tl-d stammen noch vom Handy über Google Health.

   Definitionen (Oura):
     sleepMin = total_sleep_duration des Hauptschlafs (Aufwachtag)
     rhr      = niedrigster Nachtpuls (Ouras "Ruhepuls")
     hrv      = Ø rMSSD der Nacht in ms
   Readiness/HRV-Einordnung brauchen bei Oura ca. 2 Wochen Basislinie.

   Unten rechts "In Oura öffnen ↗" (05.11.): Android-Intent auf com.ouraring.oura.

   KARTEN (16.11.): je Wert eine Karte im Aufbau des Werte-Tabs (werte.js):
   Ø 7 Tage als Linie, Tageswerte als Punkte – gefüllt nach einem
   Trainingstag, hohl nach einem Ruhetag (Trainingstage aus tl-e; bei den
   Nachtwerten zählt das Training am Vortag, bei Schritten der Tag selbst).
   Zeitraum 1M/3M/Alles ist derselbe wie im Werte-Tab. Aufklappzustand
   unter "tlui-werte" (Zweig ou), nicht im Backup.

   SCHRITTE (18.11.): Karten und Tabelle zeigen erst ab OURA_START
   (05.11.2026) – davor lagen Handy-Schritte aus Google Health in tl-d.

   TABELLE „Letzte 7 Tage“ (26.11.): eingeklappt, Zustand unter
   "tlui-werte" (Zweig ou.tab) – die Werte stehen schon in den Karten.

   FRÜHINDIKATOR (26.11.): Karte unter den Oura-Karten kommt aus frueh.js
   (window.tlFrueh.card, liest temp/hrAvg direkt aus data.days).

   Keys: tl-oura (letzter Stand von data.json, Cache für Offline-Start).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var PATH = "oura/data.json";
var DAYS = 7, CMP_DAYS = 14;
var K_CACHE = "tl-oura";
/* Absprung in die Oura-App (Android-Intent; fehlt die App → Play Store) */
/* Schema "oura" (am 05.11. auf dem Handy getestet; die Launcher-Variante blockt Chrome) */
var APP_URL = "intent://#Intent;scheme=oura;package=com.ouraring.oura;"
            + "S.browser_fallback_url=" + encodeURIComponent("https://play.google.com/store/apps/details?id=com.ouraring.oura") + ";end";
var busy = false, lastErr = "", lastFetch = 0;
var data = null;

function ls(k)       { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function localDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function num(v) { return typeof v === "number" && !isNaN(v); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function flash(m) { if (typeof window.showFlash === "function") window.showFlash(m); }

try { data = JSON.parse(ls(K_CACHE) || "null"); } catch (e) { data = null; }

function isLive() { return !!(data && data.mode === "live"); }
function liveDays() { return isLive() && data.days ? Object.keys(data.days).length : 0; }
/* aktiv = live und schon echte Werte */
function active() { return liveDays() > 0; }

/* ─── Abruf ────────────────────────────────────── */
function syncReady() { return !!(window.tlSync && window.tlSync.ready && window.tlSync.ready()); }

function refresh(manual) {
  if (busy) return;
  if (!syncReady()) { lastErr = "Backup-Verbindung (Sync) ist nicht eingerichtet – darüber kommen die Oura-Daten."; render(); return; }
  busy = true; lastErr = ""; render();
  window.tlSync.get(PATH, { cache: "no-store", headers: { "Accept": "application/vnd.github.raw+json" } })
    .then(function (r) {
      if (r.status === 404) throw new Error("Noch keine Oura-Daten im Daten-Repo.");
      if (!r.ok) throw new Error("Oura-Daten: HTTP " + r.status);
      return r.json();
    })
    .then(function (j) {
      data = j || { days: {} };
      lsSet(K_CACHE, JSON.stringify(data));
      lastFetch = Date.now();
      if (isLive()) store();
      if (manual) flash("Oura aktualisiert ✓");
    })
    .catch(function (e) { lastErr = (e && e.message) || "Abruf fehlgeschlagen."; })
    .then(function () { busy = false; render(); });
}

/* Live-Werte in tl-d – nur bei Änderung schreiben (sonst stößt jeder Abruf ein Backup an) */
var MAP = { steps: "steps", sleepMin: "sleepMin", rhr: "rhr", hrv: "hrv", readiness: "ready", sleepScore: "sscore" };
function store() {
  var arr;
  try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { return; }
  var by = {}, changed = false, now = new Date().toISOString();
  arr.forEach(function (d, i) { by[d.date] = i; });
  Object.keys(data.days || {}).forEach(function (date) {
    var src = data.days[date], row;
    var vals = {};
    Object.keys(MAP).forEach(function (k) { if (num(src[k])) vals[MAP[k]] = src[k]; });
    if (!Object.keys(vals).length) return;
    if (by[date] != null) row = arr[by[date]];
    else {
      row = { date: date, kcal: null, est: false, trip: false, rate: null, ratedAt: null, stiff: null };
      arr.push(row); by[date] = arr.length - 1;
    }
    var rowChanged = false;
    Object.keys(vals).forEach(function (f) { if (row[f] !== vals[f]) { row[f] = vals[f]; rowChanged = true; } });
    if (rowChanged) { row.ouAt = now; changed = true; }
  });
  if (!changed) return;
  arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  localStorage.setItem("tl-d", JSON.stringify(arr));   // über sync.js-Hülle → Backup
}

/* ─── Daten für die Darstellung ────────────────── */
/* Felder wie in tl-d: steps, sleepMin, rhr, hrv, ready, sscore */
/* Erster Tag mit dem Ring. Ältere tl-d-Schritte stammen aus Google Health
   (Handy) und bleiben draußen, sonst mischt der Vergleich Training/Ruhe
   zwei Quellen (data.days reicht nur ~10 Tage zurück, taugt nicht als Grenze). */
var OURA_START = "2026-11-05";
function source() {
  var src = {};
  if (isLive()) {
    var arr; try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { arr = []; }
    arr.forEach(function (d) { if (!d || !d.date || d.date < OURA_START) return; src[d.date] = { steps: d.steps, sleepMin: d.sleepMin, rhr: d.rhr, hrv: d.hrv, ready: d.ready, sscore: d.sscore }; });
  } else if (data && data.days) {
    Object.keys(data.days).forEach(function (k) {
      var x = data.days[k];
      src[k] = { steps: x.steps, sleepMin: x.sleepMin, rhr: x.rhr, hrv: x.hrv, ready: x.readiness, sscore: x.sleepScore };
    });
  }
  return src;
}
function rows(n, src) {
  /* Sandbox: Testdaten liegen in der Vergangenheit → ab dem jüngsten Tag zählen */
  var d = new Date();
  if (!isLive()) {
    var keys = Object.keys(src).sort();
    if (keys.length) d = new Date(keys[keys.length - 1] + "T12:00:00");
  }
  var out = [];
  for (var i = 0; i < n; i++) {
    var s = localDate(d);
    out.push(Object.assign({ date: s }, src[s] || {}));
    d.setDate(d.getDate() - 1);
  }
  return out;
}
function avgOf(rs, f) {
  var v = rs.map(function (r) { return r[f]; }).filter(num);
  return v.length ? { a: v.reduce(function (x, y) { return x + y; }, 0) / v.length, n: v.length } : null;
}
function fmtSleep(m) { m = Math.round(m); return Math.floor(m / 60) + ":" + pad(m % 60) + " h"; }
function shortD(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return localDate(d); }
function dnum(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function fmtVal(f, v) {
  if (!num(v)) return "–";
  if (f === "steps") return v.toLocaleString("de-DE");
  if (f === "sleepMin") return fmtSleep(v);
  return String(Math.round(v));
}
function fmtTime(iso) {
  if (!iso) return "–";
  var d = new Date(iso);
  var today = localDate(new Date()) === localDate(d);
  return (today ? "heute" : shortD(localDate(d))) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/* Trainingstage aus dem Log (tl-e): jeder Tag mit mindestens einem Eintrag */
function trainDays() {
  var t = {}, arr;
  try { arr = JSON.parse(ls("tl-e") || "[]"); } catch (e) { arr = []; }
  arr.forEach(function (e) { if (e && e.date) t[e.date] = 1; });
  return t;
}

/* ─── Karten (16.11.) ──────────────────────────── */
/* night: Wert gehört zur Nacht, die an diesem Tag endet → "nach Training"
   heißt Training am Vortag. Schritte zählen für den Tag selbst.
   dec: Nachkommastellen der Ø-Werte. zu: Karte startet eingeklappt. */
var METR = [
  { f: "sleepMin", l: "Schlaf",       night: 1, dec: 0 },
  { f: "hrv",      l: "HRV",          night: 1, dec: 1, unit: " ms" },
  { f: "rhr",      l: "Ruhepuls",     night: 1, dec: 1, zu: 1 },
  { f: "ready",    l: "Readiness",    night: 1, dec: 0, zu: 1 },
  { f: "sscore",   l: "Schlaf-Score", night: 1, dec: 0, zu: 1 },
  { f: "steps",    l: "Schritte",     night: 0, dec: 0, zu: 1 }
];
var C_AVG = "var(--text)", C_PT = "var(--ch-lbl)";

/* Aufklappzustand: eigener Zweig in "tlui-werte" (kein tl-*-Key → nicht im Backup) */
function ui() { try { return JSON.parse(ls("tlui-werte")) || {}; } catch (e) { return {}; } }
function isOpen(m) { var o = ui().ou || {}; return o[m.f] === undefined ? !m.zu : !!o[m.f]; }
function range() { return window.tlWerte ? window.tlWerte.range() : 90; }

function fmtAvg(m, a) {
  if (a === null) return "–";
  if (m.f === "sleepMin") return fmtSleep(a);
  if (m.f === "steps") return Math.round(a).toLocaleString("de-DE");
  return a.toFixed(m.dec).replace(".", ",");
}
function fmtDelta(m, d) {
  var s = d >= 0 ? "+" : "−", a = Math.abs(d);
  if (m.f === "sleepMin") { a = Math.round(a); return s + Math.floor(a / 60) + ":" + pad(a % 60); }
  if (m.f === "steps") return s + Math.round(a).toLocaleString("de-DE");
  return s + a.toFixed(1).replace(".", ",");
}
/* Schnitt der Werte in [end−von, end−bis] */
function win(vals, end, von, bis) {
  var s = 0, n = 0;
  for (var i = bis; i <= von; i++) { var v = vals[addDays(end, -i)]; if (num(v)) { s += v; n++; } }
  return n ? { a: s / n, n: n } : null;
}
/* Achse: runde Grenzen, gerade Spanne → die Mitte ist auch ein runder Wert */
function axis(f, lo, hi) {
  var step = f === "steps" ? 1000 : f === "sleepMin" ? 30 : 1;
  var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  if (b - a < 4 * step && step === 1) { a -= 1; b += 1; }
  if (b - a < 2 * step) b = a + 2 * step;
  if (Math.round((b - a) / step) % 2) b += step;
  return { a: a, b: b, lab: function (v) {
    if (f === "steps") return (v / 1000).toString().replace(".", ",") + "k";
    if (f === "sleepMin") return Math.floor(v / 60) + ":" + pad(v % 60);
    return String(v);
  } };
}

/* Verlauf: Ø 7 Tage als Linie, Tageswerte als Punkte (Training gefüllt, Ruhe hohl) */
function chart(m, vals, isT, end, start) {
  var W = 310, H = 110, X0 = 30, X1 = 304, Y0 = 92, Y1 = 14;
  var n = dnum(end) - dnum(start);
  if (n < 1) return "";
  var days = [], raw = [], avg = [], lo = Infinity, hi = -Infinity, i;
  for (i = 0; i <= n; i++) {
    var d = addDays(start, i), v = num(vals[d]) ? vals[d] : null, w = win(vals, d, 6, 0);
    days.push(d); raw.push(v); avg.push(w ? w.a : null);
    [v, w ? w.a : null].forEach(function (x) { if (x !== null) { if (x < lo) lo = x; if (x > hi) hi = x; } });
  }
  if (lo === Infinity) return "";
  var ax = axis(m.f, lo, hi);
  var x = function (k) { return X0 + k * (X1 - X0) / n; };
  var y = function (v) { return Y0 - ((v - ax.a) / (ax.b - ax.a)) * (Y0 - Y1); };
  var font = ' font-size="9" fill="var(--ch-lbl)" font-family="Figtree,sans-serif"';

  var svg = "";
  [ax.a, (ax.a + ax.b) / 2, ax.b].forEach(function (t) {
    svg += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="var(--ch-grid)"/>'
         + '<text x="' + (X0 - 5) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end"' + font + '>' + ax.lab(t) + '</text>';
  });
  var seg = [];
  avg.forEach(function (v, k) { if (v !== null) seg.push(x(k).toFixed(1) + "," + y(v).toFixed(1)); });
  if (seg.length > 1) svg += '<polyline points="' + seg.join(" ") + '" fill="none" stroke="' + C_AVG + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  var r = n > 45 ? 1.9 : 2.8;
  raw.forEach(function (v, k) {
    if (v === null) return;
    svg += '<circle cx="' + x(k).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="' + r + '"'
         + (isT(days[k]) ? ' fill="' + C_PT + '" stroke="' + C_PT + '"' : ' fill="var(--surface)" stroke="' + C_PT + '"') + ' stroke-width="1.3"/>';
  });
  svg += '<text x="' + X0 + '" y="107"' + font + '>' + shortD(start) + '</text>'
       + '<text x="' + X1 + '" y="107" text-anchor="end"' + font + '>' + shortD(end) + '</text>';

  var pts = [];
  days.forEach(function (d, k) {
    if (raw[k] === null && avg[k] === null) return;
    pts.push({
      x: x(k), y: [raw[k] === null ? null : y(raw[k]), avg[k] === null ? null : y(avg[k])], c: [C_PT, C_AVG],
      v: (raw[k] === null ? "–" : fmtVal(m.f, raw[k]) + (m.unit || "")) + (avg[k] === null ? "" : " · Ø " + fmtAvg(m, avg[k])),
      t: shortD(d) + d.slice(0, 4) + (raw[k] === null ? "" : " · " + tag(m, isT(d)))
    });
  });
  var attr = typeof window.scrubAttr === "function" && pts.length ? window.scrubAttr(pts) : "";
  return '<svg class="wt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Verlauf ' + m.l + '"' + attr + '>' + svg + '</svg>';
}
function tag(m, t) { return m.night ? (t ? "nach Training" : "nach Ruhetag") : (t ? "Trainingstag" : "Ruhetag"); }

function cardHtml(m, src, train) {
  var vals = {}, keys = [];
  Object.keys(src).forEach(function (k) { if (num(src[k][m.f])) { vals[k] = src[k][m.f]; keys.push(k); } });
  if (!keys.length) return "";
  keys.sort();
  var end = keys[keys.length - 1], first = keys[0];
  var cur = win(vals, end, 6, 0), old = win(vals, end, 13, 7);
  var dlt = cur && old && cur.n >= 3 && old.n >= 3 ? cur.a - old.a : null;
  var kv = cur ? fmtAvg(m, cur.a) : "–";

  if (!isOpen(m)) {
    return '<div class="wt-mini" onclick="ouCard(\'' + m.f + '\')"><div class="wt-lbl">' + m.l + '</div>'
         + '<div class="wt-mv">Ø ' + kv + (dlt === null ? "" : " · " + fmtDelta(m, dlt)) + '</div><span>▸</span></div>';
  }

  var days = range();
  var start = days ? addDays(end, -(days - 1)) : first;
  if (start < first) start = first;
  var isT = function (d) { return !!train[m.night ? addDays(d, -1) : d]; };
  /* Training gegen Ruhe über den gezeigten Zeitraum */
  var T = { s: 0, n: 0 }, R = { s: 0, n: 0 };
  keys.forEach(function (k) { if (k < start) return; var g = isT(k) ? T : R; g.s += vals[k]; g.n++; });
  var cmp;
  if (T.n >= 3 && R.n >= 3) {
    cmp = '<b>' + fmtAvg(m, T.s / T.n) + '</b> ' + tag(m, true) + ' (' + T.n + ') · <b>' + fmtAvg(m, R.s / R.n) + '</b> ' + tag(m, false) + ' (' + R.n + ')';
  } else {
    cmp = 'Vergleich Training / Ruhe ab je 3 Tagen (bisher ' + T.n + ' / ' + R.n + ').';
  }

  return '<div class="wt-card">'
    + '<div class="wt-hd"><button type="button" class="wt-lbl wt-fold" onclick="ouCard(\'' + m.f + '\')">' + m.l + ' <span>▾</span></button><div class="wt-k">'
    + '<span class="wt-kv">' + kv + '</span>' + (dlt === null ? "" : '<span class="wt-kd">' + fmtDelta(m, dlt) + '</span>')
    + '<div class="wt-sub">Ø 7 Tage · Vorwoche ' + (old && old.n >= 3 ? fmtAvg(m, old.a) : "–") + '</div></div></div>'
    + chart(m, vals, isT, end, start)
    + '<div class="wt-leg"><span><i style="background:' + C_PT + '"></i>' + tag(m, true) + '</span>'
    + '<span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px ' + C_PT + '"></i>' + tag(m, false) + '</span>'
    + '<span><i style="background:' + C_AVG + '"></i>Ø 7 Tage</span></div>'
    + '<div class="ou-cmp">' + cmp + '</div>'
    + '</div>';
}

var COLS = [
  { f: "steps",    l: "Schritte" },
  { f: "sleepMin", l: "Schlaf" },
  { f: "rhr",      l: "Ruhepuls" },
  { f: "hrv",      l: "HRV" }
];

/* Kopfzeile: letzte Nacht – Readiness und Schlaf-Score */
function todayHtml(all) {
  var r = all.filter(function (x) { return num(x.ready) || num(x.sscore); })[0];
  if (!r) return "";
  var box = "flex:1;padding:12px;border:1px solid var(--border);border-radius:12px;text-align:center";
  function tile(lbl, v) {
    return '<div style="' + box + '"><div style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums">' + (num(v) ? Math.round(v) : "–") + '</div>'
         + '<div style="font-size:11px;color:var(--muted);letter-spacing:.04em">' + lbl + '</div></div>';
  }
  return '<div class="dhint" style="margin:0 0 6px">Letzte Nacht · ' + shortD(r.date) + '</div>'
       + '<div style="display:flex;gap:10px">' + tile("READINESS", r.ready) + tile("SCHLAF-SCORE", r.sscore) + '</div>';
}

function tableHtml(all, train) {
  var rs = all.slice(0, DAYS), prev = all.slice(DAYS);
  var cols = COLS.filter(function (c) { return all.some(function (r) { return num(r[c.f]); }); });
  if (!cols.length) return "";
  var grid = "grid-template-columns:62px repeat(" + cols.length + ",1fr);";
  var cell = "text-align:right;font-variant-numeric:tabular-nums;padding-left:8px;";
  var h = '<div style="display:grid;' + grid + 'gap:0;font-size:13px">'
        + '<div class="dhside" style="margin:0">Tag</div>'
        + cols.map(function (c) { return '<div class="dhside" style="margin:0;' + cell + '">' + c.l + '</div>'; }).join("");
  rs.forEach(function (r) {
    var bd = "padding:9px 0;border-bottom:1px solid var(--border);";
    h += '<div style="' + bd + 'color:var(--muted);white-space:nowrap">' + shortD(r.date) + (train[r.date] ? ' <span style="color:' + C_PT + '">●</span>' : "") + '</div>'
       + cols.map(function (c) { return '<div style="' + bd + cell + 'font-weight:600">' + fmtVal(c.f, r[c.f]) + '</div>'; }).join("");
  });
  h += '<div style="padding:9px 0;color:var(--muted)">Ø 7 T</div>'
     + cols.map(function (c) {
         var cur = avgOf(rs, c.f), old = avgOf(prev, c.f), t = "–", sub = "";
         if (cur) {
           t = c.f === "steps" ? Math.round(cur.a).toLocaleString("de-DE") : c.f === "sleepMin" ? fmtSleep(cur.a) : cur.a.toFixed(c.f === "rhr" ? 1 : 0).replace(".", ",");
           if ((c.f === "rhr" || c.f === "hrv") && old && cur.n >= 3 && old.n >= 3) {
             var dlt = cur.a - old.a;
             sub = '<div style="font-size:11px;font-weight:500;color:var(--muted)">' + (dlt >= 0 ? "+" : "−") + Math.abs(dlt).toFixed(1).replace(".", ",") + ' z. Vw.</div>';
           }
         }
         return '<div style="padding:9px 0;' + cell + 'font-weight:700">' + t + sub + '</div>';
       }).join("");
  return h + '</div><div class="dhint" style="margin-top:4px"><span style="color:' + C_PT + '">●</span> Trainingstag</div>';
}

function render() {
  var box = document.getElementById("ou-cont");
  if (!box) return;
  var h = '<div class="dsec" id="ou-sec"><button class="dsupbtn on" onclick="ouRefresh()">' + (busy ? "Lade …" : "Aktualisieren") + '</button>';
  if (lastErr) h += '<div class="dhint" style="color:var(--bad)">' + esc(lastErr) + '</div>';

  if (!data) {
    h += '<div class="dhint">Noch nicht geladen.</div>';
  } else if (!isLive()) {
    h += '<div class="dhint"><strong>Sandbox</strong> – Testdaten von Oura, nur Vorschau, wird nicht gespeichert. Stand ' + esc(fmtTime(data.updated)) + '.</div>';
  } else if (!liveDays()) {
    h += '<div class="dhint"><strong>Live</strong> – wartet auf die erste Nacht mit dem Ring. Der Abruf läuft morgens gegen 6:40 Uhr.</div>';
  } else {
    h += '<div class="dhint">Live · Stand ' + esc(fmtTime(data.updated)) + (liveDays() < 14 ? ' · Basislinie im Aufbau (' + liveDays() + '/14 Tage)' : '') + '</div>';
  }

  var show = data && (!isLive() || liveDays());
  var src, all, train;
  if (show) {
    src = source(); all = rows(CMP_DAYS, src); train = trainDays();
    h += '<div style="margin-top:14px">' + todayHtml(all) + '</div>';
  }
  h += '</div>';

  if (show) {
    var cards = METR.map(function (m) { return cardHtml(m, src, train); }).join("");
    /* Frühindikator (frueh.js, 26.11.): eigene Karte aus data.days (temp/hrAvg) */
    if (isLive() && window.tlFrueh) { try { cards += window.tlFrueh.card(data.days); } catch (e) { setTimeout(function () { throw e; }); } }   // Fehler → diag.js
    if (cards) {
      h += (window.tlWerte ? '<div class="wt-range">' + window.tlWerte.rangeRow() + '</div>' : "") + cards;
    }
    var tab = tableHtml(all, train);
    /* 26.11.: Tabelle = Rohwerte der Karten → standardmäßig eingeklappt */
    if (tab) {
      var tOpen = !!(ui().ou || {}).tab;
      h += '<div class="dsec"><button type="button" class="wt-more' + (tOpen ? " open" : "") + '" style="margin-top:0;padding-top:0;border-top:none" onclick="ouTab()">Letzte 7 Tage – Tabelle<span>' + (tOpen ? "▾" : "▸") + '</span></button>'
         + (tOpen ? '<div style="margin-top:10px">' + tab + '</div>' : '') + '</div>';
    }
  }
  h += '<div class="dhint" style="text-align:right;margin:12px 20px 0"><a href="' + APP_URL + '" style="color:var(--text);font-weight:700;text-decoration:none">In Oura öffnen ↗</a></div>';
  box.innerHTML = h;
}

window.ouRefresh = function () { refresh(true); };
/* Karte auf-/zuklappen, Zustand merken */
window.ouCard = function (f) {
  var m = METR.filter(function (x) { return x.f === f; })[0];
  if (!m) return;
  var s = ui(); s.ou = s.ou || {}; s.ou[f] = !isOpen(m);
  lsSet("tlui-werte", JSON.stringify(s));
  render();
};
window.ouTab = function () {
  var s = ui(); s.ou = s.ou || {}; s.ou.tab = !s.ou.tab;
  lsSet("tlui-werte", JSON.stringify(s));
  render();
};
window.tlOura = { active: active, live: isLive, refresh: refresh, render: render };

/* ─── Init ─────────────────────────────────────── */
/* Legt die Ansicht "health" (Körper → Tracker) an; umgeschaltet wird sie
   von showView in view.js. Bringt eine alte ghealth.js aus dem Cache die
   Ansicht schon mit, wird sie übernommen und deren Abschnitt entfernt. */
function init() {
  if (document.getElementById("ou-cont")) return;
  var app = document.getElementById("app");
  if (!app) return;
  var view = document.getElementById("view-health");
  if (!view) {
    view = document.createElement("div");
    view.id = "view-health";
    view.className = "view";
    var wv = document.getElementById("view-weight");
    if (wv && wv.parentNode === app) app.insertBefore(view, wv.nextSibling);
    else app.appendChild(view);
  } else {
    view.innerHTML = "";
  }
  ["tl-ghc", "tl-ght", "tl-ghs"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });

  var css = document.createElement("style");
  css.textContent = ".ou-cmp { font-size:12px; color:var(--muted); line-height:1.5; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }\n"
                  + ".ou-cmp b { color:var(--text); font-weight:700; }";
  document.head.appendChild(css);

  var wrap = document.createElement("div");
  wrap.innerHTML = '<div class="dhead" style="margin-top:24px"><div class="dhl">OURA</div><div class="dhline"></div></div>'
                 + '<div id="ou-cont"></div>';
  while (wrap.lastChild) view.insertBefore(wrap.lastChild, view.firstChild);

  document.addEventListener("tl:view", function (e) {
    if (e.detail.view === "health") {
      render();
      if (Date.now() - lastFetch > 10 * 60000) refresh(false);
    }
  });
  /* Zeitraum 1M/3M/Alles wird im Werte-Tab mitgeführt – nach dem Umschalten neu zeichnen */
  document.addEventListener("tl:werte", function () { if (view.offsetParent !== null) render(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastFetch > 30 * 60000) refresh(false);
  });

  render();
  /* Einmal beim Start holen, damit tl-d (und damit Backup/Export) aktuell ist,
     auch wenn die Tracker-Ansicht nicht geöffnet wird. */
  setTimeout(function () { refresh(false); }, 4000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
