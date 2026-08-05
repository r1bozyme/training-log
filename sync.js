/* ─────────────────────────────────────────────────────────────
   sync.js — Backup der App-Daten in ein privates GitHub-Repo.

   Zweck: Die vier localStorage-Keys (tl-e, tl-w, tl-w0, tl-d)
   liegen sonst ausschliesslich auf diesem Geraet. Dieses Modul
   schreibt sie nach jeder Aenderung in ein privates Repo:

     backup.json  vollstaendiger Dump  -> Wiederherstellungspfad
     export.csv   identisch zum manuellen Export -> Monatsreview

   Der Token liegt NUR im localStorage dieses Geraets (Key tl-sync)
   und darf niemals in den Code oder ins oeffentliche Repo.
   ───────────────────────────────────────────────────────────── */
(function () {
"use strict";

var CFG_KEY   = "tl-sync";
var DATA_KEYS = ["tl-e", "tl-w", "tl-w0", "tl-d"];
var DEBOUNCE  = 8000;          // ms nach letzter Aenderung
var STALE_D   = 7;             // Tage bis Warnung
var API       = "https://api.github.com";

var timer = null, running = false;

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

/* ─── Nutzdaten ─────────────────────────────────────────── */
function buildJSON() {
  var keys = {};
  DATA_KEYS.forEach(function (k) { keys[k] = localStorage.getItem(k); });
  return JSON.stringify({ v: 1, ts: new Date().toISOString(), keys: keys }, null, 1);
}

/* exportCSV() wiederverwenden, statt die Logik zu duplizieren.
   Download unterdruecken, Blob abfangen. daily.js patcht exportCSV
   bereits nach demselben Muster – unsere Huelle liegt aussen und
   bekommt daher die fertige, um die Taeglich-Sektion ergaenzte
   Fassung. Faellt exportCSV aus, bleibt backup.json unberuehrt. */
function buildCSV() {
  return new Promise(function (resolve, reject) {
    if (typeof window.exportCSV !== "function") return reject(new Error("exportCSV fehlt"));
    var origCreate = URL.createObjectURL;
    var origRevoke = URL.revokeObjectURL;
    var origClick  = HTMLAnchorElement.prototype.click;
    var grabbed    = null;

    URL.createObjectURL = function (blob) { grabbed = blob; return "blob:captured"; };
    URL.revokeObjectURL = function () {};
    HTMLAnchorElement.prototype.click = function () {};

    var restore = function () {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    };

    try { window.exportCSV(); } catch (e) { restore(); return reject(e); }
    restore();

    if (!grabbed) return reject(new Error("kein CSV erzeugt"));
    grabbed.text().then(function (t) {
      resolve(t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t);
    }).catch(reject);
  });
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

/* ─── Sync ──────────────────────────────────────────────── */
function sync(manual) {
  if (running || !configured()) return Promise.resolve(false);
  if (!navigator.onLine) { if (manual) flash("Offline – wird nachgeholt"); return Promise.resolve(false); }
  running = true;
  render();

  var stamp = new Date().toISOString();
  return putFile("backup.json", buildJSON(), "backup " + stamp)
    .then(function () {
      return buildCSV()
        .then(function (csv) { return putFile("export.csv", csv, "export " + stamp); })
        .catch(function (e) { console.warn("CSV uebersprungen:", e.message); });
    })
    .then(function () {
      var c = cfg(); c.lastOk = stamp; c.dirty = false; delete c.lastErr; saveCfg(c);
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
  var c = cfg(); c.dirty = true; saveCfg(c);
  clearTimeout(timer);
  timer = setTimeout(function () { sync(false); }, DEBOUNCE);
  render();
}

/* Aenderungen an den Datenkeys abfangen – erfasst auch daily.js */
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
  if (!confirm("Backup aus GitHub laden?\n\nAlle Daten auf diesem Geraet werden dabei ueberschrieben.")) return;
  gh("backup.json").then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (j) {
    var dump = JSON.parse(unb64(j.content));
    if (!dump || !dump.keys) throw new Error("Backup unlesbar");
    if (!confirm("Backup vom " + fmtStamp(dump.ts) + " einspielen?")) return;
    DATA_KEYS.forEach(function (k) {
      if (dump.keys[k] === null || typeof dump.keys[k] === "undefined") localStorage.removeItem(k);
      else localStorage.setItem(k, dump.keys[k]);
    });
    location.reload();
  }).catch(function (e) {
    alert("Wiederherstellung fehlgeschlagen: " + e.message);
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
  var c = cfg();
  var owner = prompt("GitHub-Benutzer (Owner):", c.owner || "r1bozyme");
  if (owner === null) return;
  var repo = prompt("Privates Daten-Repo:", c.repo || "training-log-data");
  if (repo === null) return;
  var token = prompt("Fine-grained Token (leer lassen = unveraendert):", "");
  if (token === null) return;
  c.owner = owner.trim();
  c.repo  = repo.trim();
  c.branch = c.branch || "main";
  if (token.trim()) c.token = token.trim();
  delete c.lastErr;
  saveCfg(c);
  render();
  if (configured()) sync(true);
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
  hookStorage();
  mount();

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) { origShow(v); if (v === "log") { mount(); render(); } };
  }

  window.addEventListener("online", function () { if (cfg().dirty) sync(false); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && cfg().dirty) sync(false);
  });

  // Offener Rest aus der letzten Sitzung
  if (cfg().dirty) setTimeout(function () { sync(false); }, 3000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.tlSync = { run: sync, restore: restore, settings: settings };

})();
