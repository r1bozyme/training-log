/* ═══════════════════════════════════════════════════
   oura.js – Oura-Ring, Körper → Tracker (05.11.2026)

   Liest oura/data.json aus dem privaten Daten-Repo (geschrieben vom
   Workflow "oura" in training-log-data, 2x täglich + nach jedem
   reminders-Lauf). Kein eigenes Token in der App: der Abruf läuft
   über window.tlSync.get, also mit dem Backup-Token aus sync.js.

   MODUS (data.mode, gesetzt von oura/fetch.js)
     sandbox → nur Vorschau mit Testdaten, NICHTS wird gespeichert.
     live    → Werte wandern in tl-d, in dieselben Felder wie bisher
               bei Google Health: steps, sleepMin, rhr, hrv. Dazu neu
               ready (Readiness) und sscore (Schlaf-Score). Damit laufen
               sie über sync.js ins Backup und in export.csv.
               Sobald live mindestens ein Tag da ist, ist Oura "aktiv":
               ghealth.js ruft dann nicht mehr ab und überschreibt nichts.

   Definitionen (Oura):
     sleepMin = total_sleep_duration des Hauptschlafs (Aufwachtag)
     rhr      = niedrigster Nachtpuls (Ouras "Ruhepuls")
     hrv      = Ø rMSSD der Nacht in ms
   Readiness/HRV-Einordnung brauchen bei Oura ca. 2 Wochen Basislinie.

   Unten rechts "In Oura öffnen ↗" (05.11.): Android-Intent auf com.ouraring.oura.

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
/* aktiv = live und schon echte Werte → ersetzt Google Health */
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

/* ─── Darstellung ──────────────────────────────── */
function rows(n) {
  var src = {};
  if (isLive()) {
    var arr; try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { arr = []; }
    arr.forEach(function (d) { src[d.date] = { steps: d.steps, sleepMin: d.sleepMin, rhr: d.rhr, hrv: d.hrv, ready: d.ready, sscore: d.sscore }; });
  } else if (data && data.days) {
    Object.keys(data.days).forEach(function (k) {
      var x = data.days[k];
      src[k] = { steps: x.steps, sleepMin: x.sleepMin, rhr: x.rhr, hrv: x.hrv, ready: x.readiness, sscore: x.sleepScore };
    });
  }
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
function fmtSleep(m) { return Math.floor(m / 60) + ":" + pad(Math.round(m % 60)) + " h"; }
function shortD(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
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

function tableHtml(all) {
  var rs = all.slice(0, DAYS), prev = all.slice(DAYS);
  var cols = COLS.filter(function (c) { return all.some(function (r) { return num(r[c.f]); }); });
  if (!cols.length) return "";
  var grid = "grid-template-columns:52px repeat(" + cols.length + ",1fr);";
  var cell = "text-align:right;font-variant-numeric:tabular-nums;padding-left:8px;";
  var h = '<div style="display:grid;' + grid + 'gap:0;margin-top:14px;font-size:13px">'
        + '<div class="dhside" style="margin:0">Tag</div>'
        + cols.map(function (c) { return '<div class="dhside" style="margin:0;' + cell + '">' + c.l + '</div>'; }).join("");
  rs.forEach(function (r) {
    var bd = "padding:9px 0;border-bottom:1px solid var(--border);";
    h += '<div style="' + bd + 'color:var(--muted)">' + shortD(r.date) + '</div>'
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
  return h + '</div>';
}

function render() {
  var box = document.getElementById("ou-cont");
  if (!box) return;
  var h = '<button class="dsupbtn on" onclick="ouRefresh()">' + (busy ? "Lade …" : "Aktualisieren") + '</button>';
  if (lastErr) h += '<div class="dhint" style="color:#B33A3A">' + esc(lastErr) + '</div>';

  if (!data) {
    h += '<div class="dhint">Noch nicht geladen.</div>';
  } else if (!isLive()) {
    h += '<div class="dhint"><strong>Sandbox</strong> – Testdaten von Oura, nur Vorschau, wird nicht gespeichert. Stand ' + esc(fmtTime(data.updated)) + '.</div>';
  } else if (!liveDays()) {
    h += '<div class="dhint"><strong>Live</strong> – wartet auf die erste Nacht mit dem Ring. Der Abruf läuft morgens gegen 6:40 Uhr. Bis dahin bleibt Google Health aktiv.</div>';
  } else {
    h += '<div class="dhint">Live · Stand ' + esc(fmtTime(data.updated)) + (liveDays() < 14 ? ' · Basislinie im Aufbau (' + liveDays() + '/14 Tage)' : '') + '</div>';
  }

  if (data && (!isLive() || liveDays())) {
    var all = rows(CMP_DAYS);
    h += '<div style="margin-top:14px">' + todayHtml(all) + '</div>' + tableHtml(all);
  }
  h += '<div class="dhint" style="text-align:right;margin-top:12px"><a href="' + APP_URL + '" style="color:var(--text);font-weight:700;text-decoration:none">In Oura öffnen ↗</a></div>';
  box.innerHTML = h;

  /* Google-Health-Abschnitt ausblenden, sobald Oura aktiv ist */
  var gh = document.getElementById("gh-sec");
  if (gh) {
    var on = active();
    gh.style.display = on ? "none" : "";
    var head = gh.previousElementSibling;
    if (head && head.classList.contains("dhead")) head.style.display = on ? "none" : "";
  }
}

window.ouRefresh = function () { refresh(true); };
window.tlOura = { active: active, live: isLive, refresh: refresh };

/* ─── Init ─────────────────────────────────────── */
/* Hängt sich als erster Abschnitt in die Ansicht "health" (aus ghealth.js). */
function init() {
  var view = document.getElementById("view-health");
  if (!view) { setTimeout(init, 300); return; }
  if (document.getElementById("ou-sec")) return;

  var wrap = document.createElement("div");
  wrap.innerHTML = '<div class="dhead" style="margin-top:24px"><div class="dhl">OURA</div><div class="dhline"></div></div>'
                 + '<div class="dsec" id="ou-sec"><div id="ou-cont"></div></div>';
  while (wrap.lastChild) view.insertBefore(wrap.lastChild, view.firstChild);

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      var res = origShow.apply(this, arguments);
      if (v === "health") {
        render();
        if (Date.now() - lastFetch > 10 * 60000) refresh(false);
      }
      return res;
    };
  }
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
