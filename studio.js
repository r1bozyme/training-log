/* ═══════════════════════════════════════════════════
   studio.js – Studio pro Eintrag (18.10.2026)

   Anlass: Zwei Wochen Training im alten Studio, dazu ein Probetraining
   bei Fitness First. Andere Maschinen = andere Hebel und Gewichtsskalen.
   Ohne Kennzeichnung liest progress.js die Fremdwerte als echte
   Progression (falsches "Erhöhung umgesetzt" oder scheinbarer Einbruch).

   REGEL
     · Jeder Eintrag trägt optional e.studio (Name).
     · Leer oder gleich dem Heimstudio = Heimstudio. Alte Einträge
       bleiben damit unverändert gültig.
     · Nur Heimstudio-Einträge zählen für das Erhöhungs-Signal, die
       manuellen "↑ Erhöhen"-Markierungen und die Verlaufskurve.
       Fremde Einträge bleiben im Log, im Export und in der Liste
       des Übungsverlaufs – nur eben gekennzeichnet.
     · "Letztes Training" im Eintrag-Tab zeigt den letzten Eintrag aus
       dem gerade gewählten Studio. So siehst du im alten Studio deine
       Werte von dort, nicht die vom Heimstudio.

   BEDIENUNG
     · Auswahl "Studio" unter dem Datum. Die Wahl bleibt stehen, bis du
       sie änderst – zwei Wochen altes Studio = einmal umstellen.
     · ✎ daneben: Heimstudio umbenennen, weitere Studios pflegen.
     · Beim Bearbeiten eines Eintrags zeigt die Auswahl dessen Studio;
       Ändern dort korrigiert nur diesen Eintrag.

   STUDIOWECHSEL (später, z. B. MTV): Heimstudio umbenennen genügt
   nicht – die Planwerte gehören zum alten Gerätepark. Dafür kommt
   beim Review ein Neustart der Basislinie pro Übung.

   Storage-Key tl-st (geprüft: keine Kollision, mit im Backup).
   Lädt vor progress.js, das window.tlStudio nutzt.
   ═══════════════════════════════════════════════════ */

(function () {
"use strict";

var KEY = "tl-st";
var NEU = "__neu__";

function cfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { c = null; }
  if (!c || typeof c !== "object") c = {};
  if (typeof c.heim !== "string" || !c.heim.trim()) c.heim = "Heimstudio";
  if (!Array.isArray(c.andere)) c.andere = ["Altes Studio", "Fitness First"];
  if (typeof c.aktiv !== "string") c.aktiv = "";
  return c;
}
function saveCfg(c) { localStorage.setItem(KEY, JSON.stringify(c)); }

function clean(s) { return String(s == null ? "" : s).trim(); }

/* Leer oder Heimstudio-Name = Heimstudio */
function istHeim(e) {
  var s = clean(e && e.studio);
  return !s || s === cfg().heim;
}
function label(e) { return istHeim(e) ? "" : clean(e.studio); }

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Gewählter Wert im Formular ("" = Heim) */
function gewaehlt() {
  var sel = document.getElementById("f-studio");
  if (!sel || sel.value === NEU) return cfg().aktiv;
  return sel.value;
}

window.tlStudio = {
  istHeim: istHeim,
  label: label,
  gewaehlt: gewaehlt,
  heim: function () { return cfg().heim; }
};

/* ─── Einmalige Korrektur: Probetraining 18.10. ─────────
   Die Einträge vom 18.10. tragen die Notiz "anderes Studio" o. ä.
   Nur Einträge dieses Tages mit passender Notiz und ohne Studio. */
function migrate() {
  var c = cfg();
  if (c.mig1018) return;
  var arr = [];
  try { arr = JSON.parse(localStorage.getItem("tl-e") || "[]"); } catch (e) { return; }
  var n = 0;
  arr.forEach(function (e) {
    if (e.date === "2026-10-18" && !clean(e.studio) &&
        /fitness\s*first|studio|\bff\b/i.test(e.notiz || "")) {
      e.studio = "Fitness First"; n++;
    }
  });
  if (n) localStorage.setItem("tl-e", JSON.stringify(arr));
  if (c.andere.indexOf("Fitness First") === -1) c.andere.push("Fitness First");
  c.mig1018 = n || true;
  saveCfg(c);
}

/* ─── Formular ─────────────────────────────────────── */
var CSS = `
.st-row { display: flex; gap: 8px; align-items: stretch; }
.st-row select { flex: 1; min-width: 0; }
.st-ed { width: 52px; flex-shrink: 0; margin-bottom: 16px; border-radius: 10px; border: 2px solid var(--border);
  background: var(--surface); color: var(--muted); font-size: 17px; cursor: pointer; }
.st-ed:active { background: var(--bg); }
#f-studio.fremd { border-color: #E0A030; }
.st-hint { display: none; margin: -8px 0 16px; font-size: 12px; line-height: 1.5; color: var(--muted); }
.st-hint.show { display: block; }
.st-hint b { color: #B07810; }
.st-tag { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .5px; color: #B07810;
  background: rgba(224,160,48,.14); border-radius: 6px; padding: 1px 6px; margin-left: 4px; vertical-align: 1px; }
`;

function optionsHTML(c, wert) {
  var h = '<option value=""' + (wert === "" ? " selected" : "") + ">" + esc(c.heim) + " (Heim)</option>";
  var liste = c.andere.slice();
  if (wert && wert !== c.heim && liste.indexOf(wert) === -1) liste.push(wert);
  liste.forEach(function (s) {
    if (!clean(s) || s === c.heim) return;
    h += '<option value="' + esc(s) + '"' + (s === wert ? " selected" : "") + ">" + esc(s) + "</option>";
  });
  return h + '<option value="' + NEU + '">＋ Neues Studio …</option>';
}

function fillSelect(wert) {
  var sel = document.getElementById("f-studio");
  if (!sel) return;
  var c = cfg();
  if (wert === c.heim) wert = "";
  sel.innerHTML = optionsHTML(c, wert);
  sel.value = wert;
  markFremd();
}

function markFremd() {
  var sel = document.getElementById("f-studio");
  var hint = document.getElementById("st-hint");
  if (!sel || !hint) return;
  var fremd = sel.value !== "" && sel.value !== NEU;
  sel.classList.toggle("fremd", fremd);
  hint.classList.toggle("show", fremd);
  if (fremd) hint.innerHTML = "<b>Fremdes Studio:</b> wird geloggt, zählt aber nicht für Erhöhungen und nicht für die Verlaufskurve.";
}

var bearbeite = false;   // true, solange ein bestehender Eintrag im Formular steht

function onChange() {
  var sel = document.getElementById("f-studio");
  if (sel.value === NEU) {
    var vorher = bearbeite ? (sel.dataset.prev || "") : cfg().aktiv;
    window.tlAsk.form({
      title: "Neues Studio", fields: [{ key: "name", label: "Name", type: "text", placeholder: "z. B. MTV, Hotel Hamburg" }],
      ok: "Anlegen"
    }).then(function (r) {
      var name = r ? clean(r.name) : "";
      var c = cfg();
      if (!name) { fillSelect(vorher); return; }
      if (name !== c.heim && c.andere.indexOf(name) === -1) c.andere.push(name);
      if (!bearbeite) c.aktiv = name === c.heim ? "" : name;
      saveCfg(c);
      fillSelect(name);
      sel.dataset.prev = sel.value;
      refresh();
    });
    return;
  }
  if (!bearbeite) { var c = cfg(); c.aktiv = sel.value; saveCfg(c); }
  sel.dataset.prev = sel.value;
  markFremd();
  refresh();
}

function verwalten() {
  var c = cfg();
  window.tlAsk.form({
    title: "Studios",
    text: "Heimstudio = das Studio, zu dem die Planwerte gehören. Nur dort zählen Einträge für Erhöhungen.",
    fields: [
      { key: "heim", label: "Heimstudio", type: "text", value: c.heim },
      { key: "andere", label: "Weitere Studios (Komma-getrennt)", type: "text", value: c.andere.join(", ") }
    ],
    ok: "Speichern"
  }).then(function (r) {
    if (!r) return;
    var alt = c.heim, neu = clean(r.heim) || alt;
    var andere = String(r.andere || "").split(",").map(clean).filter(function (s, i, a) {
      return s && s !== neu && a.indexOf(s) === i;
    });
    // Einträge, die den neuen Heim-Namen ausdrücklich tragen, werden
    // dadurch automatisch Heim. Einträge mit dem alten Heim-Namen als
    // Text gibt es nicht – Heim wird leer gespeichert.
    c.heim = neu; c.andere = andere;
    if (c.aktiv && c.aktiv !== neu && andere.indexOf(c.aktiv) === -1) andere.push(c.aktiv);
    if (c.aktiv === neu) c.aktiv = "";
    saveCfg(c);
    fillSelect(bearbeite ? (document.getElementById("f-studio").dataset.prev || "") : c.aktiv);
    refresh();
  });
}

function refresh() {
  if (typeof window.refreshHint === "function") window.refreshHint();
  if (typeof window.renderLog === "function" && document.getElementById("view-log")) window.renderLog();
}

function inject() {
  var date = document.getElementById("f-date");
  if (!date || document.getElementById("f-studio")) return;

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  var wrap = document.createElement("div");
  wrap.innerHTML =
    '<label class="fl" for="f-studio">Studio</label>' +
    '<div class="st-row"><select id="f-studio"></select>' +
    '<button type="button" class="st-ed" id="st-ed" aria-label="Studios verwalten">✎</button></div>' +
    '<div class="st-hint" id="st-hint"></div>';
  var anker = date.nextSibling;
  while (wrap.firstChild) date.parentNode.insertBefore(wrap.firstChild, anker);

  document.getElementById("f-studio").addEventListener("change", onChange);
  document.getElementById("st-ed").addEventListener("click", verwalten);
  fillSelect(cfg().aktiv);
}

/* ─── Speichern / Bearbeiten ───────────────────────── */
function hook() {
  var origSave = window.saveEntry;
  if (typeof origSave === "function") {
    window.saveEntry = function () {
      var id = (typeof editId !== "undefined") ? editId : null;   // globale Variable aus index.html
      var wert = gewaehlt();
      if (wert === cfg().heim) wert = "";
      var vorIds = {};
      if (id === null) loadEntries().forEach(function (e) { vorIds[e.id] = true; });

      var res = origSave.apply(this, arguments);

      var arr = loadEntries(), ziel = null;
      if (id !== null) ziel = arr.find(function (e) { return e.id === id; });
      else for (var i = arr.length - 1; i >= 0; i--) { if (!vorIds[arr[i].id]) { ziel = arr[i]; break; } }
      if (ziel) {
        if (wert) ziel.studio = wert; else delete ziel.studio;
        saveEntries(arr);
      }
      bearbeite = false;
      fillSelect(cfg().aktiv);
      return res;
    };
  }

  var origEdit = window.startEdit;
  if (typeof origEdit === "function") {
    window.startEdit = function (id) {
      var e = loadEntries().find(function (x) { return x.id === id; });
      if (e) { bearbeite = true; fillSelect(clean(e.studio)); }
      var sel = document.getElementById("f-studio");
      if (sel) sel.dataset.prev = sel.value;
      return origEdit.apply(this, arguments);
    };
  }

  var origReset = window.resetForm;
  if (typeof origReset === "function") {
    window.resetForm = function () {
      var r = origReset.apply(this, arguments);
      bearbeite = false;
      fillSelect(cfg().aktiv);
      return r;
    };
  }
}

function init() {
  migrate();
  inject();
  hook();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
