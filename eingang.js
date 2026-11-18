/* ═══════════════════════════════════════════════════
   eingang.js – Posten aus dem Claude-Chat übernehmen (18.11.2026)

   Ergänzung zum Speisekarten-Scanner (speise.js): Was im Chat geschätzt
   oder zusammengerechnet wurde, schreibt Claude als Einmal-Posten in
   eingang.json im Daten-Repo (training-log-data, gleicher Zugang wie
   backup.json über tlSync). Die App fragt beim Start bzw. beim Zurück-
   kehren in die App, ob sie übernommen werden sollen.

   Format eingang.json:
     { "posten": [ { "id": "c-…", "datum": "JJJJ-MM-TT", "n": "Name",
                     "kcal": 0, "kh": 0, "f": 0, "p": 0 } ] }

   Übernommen wird über foodAddFrei (tracker.js): Name mit „~“, Menge
   1 Portion, est:1, Tag als „geschätzt“ markiert – genau wie aus dem
   Scanner. Doppelte Übernahme verhindert die Chat-ID (cid) am Posten.
   Danach werden nur die übernommenen Posten aus der Datei entfernt.
   „Abbrechen“ = später; die App fragt beim nächsten Start erneut.
   Kein eigener localStorage-Key.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var PFAD = "eingang.json";
var letzte = 0, offen = false;

function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; } }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function heute() { return iso(new Date()); }
function dm(s) { var d = new Date(s + "T12:00:00"); return ["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()] + " " + s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function zahl(v) { v = Number(v); return isFinite(v) && v >= 0 && v < 10000 ? Math.round(v * 10) / 10 : null; }

function gueltig(x) {
  if (!x || typeof x.id !== "string" || !x.id) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.datum || "") || x.datum > heute()) return false;
  if (typeof x.n !== "string" || !x.n.trim()) return false;
  return ["kcal", "kh", "f", "p"].every(function (k) { return zahl(x[k]) !== null; });
}
function schonDa(x) {
  var f = readJSON("tl-f", {});
  return (f[x.datum] || []).some(function (it) { return it.cid === x.id; });
}
function holen() {
  return window.tlSync.get(PFAD, { cache: "no-store", headers: { "Accept": "application/vnd.github.raw+json" } })
    .then(function (r) { if (r.status === 404) return { posten: [] }; if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
}

function pruefen(force) {
  var S = window.tlSync;
  if (offen || !S || !S.ready || !S.ready() || !S.get || !S.put) return;
  if (!force && Date.now() - letzte < 60e3) return;
  letzte = Date.now();
  holen().then(function (j) {
    var alle = (j && Array.isArray(j.posten)) ? j.posten : [];
    var neu = alle.filter(function (x) { return gueltig(x) && !schonDa(x); });
    var erledigt = alle.filter(function (x) { return gueltig(x) && schonDa(x); });
    if (!neu.length) {
      if (erledigt.length) aufraeumen(erledigt);   // z. B. Übernahme ok, Leeren schlug fehl
      else if (force && window.showFlash) showFlash("Keine Posten aus dem Chat");
      return;
    }
    var tage = {};
    neu.forEach(function (x) { (tage[x.datum] = tage[x.datum] || []).push(x); });
    var text = Object.keys(tage).sort().map(function (d) {
      var s = { kcal: 0, kh: 0, f: 0, p: 0 };
      var z = tage[d].map(function (x) {
        ["kcal", "kh", "f", "p"].forEach(function (k) { s[k] += zahl(x[k]); });
        return "• ~ " + x.n.replace(/^~\s*/, "") + " – " + Math.round(x.kcal) + " kcal · " + Math.round(x.kh) + " KH · " + Math.round(x.f) + " F · " + Math.round(x.p) + " P";
      });
      return dm(d) + ":\n" + z.join("\n") + "\nZusammen: " + Math.round(s.kcal) + " kcal · " + Math.round(s.kh) + " KH · " + Math.round(s.f) + " F · " + Math.round(s.p) + " P";
    }).join("\n\n");
    offen = true;
    return window.tlAsk.confirm({
      title: neu.length + (neu.length === 1 ? " Posten" : " Posten") + " aus dem Chat",
      text: text + "\n\nAls geschätzte Einmal-Posten übernehmen? Der Tag wird als „geschätzt“ markiert, Werte sind danach mit ✎ änderbar.",
      ok: "Übernehmen"
    }).then(function (ja) {
      offen = false;
      if (!ja) return;
      neu.forEach(function (x) {
        window.foodAddFrei({ datum: x.datum, cid: x.id, n: "~ " + x.n.replace(/^~\s*/, ""), kcal: x.kcal, kh: x.kh, f: x.f, p: x.p, still: true });
      });
      if (typeof window.buildFood === "function") window.buildFood();
      if (window.showFlash) showFlash(neu.length + " Posten übernommen · Tag geschätzt ✓");
      aufraeumen(neu);
    }, function () { offen = false; });
  }).catch(function (e) { offen = false; if (force && window.showFlash) showFlash("Eingang nicht erreichbar"); });
}

/* Nur die übernommenen Posten entfernen – frisch lesen, damit zwischen-
   zeitlich neu eingetragene Chat-Posten stehen bleiben. */
function aufraeumen(weg) {
  var ids = {}; weg.forEach(function (x) { ids[x.id] = 1; });
  holen().then(function (j) {
    var rest = ((j && Array.isArray(j.posten)) ? j.posten : []).filter(function (x) { return !(x && ids[x.id]); });
    return window.tlSync.put(PFAD, JSON.stringify({ posten: rest }, null, 1) + "\n", "eingang: " + weg.length + " Posten übernommen");
  }).catch(function () { /* nächster Start räumt über „schonDa“ auf */ });
}
window.tlEingang = function () { pruefen(true); };

function init() {
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") setTimeout(function () { pruefen(false); }, 2500);
  });
  setTimeout(function () { pruefen(false); }, 5000);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
