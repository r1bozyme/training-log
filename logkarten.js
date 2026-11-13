/* ═══════════════════════════════════════════════════
   logkarten.js – Log nach Trainingstagen (13.11.2026)

   Vorher stand jedes der ~650 Einträge als eigene Karte im Log
   (~49.000 px), Backup, Export und Erinnerungen ganz unten.
   Jetzt:
     • eine Karte je Trainingstag (Push+Pull am selben Tag = eine Karte),
       Kopf mit Einheiten, Zahl der Übungen, Studio und ↑-Markierungen;
       ein Tipp klappt die Übungen auf (✎ bearbeiten, × löschen wie bisher),
       der jüngste Tag ist offen
     • sichtbar die letzten 4 Wochen, „Ältere laden“ holt je 4 weitere
     • Filter Push/Pull/Legs wirken wie bisher; der Filter ↑ Erhöhen und der
       Übungsverlauf (progress.js) bleiben unverändert
     • Backup bleibt sichtbar unter dem Log; CSV-Export und Erinnerungen
       in einem aufklappbaren Abschnitt darunter

   Ersetzt die Grundfassung von renderLog aus index.html. Lädt vor
   progress.js, damit dessen Erweiterung (Erhöhung fällig, Übungsverlauf)
   weiter außen liegt. Daten und Aktionen (startEdit, handleDel, Export)
   bleiben unverändert in index.html.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";
if (window.tlLogKarten) return;

var baseLog = window.renderLog;              // Grundfassung (index.html), für den Filter ↑ Erhöhen
if (typeof baseLog !== "function") return;

var FENSTER = 28;                            // Tage je „Ältere laden“
var tage = FENSTER;
var offen = null;                            // { "2026-11-12": true }, null = jüngster Tag offen
var UIKEY = "tlui-log";

function ui() { try { return JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch (e) { return {}; } }
function setUi(k, v) { var s = ui(); s[k] = v; try { localStorage.setItem(UIKEY, JSON.stringify(s)); } catch (e) {} }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function minus(n) { var d = new Date(); d.setHours(12); d.setDate(d.getDate() - n); return iso(d); }
var WT = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
function kopfDatum(s) { var d = new Date(s + "T12:00:00"); return WT[d.getDay()] + ", " + s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function studioLabel(e) { return window.tlStudio && typeof window.tlStudio.label === "function" ? window.tlStudio.label(e) : ""; }

function zeile(e, tagStudio) {
  var sets = [e.s1, e.s2, e.s3, e.s4].filter(Boolean).join(" / ");
  var st = studioLabel(e);
  var meta = [e.gewicht ? String(e.gewicht).replace(".", ",") + " kg" : null, sets ? sets + " Wdh" : null,
              st && st !== tagStudio ? "📍 " + esc(st) : null, e.notiz ? esc(e.notiz) : null].filter(Boolean).join(" · ");
  var ip = pendingDel === e.id;
  return '<div class="lk-row">' +
    '<span class="ebdg badge-' + e.einheit + '">' + String(e.einheit).toUpperCase() + '</span>' +
    '<div class="ei"><div class="en">' + esc(e.uebung) + '</div>' + (meta ? '<div class="em">' + meta + '</div>' : "") + '</div>' +
    (e.erhoehen ? '<span class="ubdg">↑</span>' : "") +
    '<button class="dbtn" onclick="startEdit(' + e.id + ')" style="font-size:15px" aria-label="Bearbeiten">✎</button>' +
    '<button class="dbtn ' + (ip ? "confirm" : "") + '" onclick="handleDel(' + e.id + ')" aria-label="Löschen">' + (ip ? "✓" : "×") + '</button>' +
  '</div>';
}

function renderLog() {
  if (curFilter === "Erhöhen") return baseLog.apply(this, arguments);   // flache Liste wie bisher

  var all = loadEntries();
  document.getElementById("s-tot").textContent = all.length;
  document.getElementById("s-up").textContent = erhoehenList().length;
  document.getElementById("s-days").textContent = new Set(all.map(function (e) { return e.date + e.einheit; })).size;

  var cont = document.getElementById("entries");
  var gefiltert = curFilter === "Alle" ? all : all.filter(function (e) { return e.einheit === curFilter; });
  if (!gefiltert.length) {
    cont.innerHTML = '<div class="empty"><div class="ei2">📋</div><div>Noch keine Einträge</div></div>';
    return;
  }

  /* Tage, jüngster zuerst; innerhalb des Tags Erfassungsreihenfolge */
  var proTag = {};
  gefiltert.forEach(function (e) { (proTag[e.date] = proTag[e.date] || []).push(e); });
  var daten = Object.keys(proTag).sort().reverse();
  var grenze = minus(tage - 1);
  var sichtbar = daten.filter(function (d) { return d >= grenze; });
  if (!sichtbar.length) sichtbar = daten.slice(0, 1);       // lange Pause: wenigstens den letzten Tag
  var rest = daten.length - sichtbar.length;
  if (offen === null) { offen = {}; offen[daten[0]] = true; }

  var h = sichtbar.map(function (d) {
    var es = proTag[d];
    var einh = [];
    es.forEach(function (e) { if (einh.indexOf(e.einheit) === -1) einh.push(e.einheit); });
    einh.sort(function (a, b) { return ["Push", "Pull", "Legs"].indexOf(a) - ["Push", "Pull", "Legs"].indexOf(b); });
    var studios = {};
    es.forEach(function (e) { var s = studioLabel(e); if (s) studios[s] = (studios[s] || 0) + 1; });
    var tagStudio = Object.keys(studios).sort(function (a, b) { return studios[b] - studios[a]; })[0] || "";
    var hoch = es.filter(function (e) { return e.erhoehen; }).length;
    var auf = !!offen[d];
    return '<div class="lk-card' + (auf ? " auf" : "") + '">' +
      '<button type="button" class="lk-hd" onclick="tlLogKarten.toggle(\'' + d + '\')">' +
        '<span class="lk-d">' + kopfDatum(d) + '</span>' +
        '<span class="lk-b">' + einh.map(function (u) { return '<span class="ebdg badge-' + u + '">' + String(u).toUpperCase() + '</span>'; }).join("") + '</span>' +
        '<span class="lk-m">' + es.length + (es.length === 1 ? " Übung" : " Übungen") + (tagStudio ? " · " + esc(tagStudio) : "") + '</span>' +
        (hoch ? '<span class="ubdg">↑' + (hoch > 1 ? hoch : "") + '</span>' : "") +
        '<span class="lk-c">' + (auf ? "▾" : "▸") + '</span>' +
      '</button>' +
      (auf ? '<div class="lk-list">' + es.map(function (e) { return zeile(e, tagStudio); }).join("") + '</div>' : "") +
    '</div>';
  }).join("");
  if (rest > 0) h += '<button type="button" class="lk-more" onclick="tlLogKarten.mehr()">Ältere laden · noch ' + rest + (rest === 1 ? " Trainingstag" : " Trainingstage") + '</button>';
  cont.innerHTML = '<div class="lk-wrap">' + h + '</div>';
}

/* ─── Backup, Export, Erinnerungen ──────────────────── */
function datenBox() {
  var view = document.getElementById("view-log");
  if (!view) return;
  var box = document.getElementById("lk-daten");
  if (!box) {
    box = document.createElement("div");
    box.id = "lk-daten";
    box.innerHTML = '<div class="dhead"><div class="dhl">DATEN</div><div class="dhline"></div></div>' +
      '<div id="lk-sync"></div>' +
      '<div class="lk-card lk-x"><button type="button" class="lk-hd" onclick="tlLogKarten.daten()"><span class="lk-m" style="flex:1">CSV-Export &amp; Erinnerungen</span><span class="lk-c"></span></button>' +
      '<div class="lk-xin"></div></div>';
    view.appendChild(box);
  }
  var sb = document.getElementById("sync-box"), syncSlot = document.getElementById("lk-sync");
  if (sb && sb.parentNode !== syncSlot) syncSlot.appendChild(sb);
  var xin = box.querySelector(".lk-xin");
  var xb = view.querySelector(":scope > .xbtn"), tb = document.getElementById("tlr-box");
  if (xb) xin.appendChild(xb);
  if (tb && tb.parentNode !== xin) xin.appendChild(tb);
  var auf = !!ui().daten;
  box.querySelector(".lk-x").classList.toggle("auf", auf);
  box.querySelector(".lk-x .lk-c").textContent = auf ? "▾" : "▸";
  xin.style.display = auf ? "" : "none";
  if (view.lastElementChild !== box) view.appendChild(box);
}

var CSS = [
  ".lk-wrap { padding: 12px 20px 0; }",
  ".lk-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; overflow: hidden; }",
  ".lk-hd { display: flex; align-items: center; gap: 8px; width: 100%; padding: 13px 14px; border: none; background: transparent; font-family: var(--fb); text-align: left; cursor: pointer; color: var(--text); }",
  ".lk-d { font-family: var(--fd); font-size: 17px; letter-spacing: 1px; flex-shrink: 0; min-width: 78px; }",
  ".lk-b { display: flex; gap: 4px; flex-shrink: 0; }",
  ".lk-m { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  ".lk-c { color: var(--dim); font-size: 12px; flex-shrink: 0; }",
  ".lk-list { border-top: 1px solid var(--border); padding: 2px 14px; }",
  ".lk-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }",
  ".lk-row:last-child { border-bottom: none; }",
  ".lk-row .ei { flex: 1; min-width: 0; }",
  ".lk-row .en { white-space: normal; }",
  ".lk-more { display: block; width: 100%; margin: 4px 0 6px; padding: 12px; border: 1.5px dashed var(--border); border-radius: 12px; background: transparent; font-family: var(--fb); font-weight: 600; font-size: 13px; color: var(--muted); cursor: pointer; }",
  "#lk-daten { padding-bottom: 8px; }",
  "#lk-daten .lk-card { margin: 0 20px 10px; }",
  "#lk-sync .wnote { margin: 0 20px 10px; }",
  ".lk-xin { border-top: 1px solid var(--border); padding: 4px 0 6px; }",
  ".lk-xin .xbtn { margin: 10px 14px; width: calc(100% - 28px); }",
  ".lk-xin .wnote { margin: 6px 14px 8px; border: none; padding: 4px 0; background: transparent; }"
].join("\n");

window.tlLogKarten = {
  toggle: function (d) { if (offen === null) offen = {}; offen[d] = !offen[d]; renderLog(); },
  mehr: function () { tage += FENSTER; window.renderLog(); },
  daten: function () { setUi("daten", !ui().daten); datenBox(); }
};

/* Grundfassung ersetzen: progress.js (lädt danach) umschließt diese Fassung */
window.renderLog = renderLog;

function init() {
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  document.addEventListener("tl:view", function (e) { if (e.detail.view === "log") setTimeout(datenBox, 0); });
  setTimeout(datenBox, 0);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
