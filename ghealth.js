/* ═══════════════════════════════════════════════════
   ghealth.js – Google Health, Körper → Tracker (22.10.2026)

   Holt Schritte, Schlaf, Ruhepuls und HRV aus der Google
   Health API (Nachfolger der Fitbit Web API, die am
   30.10.2026 abgeschaltet wird). Quelle ist alles, was in
   der Google-Health-App landet: Fitbit-Geräte, MobileTrack
   (Handy) und manuelle Einträge.

   ANMELDUNG ohne Clientschlüssel: OAuth-Implicit-Flow per
   Weiterleitung (response_type=token). Bewusst kein Popup –
   in der installierten PWA ist die Weiterleitung im selben
   Fenster am robustesten. Das Zugriffstoken gilt ~1 Stunde
   und liegt nur auf diesem Gerät (Key tl-ght, NICHT im
   Backup). Danach einmal "Verbinden" tippen; nach der ersten
   Zustimmung läuft das ohne erneute Rückfrage durch.

   Die Client-ID ist kein Geheimnis, liegt aber trotzdem nur
   lokal (Key tl-ghc), damit das öffentliche Repo nichts
   über das Cloud-Projekt verrät. Einmal einfügen genügt.

   Voraussetzungen im Cloud-Projekt (Client "Webanwendung"):
     Autorisierte JavaScript-Quelle:  https://r1bozyme.github.io
     Autorisierte Weiterleitungs-URI: https://r1bozyme.github.io/training-log/
     Testnutzer: eigene Gmail-Adresse

   DATEN
     Schritte → tl-d, Felder steps (Zahl) + ghAt (ISO der
       Abfrage). Damit laufen sie über sync.js ins Backup und
       als Spalte "Schritte" in export.csv. Geschrieben wird
       nur bei Änderung, sonst stößt jede Abfrage ein Backup an.
     Schlaf (sleepMin = minutesAsleep der längsten Sitzung, die an
       diesem Tag endet), Ruhepuls (rhr, bpm) und HRV (hrv, Ø RMSSD
       in ms) → ebenfalls tl-d, Spalten Schlaf (Min) / Ruhepuls / HRV
       in export.csv. Ruhepuls und HRV sind Tageswerte von Google
       (Datum = Aufwachtag). Fürs Handy allein gibt es keine Werte,
       das braucht einen Tracker (Fitbit Air).
     Schlaf braucht den Bereich sleep.readonly. Wer noch mit der
       alten Freigabe angemeldet ist, sieht einen Hinweis zum
       erneuten Verbinden.
     Gewicht → bewusst NICHT (22.10.): Die Hauswaage wird abgelesen
       und nur in der App erfasst, Google Health wird dafür nicht
       gepflegt. Der Bereich health_metrics bleibt in SCOPES, damit
       spätere Werte (z. B. Ruhepuls) keine neue Zustimmung brauchen.

   Keys: tl-ghc (Client-ID), tl-ght (Token), tl-ghs (state).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var API    = "https://health.googleapis.com/v4/users/me";
var AUTH   = "https://accounts.google.com/o/oauth2/v2/auth";
var SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly"
].join(" ");
var DAYS = 7;          // angezeigt
var FETCH_DAYS = 14;   // abgerufen – zweite Woche nur für den Vergleich

var K_CID = "tl-ghc", K_TOK = "tl-ght", K_STATE = "tl-ghs";
var busy = false, lastErr = "", lastFetch = 0, partErr = {};

/* ─── Hilfen ───────────────────────────────────── */
function ls(k)       { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k)    { try { localStorage.removeItem(k); } catch (e) {} }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function localDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function civil(d, endOfDay) {
  return {
    date: { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() },
    time: endOfDay ? { hours: 23, minutes: 59, seconds: 59, nanos: 0 } : { hours: 0, minutes: 0, seconds: 0, nanos: 0 }
  };
}
function civilToStr(c) { return c && c.date ? c.date.year + "-" + pad(c.date.month) + "-" + pad(c.date.day) : ""; }
function fmtD(s) { return typeof window.fmtDate === "function" ? window.fmtDate(s) : s; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function flash(m) { if (typeof window.showFlash === "function") window.showFlash(m); }
function redirectUri() { return new URL("./", location.href).href; }

/* Fehlt die Schlaf-Freigabe? Alte Tokens ohne sc gelten als "unbekannt" → Hinweis. */
function needsSleepScope() {
  try { var t = JSON.parse(ls(K_TOK) || "null"); return !!t && (t.sc || "").indexOf("sleep") < 0; } catch (e) { return false; }
}

function token() {
  try {
    var t = JSON.parse(ls(K_TOK) || "null");
    if (t && t.t && t.exp > Date.now() + 60000) return t.t;
  } catch (e) {}
  return null;
}

/* ─── Anmeldung (Weiterleitung) ────────────────── */
function connect() {
  var cid = ls(K_CID);
  if (!cid) return;
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  lsSet(K_STATE, state);
  var p = new URLSearchParams({
    client_id: cid,
    redirect_uri: redirectUri(),
    response_type: "token",
    scope: SCOPES,
    include_granted_scopes: "true",
    state: state
  });
  location.href = AUTH + "?" + p.toString();
}

/* Rückkehr von Google: #access_token=…&expires_in=…&state=… */
function takeRedirect() {
  if (!location.hash || location.hash.indexOf("access_token=") < 0 && location.hash.indexOf("error=") < 0) return false;
  var h = new URLSearchParams(location.hash.slice(1));
  var expected = ls(K_STATE);
  lsDel(K_STATE);
  history.replaceState(null, "", location.pathname + location.search);
  if (!expected || h.get("state") !== expected) { lastErr = "Anmeldung abgelehnt: Sicherheitsprüfung (state) fehlgeschlagen."; return true; }
  if (h.get("error")) { lastErr = "Google hat die Anmeldung abgebrochen (" + h.get("error") + ")."; return true; }
  var granted = h.get("scope") || "";
  lsSet(K_TOK, JSON.stringify({ t: h.get("access_token"), exp: Date.now() + (parseInt(h.get("expires_in"), 10) || 3600) * 1000, sc: granted }));
  return true;
}

/* ─── API ──────────────────────────────────────── */
function call(path, opts) {
  var t = token();
  if (!t) return Promise.reject({ auth: true });
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: "Bearer " + t, Accept: "application/json" }, opts.headers || {});
  return fetch(API + path, opts).then(function (r) {
    if (r.status === 401) { lsDel(K_TOK); throw { auth: true }; }
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) {
        var m = (j.error && (j.error.message || j.error.status)) || ("HTTP " + r.status);
        if (/ACCOUNT_NOT_LINKED/.test(JSON.stringify(j))) m = "Google-Konto ist nicht mit Google Health verknüpft – einmal in der Google-Health-App anmelden.";
        else if (r.status === 403) m = "Kein Zugriff (403): Testnutzer und Bereiche im Cloud-Projekt prüfen. " + m;
        throw { msg: m };
      }
      return j;
    });
  });
}

function fetchSteps() {
  var end = new Date(), start = new Date();
  start.setDate(start.getDate() - (FETCH_DAYS - 1));
  return call("/dataTypes/steps/dataPoints:dailyRollUp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ range: { start: civil(start, false), end: civil(end, true) }, windowSizeDays: 1 })
  }).then(function (j) {
    var out = {};
    (j.rollupDataPoints || []).forEach(function (p) {
      var d = civilToStr(p.civilStartTime);
      var n = p.steps && p.steps.countSum != null ? parseInt(p.steps.countSum, 10) : null;
      if (d && n != null && !isNaN(n)) out[d] = n;
    });
    return out;
  });
}

/* GET mit Filter, folgt nextPageToken (max. 5 Seiten) */
function listAll(type, filter) {
  var out = [];
  function page(tok, n) {
    var q = "?filter=" + encodeURIComponent(filter) + (tok ? "&pageToken=" + encodeURIComponent(tok) : "");
    return call("/dataTypes/" + type + "/dataPoints" + q).then(function (j) {
      out = out.concat(j.dataPoints || []);
      return j.nextPageToken && n < 5 ? page(j.nextPageToken, n + 1) : out;
    });
  }
  return page("", 1);
}
function dateToStr(d) { return d && d.year ? d.year + "-" + pad(d.month) + "-" + pad(d.day) : ""; }
function startStr() { var d = new Date(); d.setDate(d.getDate() - (FETCH_DAYS - 1)); return localDate(d); }
function tomorrowStr() { var d = new Date(); d.setDate(d.getDate() + 1); return localDate(d); }

function fetchRhr() {
  var f = 'daily_resting_heart_rate.date >= "' + startStr() + '" AND daily_resting_heart_rate.date < "' + tomorrowStr() + '"';
  return listAll("daily-resting-heart-rate", f).then(function (pts) {
    var out = {};
    pts.forEach(function (p) {
      var x = p.dailyRestingHeartRate || {}, d = dateToStr(x.date), n = parseInt(x.beatsPerMinute, 10);
      if (d && !isNaN(n) && n > 0) out[d] = n;
    });
    return out;
  });
}

function fetchHrv() {
  var f = 'daily_heart_rate_variability.date >= "' + startStr() + '" AND daily_heart_rate_variability.date < "' + tomorrowStr() + '"';
  return listAll("daily-heart-rate-variability", f).then(function (pts) {
    var out = {};
    pts.forEach(function (p) {
      var x = p.dailyHeartRateVariability || {}, d = dateToStr(x.date), v = x.averageHeartRateVariabilityMilliseconds;
      if (d && typeof v === "number" && v > 0) out[d] = Math.round(v * 10) / 10;
    });
    return out;
  });
}

/* Schlaf: pro Aufwachtag die längste Sitzung (Nickerchen fallen so raus) */
function fetchSleep() {
  var f = 'sleep.interval.civil_end_time >= "' + startStr() + 'T00:00:00" AND sleep.interval.civil_end_time < "' + tomorrowStr() + 'T00:00:00"';
  return listAll("sleep", f).then(function (pts) {
    var out = {};
    pts.forEach(function (p) {
      var x = p.sleep || {}, iv = x.interval || {}, sm = x.summary || {};
      var d = civilToStr(iv.civilEndTime), n = parseInt(sm.minutesAsleep, 10);
      if (d && !isNaN(n) && n > 0 && (!out[d] || n > out[d])) out[d] = n;
    });
    return out;
  });
}

/* Werte in tl-d – nur bei Änderung schreiben (sonst stößt jeder Abruf ein Backup an) */
function storeDaily(field, map) {
  var arr;
  try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { return; }
  var changed = false, now = new Date().toISOString();
  Object.keys(map).forEach(function (date) {
    var i = arr.findIndex(function (d) { return d.date === date; });
    if (i >= 0) {
      if (arr[i][field] !== map[date]) { arr[i][field] = map[date]; arr[i].ghAt = now; changed = true; }
    } else if (map[date] > 0) {
      var row = { date: date, kcal: null, est: false, trip: false, rate: null, ratedAt: null, stiff: null, ghAt: now };
      row[field] = map[date];
      arr.push(row);
      changed = true;
    }
  });
  if (!changed) return;
  arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  localStorage.setItem("tl-d", JSON.stringify(arr));   // über sync.js-Hülle → Backup
}
function storeSteps(map) { storeDaily("steps", map); }

function refresh(manual) {
  if (busy || !token()) { render(); return; }
  busy = true; lastErr = ""; partErr = {}; render();
  /* Nacheinander schreiben, damit sich die tl-d-Updates nicht überholen */
  var jobs = [
    ["steps",   fetchSteps],
    ["sleepMin", fetchSleep],
    ["rhr",     fetchRhr],
    ["hrv",     fetchHrv]
  ];
  var authFail = false;
  var run = jobs.reduce(function (pr, job) {
    return pr.then(function () {
      if (authFail) return;
      return job[1]().then(function (m) { storeDaily(job[0], m); }).catch(function (e) {
        if (e && e.auth) { authFail = true; return; }
        partErr[job[0]] = (e && e.msg) || (e && e.message) || "Abruf fehlgeschlagen.";
      });
    });
  }, Promise.resolve());
  run.then(function () {
    if (!authFail) lastFetch = Date.now();
    if (partErr.steps) lastErr = partErr.steps;
    if (manual && !authFail) flash("Google Health aktualisiert ✓");
  }).then(function () { busy = false; render(); });
}

/* ─── Oberfläche ───────────────────────────────── */
window.ghSaveCid = function () {
  var v = (document.getElementById("gh-cid").value || "").trim();
  if (!/\.apps\.googleusercontent\.com$/.test(v)) { lastErr = "Das sieht nicht nach einer Client-ID aus (endet auf .apps.googleusercontent.com)."; render(); return; }
  lsSet(K_CID, v); lastErr = ""; render();
};
window.ghConnect = connect;
window.ghRefresh = function () { refresh(true); };
window.ghReset = function () {
  var go = function () { lsDel(K_TOK); lsDel(K_CID); lastErr = ""; render(); };
  if (window.tlAsk && window.tlAsk.confirm) window.tlAsk.confirm("Client-ID und Anmeldung auf diesem Gerät löschen? Die gespeicherten Schritte bleiben.").then(function (ok) { if (ok) go(); });
  else go();
};

function dailyRows(n) {
  var arr;
  try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { arr = []; }
  var by = {};
  arr.forEach(function (d) { by[d.date] = d; });
  var rows = [], d = new Date();
  for (var i = 0; i < n; i++) {
    var s = localDate(d), x = by[s] || {};
    rows.push({ date: s, steps: x.steps, sleepMin: x.sleepMin, rhr: x.rhr, hrv: x.hrv });
    d.setDate(d.getDate() - 1);
  }
  return rows;
}
function num(v) { return typeof v === "number"; }
function avgOf(rows, f) {
  var v = rows.map(function (r) { return r[f]; }).filter(num);
  return v.length ? { a: v.reduce(function (x, y) { return x + y; }, 0) / v.length, n: v.length } : null;
}
function fmtSleep(m) { return Math.floor(m / 60) + ":" + pad(Math.round(m % 60)) + " h"; }
function shortD(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function fmtVal(f, v) {
  if (!num(v)) return "–";
  if (f === "steps") return v.toLocaleString("de-DE");
  if (f === "sleepMin") return fmtSleep(v);
  if (f === "hrv") return v.toFixed(0);
  return String(v);
}

var COLS = [
  { f: "steps",    l: "Schritte" },
  { f: "sleepMin", l: "Schlaf" },
  { f: "rhr",      l: "Ruhepuls" },
  { f: "hrv",      l: "HRV" }
];

function tableHtml() {
  var all = dailyRows(FETCH_DAYS), rows = all.slice(0, DAYS), prev = all.slice(DAYS);
  var cols = COLS.filter(function (c) { return all.some(function (r) { return num(r[c.f]); }); });
  if (!cols.length) return "";
  var grid = "grid-template-columns:52px repeat(" + cols.length + ",1fr);";
  var cell = "text-align:right;font-variant-numeric:tabular-nums;padding-left:8px;";
  var h = '<div style="display:grid;' + grid + 'gap:0;margin-top:14px;font-size:13px">'
        + '<div class="dhside" style="margin:0">Tag</div>'
        + cols.map(function (c) { return '<div class="dhside" style="margin:0;' + cell + '">' + c.l + '</div>'; }).join("");
  rows.forEach(function (r) {
    var bd = "padding:9px 0;border-bottom:1px solid var(--border);";
    h += '<div style="' + bd + 'color:var(--muted)">' + shortD(r.date) + '</div>'
       + cols.map(function (c) { return '<div style="' + bd + cell + 'font-weight:600">' + fmtVal(c.f, r[c.f]) + '</div>'; }).join("");
  });
  /* Ø-Zeile + Vergleich zur Vorwoche (nur Ruhepuls/HRV, da zählt der Trend) */
  h += '<div style="padding:9px 0;color:var(--muted)">Ø 7 T</div>'
     + cols.map(function (c) {
         var cur = avgOf(rows, c.f), old = avgOf(prev, c.f), t = "–", sub = "";
         if (cur) {
           t = c.f === "steps" ? Math.round(cur.a).toLocaleString("de-DE") : c.f === "sleepMin" ? fmtSleep(cur.a) : cur.a.toFixed(c.f === "rhr" ? 1 : 0).replace(".", ",");
           if ((c.f === "rhr" || c.f === "hrv") && old && cur.n >= 3 && old.n >= 3) {
             var dlt = cur.a - old.a;
             sub = '<div style="font-size:11px;font-weight:500;color:var(--muted)">' + (dlt >= 0 ? "+" : "−") + Math.abs(dlt).toFixed(1).replace(".", ",") + ' z. Vw.</div>';
           }
         }
         return '<div style="padding:9px 0;' + cell + 'font-weight:700">' + t + sub + '</div>';
       }).join("");
  h += '</div>';
  return h;
}

function render() {
  var box = document.getElementById("gh-cont");
  if (!box) return;
  var h = "";
  var cid = ls(K_CID);

  if (!cid) {
    h += '<div class="dhint" style="margin-top:0">Einmalig die <strong>Client-ID</strong> aus dem Cloud-Projekt einfügen (nicht den Clientschlüssel).</div>'
       + '<div class="drow2" style="margin-top:10px"><input id="gh-cid" placeholder="…apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false">'
       + '<button class="dsave" onclick="ghSaveCid()">OK</button></div>';
  } else if (!token()) {
    h += '<button class="dsupbtn" onclick="ghConnect()">Mit Google Health verbinden</button>'
       + '<div class="dhint">Zugriff gilt jeweils ca. 1 Stunde. Danach hier erneut tippen.</div>';
  } else {
    h += '<button class="dsupbtn on" onclick="ghRefresh()">' + (busy ? "Lade …" : "Aktualisieren") + '</button>';
  }

  if (lastErr) h += '<div class="dhint" style="color:#B33A3A">' + esc(lastErr) + '</div>';

  if (token() && needsSleepScope()) {
    h += '<div class="dhint">Für Schlaf einmal <a href="#" onclick="ghConnect();return false" style="color:var(--text);font-weight:700">neu verbinden</a> und den Haken bei Schlaf setzen.</div>';
  }
  h += tableHtml();
  var miss = COLS.filter(function (c) { return partErr[c.f] && c.f !== "steps" && !(c.f === "sleepMin" && needsSleepScope()); });
  if (miss.length) {
    h += '<div class="dhint" style="color:#B33A3A">' + miss.map(function (c) { return esc(c.l + ": " + partErr[c.f]); }).join("<br>") + '</div>';
  } else if (lastFetch && !dailyRows(FETCH_DAYS).some(function (r) { return num(r.sleepMin) || num(r.rhr) || num(r.hrv); })) {
    h += '<div class="dhint">Schlaf, Ruhepuls und HRV erscheinen, sobald ein Tracker (Fitbit Air) Daten liefert.</div>';
  }

  if (cid) h += '<div class="dhint" style="text-align:right"><a href="#" onclick="ghReset();return false" style="color:var(--dim)">Verbindung zurücksetzen</a></div>';
  box.innerHTML = h;
}

/* ─── Init ─────────────────────────────────────── */
/* Eigene Ansicht "health" (Körper → Tracker, 22.10.). Wie tracker.js mit
   view-food: die Grundfassung von showView schaltet bei "health" alle
   eigenen Views ab, hier wird nur die eigene dazugeschaltet. */
function init() {
  var app = document.getElementById("app");
  if (!app || document.getElementById("gh-sec")) return;

  var view = document.createElement("div");
  view.id = "view-health";
  view.className = "view";
  view.innerHTML = '<div class="dhead" style="margin-top:24px"><div class="dhl">GOOGLE HEALTH</div><div class="dhline"></div></div>'
                 + '<div class="dsec" id="gh-sec"><div id="gh-cont"></div></div>';
  var wv = document.getElementById("view-weight");
  if (wv && wv.parentNode === app) app.insertBefore(view, wv.nextSibling);
  else app.appendChild(view);

  var back = takeRedirect();

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      var res = origShow.apply(this, arguments);
      view.classList.toggle("active", v === "health");
      if (v === "health") {
        render();
        if (token() && Date.now() - lastFetch > 10 * 60000) refresh(false);
      }
      return res;
    };
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") render();
  });

  render();
  if (back) {
    if (typeof window.showView === "function") window.showView("health");
    setTimeout(function () {
      var s = document.getElementById("gh-sec");
      if (s) s.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    if (token()) refresh(true);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
