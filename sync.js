/* ─────────────────────────────────────────────────────────────
   sync.js — Backup der App-Daten in ein privates GitHub-Repo
             + korrekte CSV-Erzeugung.

   Zweck: Die localStorage-Keys (tl-e, tl-w, tl-w0, tl-d sowie
   seit 05.09. tl-f, tl-fp, tl-fg) liegen sonst ausschliesslich
   auf diesem Geraet. Dieses Modul schreibt sie nach jeder
   Aenderung in ein privates Repo:

     backup.json  vollstaendiger Dump  -> Wiederherstellungspfad
     export.csv   dieselbe Datei wie der Download-Button

   Der Token liegt NUR im localStorage dieses Geraets (Key tl-sync)
   und darf niemals in den Code oder ins oeffentliche Repo.

   CSV: Dieses Modul ersetzt window.exportCSV vollstaendig.
   Die Fassungen in index.html und daily.js hatten zwei Fehler:
   Dezimalkommas in einer kommagetrennten Datei ("72,7" = zwei
   Felder) und keine Maskierung des Notizfeldes, das Kommas
   enthalten kann. Beides zerlegt die Spalten.
   Weil GitHub keine Teil-Updates erlaubt und index.html 58 KB
   gross ist, liegt die Korrektur hier statt dort. Beim naechsten
   index.html-Commit nach oben ziehen und die alten Fassungen
   entfernen (Notiz fuer den Review 01.09.).

   05.09.: Ernaehrungsdaten aus tracker.js aufgenommen. Zwei
   CSV-Bloecke – Tagessummen fuer den Monatsreview, Einzelposten
   fuer die Nachvollziehbarkeit. Der Posten-Block kann gross
   werden; das ist gewollt, er ist die Rohdatenebene.
   ───────────────────────────────────────────────────────────── */
(function () {
"use strict";

var CFG_KEY   = "tl-sync";
var DATA_KEYS = ["tl-e", "tl-w", "tl-w0", "tl-d", "tl-f", "tl-fp", "tl-fg"];
var DEBOUNCE  = 8000;          // ms nach letzter Aenderung
var STALE_D   = 7;             // Tage bis Warnung
var API       = "https://api.github.com";

var timer = null, running = false, seq = 0;   // seq: Aenderungszaehler

/* ─── Konfiguration ─────────────────────────────────────── */
function cfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
function configured() { var c = cfg(); return !!(c.token && c.owner && c.repo); }

/* ─── Hilfen ────────────────────────────────────────────── */
function b64(str) {
  var bytes = new TextEncoder().encode(str), s = "";
  for (var i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  var bin = atob(s.replace(/\s/g, ""));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}
function fmtStamp(iso) {
  if (!iso) return "nie";
  var d = new Date(iso), p = function (n) { return String(n).padStart(2, "0"); };
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() +
         ", " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function flash(msg) {
  if (typeof window.showFlash === "function") window.showFlash(msg);
}

/* ─── CSV-Primitive ─────────────────────────────────────── */
// Punkt als Dezimaltrennzeichen. fmtNum() der App liefert bewusst
// ein Komma – fuer die Anzeige richtig, fuer CSV falsch.
function csvNum(n, dec) {
  return (typeof n === "number" && isFinite(n)) ? n.toFixed(dec) : "";
}
// RFC 4180: Feld quoten, wenn es Komma, Anfuehrungszeichen
// oder Zeilenumbruch enthaelt.
function csvCell(v) {
  var s = (v === null || typeof v === "undefined") ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(arr) { return arr.map(csvCell).join(","); }

/* ─── CSV-Aufbau ────────────────────────────────────────── */
function buildCSV() {
  if (typeof window.loadEntries !== "function" || typeof window.fmtDate !== "function")
    throw new Error("App-Funktionen nicht verfuegbar");

  var out = [csvRow(["Datum", "Einheit", "Übung", "Gewicht",
                     "S1", "S2", "S3", "S4", "Notiz", "↑ Erhöhen?"])];
  window.loadEntries().forEach(function (e) {
    out.push(csvRow([
      window.fmtDate(e.date), e.einheit, e.uebung, e.gewicht,
      e.s1, e.s2, e.s3, e.s4 || "", e.notiz || "",
      e.erhoehen ? "Ja" : "Nein"
    ]));
  });
  var csv = out.join("\n");

  if (typeof window.loadStart === "function") {
    var st = window.loadStart();
    if (st) {
      csv += "\n\n# STARTPUNKT (Referenz, nicht Teil der Messreihe)\n" +
             csvRow(["Datum", "Gewicht (kg)"]) + "\n" +
             csvRow([window.fmtDate(st.date), csvNum(st.kg, 1)]);
    }
  }

  if (typeof window.loadWeights === "function" && typeof window.computeTrend === "function") {
    var wArr = window.loadWeights().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (wArr.length) {
      var wp = window.computeTrend(wArr);
      csv += "\n\n# GEWICHT\n" + csvRow(["Datum", "Gewicht (kg)", "Trend (kg)"]);
      wp.forEach(function (p) {
        csv += "\n" + csvRow([window.fmtDate(p.date), csvNum(p.kg, 1), csvNum(p.trend, 2)]);
      });
    }
  }

  if (typeof window.loadDaily === "function") {
    var lbl = { under: "darunter", hit: "Ziel", over: "darüber" };
    var rows = window.loadDaily().filter(function (d) {
      return d.kcal || d.est || d.trip || d.sup || typeof d.rate === "number" || typeof d.stiff === "number";
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (rows.length) {
      csv += "\n\n# TÄGLICH\n" +
             csvRow(["Datum", "Kalorienziel", "Steifigkeit (0-10)", "Steifigkeit (Min)", "Geschätzt", "Reise", "Einnahme"]);
      rows.forEach(function (d) {
        csv += "\n" + csvRow([
          window.fmtDate(d.date),
          d.kcal ? lbl[d.kcal] : "",
          typeof d.rate  === "number" ? d.rate  : "",
          typeof d.stiff === "number" ? d.stiff : "",
          d.est ? "ja" : "",
          d.trip ? "ja" : "",
          d.sup ? (d.sup === "manual" ? "ja" : "ja " + new Date(d.sup).toTimeString().slice(0, 5)) : ""
        ]);
      });
    }
  }

  /* ─── Ernaehrung (tracker.js) ───────────────────────────
     Zwei Bloecke. Der Summenblock ist das, was im Monatsreview
     gelesen wird; der Postenblock erlaubt es, eine auffaellige
     Tagessumme im Nachhinein aufzuschluesseln. Absolutwert
     eines Postens = wert * menge / ref (siehe tracker.js). */
  if (typeof window.loadFood === "function") {
    var food = window.loadFood();
    var days = Object.keys(food).sort();
    if (days.length) {
      var goal = (typeof window.loadFoodGoal === "function") ? window.loadFoodGoal() : null;

      csv += "\n\n# ERNÄHRUNG – TAGESSUMMEN\n" +
             csvRow(["Datum", "kcal", "KH (g)", "Fett (g)", "Protein (g)",
                     "Ziel kcal", "Δ kcal", "Posten"]);
      days.forEach(function (d) {
        var items = food[d] || [];
        var s = { kcal:0, kh:0, f:0, p:0 };
        items.forEach(function (it) {
          var r = Number(it.ref) || 1, m = Number(it.menge) || 0;
          s.kcal += (Number(it.kcal) || 0) * m / r;
          s.kh   += (Number(it.kh)   || 0) * m / r;
          s.f    += (Number(it.f)    || 0) * m / r;
          s.p    += (Number(it.p)    || 0) * m / r;
        });
        csv += "\n" + csvRow([
          window.fmtDate(d),
          csvNum(s.kcal, 0), csvNum(s.kh, 1), csvNum(s.f, 1), csvNum(s.p, 1),
          goal ? csvNum(goal.kcal, 0) : "",
          goal ? csvNum(s.kcal - goal.kcal, 0) : "",
          items.length
        ]);
      });

      csv += "\n\n# ERNÄHRUNG – POSTEN\n" +
             csvRow(["Datum", "Produkt", "Menge", "Einheit",
                     "kcal", "KH (g)", "Fett (g)", "Protein (g)"]);
      days.forEach(function (d) {
        (food[d] || []).forEach(function (it) {
          var r = Number(it.ref) || 1, m = Number(it.menge) || 0;
          csv += "\n" + csvRow([
            window.fmtDate(d), it.n, csvNum(m, 1),
            (r === 100 ? (it.unit === "ml" ? "ml" : "g") : it.unit),
            csvNum((Number(it.kcal) || 0) * m / r, 0),
            csvNum((Number(it.kh)   || 0) * m / r, 1),
            csvNum((Number(it.f)    || 0) * m / r, 1),
            csvNum((Number(it.p)    || 0) * m / r, 1)
          ]);
        });
      });
    }
  }

  return csv;
}

/* Download-Button auf dieselbe Quelle umstellen, damit manueller
   Export und Upload nicht auseinanderlaufen koennen. */
function installExport() {
  window.exportCSV = function () {
    var url = URL.createObjectURL(new Blob(["\uFEFF" + buildCSV()],
              { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = "training-log-" + window.todayStr() + ".csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
}

/* ─── GitHub Contents API ───────────────────────────────── */
function gh(path, opts) {
  var c = cfg();
  opts = opts || {};
  opts.headers = Object.assign({
    "Authorization": "Bearer " + c.token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  }, opts.headers || {});
  return fetch(API + "/repos/" + c.owner + "/" + c.repo + "/contents/" + path, opts);
}

function getSha(path) {
  return gh(path).then(function (r) {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("GET " + path + ": HTTP " + r.status);
    return r.json().then(function (j) { return j.sha; });
  });
}

function putFile(path, content, msg) {
  return getSha(path).then(function (sha) {
    var body = { message: msg, content: b64(content), branch: cfg().branch || "main" };
    if (sha) body.sha = sha;
    return gh(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }).then(function (r) {
    if (r.ok) return true;
    return r.text().then(function (t) {
      var hint = r.status === 401 ? " – Token ungueltig oder abgelaufen"
               : r.status === 403 ? " – Token hat keine Contents-Schreibrechte"
               : r.status === 404 ? " – Repo nicht gefunden oder Token nicht dafuer freigegeben"
               : "";
      throw new Error("PUT " + path + ": HTTP " + r.status + hint + " " + t.slice(0, 120));
    });
  });
}

/* ─── Nutzdaten ─────────────────────────────────────────── */
function buildJSON() {
  var keys = {};
  DATA_KEYS.forEach(function (k) { keys[k] = localStorage.getItem(k); });
  return JSON.stringify({ v: 1, ts: new Date().toISOString(), keys: keys }, null, 1);
}

/* ─── Schutz gegen Ueberschreiben ───────────────────────────
   01.10.: Nach "Website-Daten loeschen" hat ein leeres Geraet beim
   Eintragen des Tokens sofort gesichert und das volle Backup durch
   einen leeren Stand ersetzt. Deshalb vor jedem Upload: Hat das
   Geraet deutlich weniger Daten als das Backup, wird nicht gesichert.
   Manuell ("Jetzt sichern") laesst es sich nach Rueckfrage erzwingen. */
var GUARD_KEYS = ["tl-e", "tl-w", "tl-d", "tl-f"];
function countKeys(get) {
  var n = 0;
  GUARD_KEYS.forEach(function (k) {
    try {
      var v = JSON.parse(get(k) || "null");
      if (Array.isArray(v)) n += v.length;
      else if (v && typeof v === "object") n += Object.keys(v).length;
    } catch (e) { /* unlesbar = 0 */ }
  });
  return n;
}
function guardShrink(manual) {
  return gh("backup.json").then(function (r) {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("GET backup.json: HTTP " + r.status);
    return r.json();
  }).then(function (j) {
    if (!j || !j.content) return;             // kein Backup oder > 1 MB
    var dump = JSON.parse(unb64(j.content));
    if (!dump || !dump.keys) return;
    var remote = countKeys(function (k) { return dump.keys[k]; });
    var local  = countKeys(function (k) { return localStorage.getItem(k); });
    if (remote === 0 || local >= remote * 0.5) return;
    var msg = "Gesperrt: Geraet hat " + local + " Datensaetze, Backup " + remote +
              ". Erst \u2193 Wiederherstellen.";
    if (!manual) throw new Error(msg);
    return window.tlAsk.typed({
      title: "Backup überschreiben?",
      text: "Das Backup enthält " + remote + " Datensätze, dieses Gerät nur " + local + ".\n" +
            "Sichern würde das Backup durch diesen Stand ersetzen.\n\n" +
            "Normalerweise ist jetzt \u2193 Wiederherstellen richtig.",
      word: "UEBERSCHREIBEN", ok: "Überschreiben"
    }).then(function (yes) { if (!yes) throw new Error(msg); });
  });
}

/* ─── Sync ──────────────────────────────────────────────── */
function sync(manual) {
  if (running || !configured()) return Promise.resolve(false);
  if (!navigator.onLine) { if (manual) flash("Offline – wird nachgeholt"); return Promise.resolve(false); }
  running = true;
  render();

  var stamp = new Date().toISOString();
  var seqAtStart = seq;
  // backup.json zuerst – der Wiederherstellungspfad ist das
  // Wichtigere und darf nicht an einem CSV-Fehler scheitern.
  return guardShrink(manual)
    .then(function () { return putFile("backup.json", buildJSON(), "backup " + stamp); })
    .then(function () {
      var csv;
      try { csv = buildCSV(); }
      catch (e) { console.warn("CSV uebersprungen:", e.message); return; }
      return putFile("export.csv", csv, "export " + stamp);
    })
    .then(function () {
      /* Nur "sauber" melden, wenn waehrend des Sicherns nichts Neues kam.
         Sonst bliebe eine Aenderung ohne dirty-Flag liegen und der
         Flush beim Verlassen der App wuerde sie uebergehen. */
      var c = cfg(); c.lastOk = stamp; c.dirty = (seq !== seqAtStart); delete c.lastErr; saveCfg(c);
      if (manual) flash("Gesichert");
      return true;
    })
    .catch(function (e) {
      var c = cfg(); c.dirty = true; c.lastErr = e.message; saveCfg(c);
      if (manual) flash("Fehler – siehe Status");
      console.error("Sync:", e);
      return false;
    })
    .then(function (ok) { running = false; render(); return ok; });
}

function schedule() {
  seq++;
  var c = cfg(); c.dirty = true; saveCfg(c);
  clearTimeout(timer);
  timer = setTimeout(function () { sync(false); }, DEBOUNCE);
  render();
}

/* Aenderungen an den Datenkeys abfangen – erfasst auch daily.js
   und tracker.js, die beide direkt auf localStorage schreiben. */
function hookStorage() {
  var setI = localStorage.setItem.bind(localStorage);
  var remI = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    setI(k, v);
    if (DATA_KEYS.indexOf(k) !== -1) schedule();
  };
  localStorage.removeItem = function (k) {
    remI(k);
    if (DATA_KEYS.indexOf(k) !== -1) schedule();
  };
}

/* ─── Wiederherstellung ─────────────────────────────────── */
function restore() {
  if (!configured()) return;
  var ABBRUCH = {};
  window.tlAsk.confirm({
    title: "Backup laden?", text: "Alle Daten auf diesem Gerät werden dabei überschrieben.",
    ok: "Weiter", danger: true
  }).then(function (yes) {
    if (!yes) throw ABBRUCH;
    return gh("backup.json");
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (j) {
    var dump = JSON.parse(unb64(j.content));
    if (!dump || !dump.keys) throw new Error("Backup unlesbar");
    return window.tlAsk.confirm({
      title: "Einspielen?", text: "Backup vom " + fmtStamp(dump.ts) + " einspielen?",
      ok: "Einspielen", danger: true
    }).then(function (yes) { if (!yes) throw ABBRUCH; return dump; });
  }).then(function (dump) {
    DATA_KEYS.forEach(function (k) {
      // Keys, die im Dump gar nicht vorkommen (aelteres Backup),
      // bleiben unangetastet statt geloescht zu werden.
      if (!(k in dump.keys)) return;
      if (dump.keys[k] === null || typeof dump.keys[k] === "undefined") localStorage.removeItem(k);
      else localStorage.setItem(k, dump.keys[k]);
    });
    location.reload();
  }).catch(function (e) {
    if (e === ABBRUCH) return;
    window.tlAsk.alert({ title: "Wiederherstellung fehlgeschlagen", text: e.message });
  });
}

/* ─── UI ────────────────────────────────────────────────── */
function statusHTML() {
  var c = cfg();
  if (!configured())
    return '<span style="color:var(--muted)">Backup nicht eingerichtet</span>';
  if (running) return "Sichert …";
  var line = "Letzte Sicherung: <strong>" + fmtStamp(c.lastOk) + "</strong>";
  if (c.lastErr)
    line += '<br><span style="color:var(--legs)">⚠️ Letzter Versuch fehlgeschlagen: ' +
            c.lastErr.replace(/</g, "&lt;").slice(0, 160) + "</span>";
  else if (daysSince(c.lastOk) > STALE_D)
    line += '<br><span style="color:var(--legs)">⚠️ Aelter als ' + STALE_D +
            " Tage – Token abgelaufen oder Sync gestoert.</span>";
  else if (c.dirty)
    line += '<br><span style="color:var(--muted)">Aenderungen ausstehend</span>';
  return line;
}

function render() {
  var box = document.getElementById("sync-status");
  if (box) box.innerHTML = statusHTML();
  var btn = document.getElementById("sync-now");
  if (btn) btn.disabled = running || !configured();
}

function settings() {
  var c0 = cfg();
  return window.tlAsk.form({
    title: "Backup-Einstellungen", ok: "Speichern",
    fields: [
      { key: "owner", label: "GitHub-Benutzer", type: "text", value: c0.owner || "r1bozyme" },
      { key: "repo",  label: "Privates Daten-Repo", type: "text", value: c0.repo || "training-log-data" },
      { key: "token", label: "Fine-grained Token", type: "password",
        placeholder: c0.token ? "leer lassen = unverändert" : "github_pat_…" }
    ]
  }).then(function (r) { if (r) applySettings(r.owner, r.repo, r.token); });
}

function applySettings(owner, repo, token) {
  var c = cfg();
  c.owner = owner.trim();
  c.repo  = repo.trim();
  c.branch = c.branch || "main";
  if (token.trim()) c.token = token.trim();
  delete c.lastErr;
  saveCfg(c);
  render();
  if (!configured()) return;
  // Nie mit Override sichern: Ein frisch eingerichtetes Geraet ist
  // typischerweise leer. Greift die Sperre, direkt Wiederherstellen anbieten.
  sync(false).then(function (ok) {
    var e = cfg().lastErr || "";
    if (!ok && e.indexOf("Gesperrt") === 0) restore();
    else if (ok) flash("Gesichert");
  });
}

function mount() {
  var view = document.getElementById("view-log");
  if (!view || document.getElementById("sync-box")) return;
  var box = document.createElement("div");
  box.className = "wnote";
  box.id = "sync-box";
  box.innerHTML =
    '<div id="sync-status" style="margin-bottom:10px">' + statusHTML() + "</div>" +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="sync-now" class="fbtn">↑ Jetzt sichern</button>' +
      '<button id="sync-cfg" class="fbtn">⚙︎ Einstellungen</button>' +
      '<button id="sync-res" class="fbtn">↓ Wiederherstellen</button>' +
    "</div>";
  view.appendChild(box);
  document.getElementById("sync-now").onclick = function () { sync(true); };
  document.getElementById("sync-cfg").onclick = settings;
  document.getElementById("sync-res").onclick = restore;
  render();
}

/* ─── Init ──────────────────────────────────────────────── */
function init() {
  installExport();
  hookStorage();
  mount();

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) { origShow(v); if (v === "log") { mount(); render(); } };
  }

  window.addEventListener("online", function () { if (cfg().dirty) sync(false); });
  /* Beim Verlassen sofort sichern statt die 8 s abzuwarten – die
     Erinnerungen (push.js) lesen den Stand aus dem Backup. Laeuft
     gerade ein Sync, holt der Nachlauf unten den Rest. */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden" || !cfg().dirty) return;
    clearTimeout(timer);
    if (running) { timer = setTimeout(function () { sync(false); }, 1500); return; }
    sync(false);
  });

  // Offener Rest aus der letzten Sitzung
  if (cfg().dirty) setTimeout(function () { sync(false); }, 3000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.tlSync = { run: sync, restore: restore, settings: settings, csv: buildCSV,
                   put: putFile, ready: configured, get: gh };

})();
