/* ═══════════════════════════════════════════════════
   ghealth.js – Google Health im Werte-Tab (22.10.2026)

   Holt Schritte (Tagessummen) und Gewicht aus der Google
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
     Schritte → tl-d, Felder steps (Zahl) + stepsAt (ISO der
       Abfrage). Damit laufen sie über sync.js ins Backup und
       als Spalte "Schritte" in export.csv. Geschrieben wird
       nur bei Änderung, sonst stößt jede Abfrage ein Backup an.
     Gewicht → nur angezeigt. Fehlt ein Tag in tl-w, lässt er
       sich per Tipp übernehmen. Die Hauswaage bleibt führend.

   Keys: tl-ghc (Client-ID), tl-ght (Token), tl-ghs (state).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var API    = "https://health.googleapis.com/v4/users/me";
var AUTH   = "https://accounts.google.com/o/oauth2/v2/auth";
var SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"
].join(" ");
var DAYS = 7;

var K_CID = "tl-ghc", K_TOK = "tl-ght", K_STATE = "tl-ghs";
var busy = false, lastErr = "", weights = null, lastFetch = 0;

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
  lsSet(K_TOK, JSON.stringify({ t: h.get("access_token"), exp: Date.now() + (parseInt(h.get("expires_in"), 10) || 3600) * 1000 }));
  if (granted && granted.indexOf("health_metrics") < 0) lastErr = "Gewicht nicht freigegeben – beim Verbinden beide Haken setzen.";
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
  start.setDate(start.getDate() - (DAYS - 1));
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

function fetchWeights() {
  return call("/dataTypes/weight/dataPoints").then(function (j) {
    return (j.dataPoints || []).map(function (p) {
      var w = p.weight || {}, st = w.sampleTime || {};
      return {
        date: civilToStr(st.civilTime),
        ts: st.physicalTime || "",
        kg: w.weightGrams != null ? Math.round(w.weightGrams / 100) / 10 : null,
        src: (p.dataSource && p.dataSource.recordingMethod) === "MANUAL" ? "manuell" : "Gerät"
      };
    }).filter(function (x) { return x.date && x.kg != null; })
      .sort(function (a, b) { return a.ts < b.ts ? 1 : -1; })
      .slice(0, 10);
  });
}

/* Schritte in tl-d – nur bei Änderung schreiben */
function storeSteps(map) {
  var arr;
  try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { return; }
  var changed = false, now = new Date().toISOString();
  Object.keys(map).forEach(function (date) {
    var i = arr.findIndex(function (d) { return d.date === date; });
    if (i >= 0) {
      if (arr[i].steps !== map[date]) { arr[i].steps = map[date]; arr[i].stepsAt = now; changed = true; }
    } else if (map[date] > 0) {
      arr.push({ date: date, kcal: null, est: false, trip: false, rate: null, ratedAt: null, stiff: null, steps: map[date], stepsAt: now });
      changed = true;
    }
  });
  if (!changed) return;
  arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  localStorage.setItem("tl-d", JSON.stringify(arr));   // über sync.js-Hülle → Backup
}

function refresh(manual) {
  if (busy || !token()) { render(); return; }
  busy = true; lastErr = ""; render();
  Promise.all([
    fetchSteps().then(storeSteps),
    fetchWeights().then(function (w) { weights = w; })
  ]).then(function () {
    lastFetch = Date.now();
    if (manual) flash("Google Health aktualisiert ✓");
  }).catch(function (e) {
    lastErr = e && e.auth ? "" : ((e && e.msg) || (e && e.message) || "Abruf fehlgeschlagen.");
  }).then(function () { busy = false; render(); });
}

/* ─── Gewicht übernehmen ───────────────────────── */
function hasW(date) {
  try { return JSON.parse(ls("tl-w") || "[]").some(function (x) { return x.date === date; }); } catch (e) { return true; }
}
window.ghTakeWeight = function (date, kg) {
  var arr;
  try { arr = JSON.parse(ls("tl-w") || "[]"); } catch (e) { return; }
  if (arr.some(function (x) { return x.date === date; })) return;
  arr.push({ id: Date.now(), date: date, kg: kg });
  arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  localStorage.setItem("tl-w", JSON.stringify(arr));
  if (typeof window.buildWeight === "function") window.buildWeight();
  flash("Gewicht übernommen ✓");
  render();
};

/* ─── Oberfläche ───────────────────────────────── */
window.ghSaveCid = function () {
  var v = (document.getElementById("gh-cid").value || "").trim();
  if (!/\.apps\.googleusercontent\.com$/.test(v)) { lastErr = "Das sieht nicht nach einer Client-ID aus (endet auf .apps.googleusercontent.com)."; render(); return; }
  lsSet(K_CID, v); lastErr = ""; render();
};
window.ghConnect = connect;
window.ghRefresh = function () { refresh(true); };
window.ghReset = function () {
  var go = function () { lsDel(K_TOK); lsDel(K_CID); weights = null; lastErr = ""; render(); };
  if (window.tlAsk && window.tlAsk.confirm) window.tlAsk.confirm("Client-ID und Anmeldung auf diesem Gerät löschen? Die gespeicherten Schritte bleiben.").then(function (ok) { if (ok) go(); });
  else go();
};

function stepsRows() {
  var arr;
  try { arr = JSON.parse(ls("tl-d") || "[]"); } catch (e) { arr = []; }
  var by = {};
  arr.forEach(function (d) { if (typeof d.steps === "number") by[d.date] = d.steps; });
  var rows = [], d = new Date();
  for (var i = 0; i < DAYS; i++) {
    var s = localDate(d);
    rows.push({ date: s, n: by[s] });
    d.setDate(d.getDate() - 1);
  }
  return rows;
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

  var rows = stepsRows();
  if (rows.some(function (r) { return typeof r.n === "number"; })) {
    var vals = rows.map(function (r) { return r.n; }).filter(function (n) { return typeof n === "number"; });
    var avg = Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
    h += '<div class="dhside" style="margin-top:14px">Schritte</div>'
       + rows.map(function (r) {
           return '<div class="dsrow"><div class="dsrow-d">' + fmtD(r.date) + '</div><div class="dsrow-v">'
                + (typeof r.n === "number" ? r.n.toLocaleString("de-DE") : "–") + '</div></div>';
         }).join("")
       + '<div class="dhint">Ø ' + avg.toLocaleString("de-DE") + ' Schritte an ' + vals.length + (vals.length === 1 ? ' Tag' : ' Tagen') + ' mit Daten.</div>';
  }

  if (weights && weights.length) {
    h += '<div class="dhside" style="margin-top:14px">Gewicht in Google Health</div>'
       + weights.map(function (w) {
           var act = hasW(w.date)
             ? '<div class="dsrow-t dim">in App</div>'
             : '<button class="dsave" style="padding:8px 12px;font-size:11px" onclick="ghTakeWeight(\'' + w.date + '\',' + w.kg + ')">übernehmen</button>';
           return '<div class="dsrow"><div class="dsrow-d">' + fmtD(w.date) + '</div><div class="dsrow-v">'
                + w.kg.toFixed(1).replace(".", ",") + ' kg <span style="font-weight:500;color:var(--muted);font-size:11px">' + w.src + '</span></div>' + act + '</div>';
         }).join("");
  } else if (weights) {
    h += '<div class="dhint">Kein Gewicht in Google Health gefunden.</div>';
  }

  if (cid) h += '<div class="dhint" style="text-align:right"><a href="#" onclick="ghReset();return false" style="color:var(--dim)">Verbindung zurücksetzen</a></div>';
  box.innerHTML = h;
}

/* ─── Init ─────────────────────────────────────── */
function init() {
  var view = document.getElementById("view-weight");
  if (!view || document.getElementById("gh-sec")) return;

  var wrap = document.createElement("div");
  wrap.innerHTML = '<div class="dhead"><div class="dhl">GOOGLE HEALTH</div><div class="dhline"></div></div>'
                 + '<div class="dsec" id="gh-sec"><div id="gh-cont"></div></div>';
  view.appendChild(wrap);

  var back = takeRedirect();

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      origShow.apply(this, arguments);
      if (v === "weight") {
        render();
        if (token() && Date.now() - lastFetch > 10 * 60000) refresh(false);
      }
    };
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") render();
  });

  render();
  if (back) {
    if (typeof window.showView === "function") window.showView("weight");
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
