/* ═══════════════════════════════════════════════════
   uebung.js – Testübungen per Freitext + Overhead-Umzug (22.10.2026)

   Anlass: Overhead Cable Extensions liefen seit 04.10. unter
   "Triceps Press" (Gewicht oder Notiz), am 22.10. dazu Cable
   Trizeps Push-Downs. Das verfälscht Verlauf und Erhöhungs-Signal
   der Triceps Press (Kurve springt zwischen 100 kg und 15 kg).

   FREITEXT
     · Im Übungs-Dropdown ganz unten "＋ Andere Übung …". Darunter
       erscheint ein Namensfeld; früher verwendete Testnamen werden
       vorgeschlagen, damit keine Schreibvarianten entstehen.
     · Gespeichert wird ein ganz normaler Eintrag, Übung = der Name.
       Testübung heißt einfach: Name steht nicht in PLAN.
     · Folgen: erscheint in Log, Statistik, Übungsverlauf und Export.
       Kein Erhöhungs-Signal, kein Progressions-Band, ein manuelles
       "↑ Erhöhen" landet nicht im grünen Kasten (progress.js).
     · Übernahme als feste Übung: beim Review mit genau diesem Namen
       in plan.js eintragen – alle bisherigen Einträge gehören dann
       automatisch dazu.

   UMZUG (läuft bei jedem Start, idempotent, nur Einträge ≤ 22.10.,
   damit ein älteres Backup nach "↓ Wiederherstellen" mitkorrigiert wird):
     A) Triceps Press, Notiz beginnt mit "Overhead Cable Extension",
        Gewicht < 60 kg → Übung "Overhead Cable Extensions".
     B) Triceps Press, Notiz "Zuerst/Vorher/Danach Overhead Cable
        Extension 3x12 @12,5 kg …" → eigener Overhead-Eintrag am
        selben Tag (vor bzw. nach der Triceps Press), Notiz der
        Triceps Press um diesen Teil gekürzt.
     C) Triceps Press, Notiz beginnt mit "Cable Trizeps Push-Downs",
        Gewicht < 60 kg → Testübung "Cable Trizeps Push-Downs".

   Kein eigener Storage-Key. Lädt nach progress.js (umschließt dessen
   refreshHint/saveEntry) und vor tracker.js.
   ═══════════════════════════════════════════════════ */

(function () {
"use strict";

var FREI = "__frei__";
var OHE = "Overhead Cable Extensions";
var PD = "Cable Trizeps Push-Downs";
var CUTOFF = "2026-10-22";

function clean(s) { return String(s == null ? "" : s).trim(); }
function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? null : n; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function nameClean(s) { return clean(s).replace(/[<>"&`]/g, "").replace(/\s+/g, " ").slice(0, 60); }

function imPlan(name, ein) {
  if (typeof PLAN === "undefined") return false;
  var eins = ein ? [ein] : ["Push", "Pull", "Legs"];
  return eins.some(function (e) { return (PLAN[e] || []).some(function (x) { return x.name === name; }); });
}

function load() { try { return JSON.parse(localStorage.getItem("tl-e") || "[]"); } catch (e) { return null; } }

/* ─── Umzug ────────────────────────────────────────── */
var RX_A = /^\s*overhead\s*cable\s*extensions?\b[\s!.:,;–-]*/i;
var RX_C = /^\s*cable\s*tri[cz]eps\s*push-?\s*downs?\b[\s!.:,;–-]*/i;
var RX_B = /(zuerst|vorher|danach)\s+overhead\s*cable\s*extensions?\s+(\d)\s*x\s*(\d+)\s*@\s*([\d]+(?:[.,]\d+)?)\s*kg\.?\s*((?:höhen(?:einstellung)?|höhe)[^.]*\.?)?/i;

function migrate() {
  var arr = load();
  if (!arr) return 0;
  var ids = {};
  arr.forEach(function (e) { ids[e.id] = true; });
  var n = 0, out = [];

  arr.forEach(function (e) {
    var tp = e && e.uebung === "Triceps Press" && String(e.date || "") <= CUTOFF;
    var not = clean(e && e.notiz), g = num(e && e.gewicht);

    if (tp && g !== null && g < 60 && RX_A.test(not)) {
      e.uebung = OHE; e.notiz = clean(not.replace(RX_A, "")); n++;
      out.push(e); return;
    }
    if (tp && g !== null && g < 60 && RX_C.test(not)) {
      e.uebung = PD; e.notiz = clean(not.replace(RX_C, "")); n++;
      out.push(e); return;
    }
    var m = tp ? not.match(RX_B) : null;
    if (m) {
      var reps = parseInt(m[3], 10), saetze = Math.min(4, parseInt(m[2], 10));
      var hoehe = clean(m[5] || "").replace(/^höhe(neinstellung)?\s*:?\s*/i, "").replace(/^stufe\s*/i, "").replace(/\.$/, "");
      var neu = {
        id: 0, date: e.date, einheit: e.einheit || "Push", uebung: OHE,
        gewicht: String(num(m[4])), s1: "", s2: "", s3: "", s4: "",
        notiz: (hoehe ? "Höhe Stufe " + hoehe + " · " : "") + "aus Notiz der Triceps Press übernommen",
        erhoehen: false
      };
      for (var i = 1; i <= saetze; i++) neu["s" + i] = String(reps);
      if (e.studio) neu.studio = e.studio;
      var vor = /zuerst|vorher/i.test(m[1]);
      var id = e.id + (vor ? -1 : 1);
      while (ids[id]) id += vor ? -1 : 1;
      neu.id = id; ids[id] = true;
      e.notiz = clean(not.replace(m[0], "").replace(/^[\s.,;–-]+|[\s,;–-]+$/g, ""));
      n++;
      if (vor) { out.push(neu); out.push(e); } else { out.push(e); out.push(neu); }
      return;
    }
    out.push(e);
  });

  if (n) localStorage.setItem("tl-e", JSON.stringify(out));
  return n;
}

/* ─── Formular ─────────────────────────────────────── */
var CSS = `
.fx-wrap { display: none; margin: -6px 0 16px; }
.fx-wrap.show { display: block; }
.fx-wrap input { margin-bottom: 6px; }
.fx-hint { font-size: 12px; line-height: 1.5; color: var(--muted); }
.fx-hint b { color: var(--text); }
`;

function freiNamen() {
  var arr = load() || [], ein = (typeof curEinheit !== "undefined") ? curEinheit : "";
  var hier = [], sonst = [];
  arr.forEach(function (e) {
    var n = clean(e.uebung);
    if (!n || imPlan(n)) return;
    var ziel = e.einheit === ein ? hier : sonst;
    if (hier.indexOf(n) === -1 && sonst.indexOf(n) === -1) ziel.push(n);
  });
  return hier.sort().concat(sonst.sort());
}

function fillListe() {
  var dl = document.getElementById("fx-list");
  if (dl) dl.innerHTML = freiNamen().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
}

function sel() { return document.getElementById("f-uebung"); }
function istFrei() { var s = sel(); return !!s && s.value === FREI; }

function optionDazu() {
  var s = sel();
  if (!s || s.querySelector('option[value="' + FREI + '"]')) return;
  var o = document.createElement("option");
  o.value = FREI; o.textContent = "＋ Andere Übung …";
  s.appendChild(o);
}

function inject() {
  var s = sel();
  if (!s || document.getElementById("fx-wrap")) return;
  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  var w = document.createElement("div");
  w.id = "fx-wrap";
  w.className = "fx-wrap";
  w.innerHTML =
    '<input type="text" id="f-frei" list="fx-list" autocomplete="off" placeholder="Name der Übung, z. B. Cable Push-Downs">' +
    '<datalist id="fx-list"></datalist>' +
    '<div class="fx-hint"><b>Testübung:</b> erscheint in Log, Verlauf und Export, aber ohne Erhöhungs-Signal. ' +
    'Soll sie fest in den Plan, beim Review Bescheid geben – der Verlauf bleibt erhalten.</div>';
  s.parentNode.insertBefore(w, s.nextSibling);

  document.getElementById("f-frei").addEventListener("input", function () {
    var n = nameClean(this.value);
    if (n && typeof window.showLastEntry === "function") window.showLastEntry(n);
    else { var le = document.getElementById("last-entry"); if (le) le.classList.remove("show"); }
  });
  optionDazu();
}

/* ─── Hooks ────────────────────────────────────────── */
function hook() {
  var origFill = window.fillUebung;
  if (typeof origFill === "function") {
    window.fillUebung = function () { var r = origFill.apply(this, arguments); optionDazu(); return r; };
  }

  var origHint = window.refreshHint;
  if (typeof origHint === "function") {
    window.refreshHint = function () {
      var w = document.getElementById("fx-wrap");
      if (!istFrei()) {
        if (w) w.classList.remove("show");
        return origHint.apply(this, arguments);
      }
      if (w) w.classList.add("show");
      fillListe();
      var h = document.getElementById("hint"); if (h) h.classList.remove("show");
      var b = document.getElementById("pg-band"); if (b) b.innerHTML = "";
      var n = nameClean((document.getElementById("f-frei") || {}).value);
      if (n && typeof window.showLastEntry === "function") window.showLastEntry(n);
      else { var le = document.getElementById("last-entry"); if (le) le.classList.remove("show"); }
      if (typeof window.setTimerDefaults === "function") window.setTimerDefaults("isolation");
    };
  }

  var origSave = window.saveEntry;
  if (typeof origSave === "function") {
    window.saveEntry = function () {
      if (!istFrei()) return origSave.apply(this, arguments);
      var inp = document.getElementById("f-frei");
      var n = nameClean(inp && inp.value);
      if (!n) {
        if (typeof window.showFlash === "function") window.showFlash("Bitte den Namen der Übung eingeben");
        if (inp) inp.focus();
        return;
      }
      var s = sel();
      var tmp = document.createElement("option");
      tmp.value = n; tmp.textContent = n;
      s.appendChild(tmp);
      s.value = n;
      var res;
      try { res = origSave.apply(this, arguments); }
      finally {
        if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
        optionDazu();
        s.value = FREI;
        if (inp) inp.value = n;
        window.refreshHint();
      }
      return res;
    };
  }

  var origEdit = window.startEdit;
  if (typeof origEdit === "function") {
    window.startEdit = function (id) {
      var r = origEdit.apply(this, arguments);
      var e = (load() || []).find(function (x) { return x.id === id; });
      if (e && e.uebung && !imPlan(e.uebung, e.einheit)) {
        optionDazu();
        sel().value = FREI;
        var inp = document.getElementById("f-frei");
        if (inp) inp.value = e.uebung;
        window.refreshHint();
      }
      return r;
    };
  }
}

function init() {
  var n = migrate();
  inject();
  hook();
  if (istFrei()) window.refreshHint();
  if (n) {
    if (typeof window.renderLog === "function" && document.getElementById("view-log")) window.renderLog();
    if (typeof window.showFlash === "function")
      window.showFlash(n + " Trizeps-Einträge auf eigene Übungen umgezogen ✓");
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
