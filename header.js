// ═══════════════════════════════════════════════════
// HEADER-CHIP – Status oben rechts, je nach Tab (03.10.2026)
//
// Ersetzt das 💪 im Kopf. Ein Chip, gleiche Form in jedem Tab,
// nur Inhalt und Farbe wechseln:
//   Eintrag  was heute dran ist (Rotation PP → Legs, Ruhetag dazwischen)
//   Log      Anzahl fälliger Erhöhungen      → Tap: grüner Kasten
//   Stats    nächster Messtermin (TERMINE unten, beim Review pflegen)
//   Werte    offene Pflichteinträge          → Tap: erster offener Punkt
//            sonst Ø Morgensteifigkeit der letzten 7 Tage
//   Essen    kcal heute gegen das Ziel
//   Plan     Plan-Revision und nächster Review
// Farbe: gelb = offen, grün = Erhöhung fällig, Einheitsfarbe am
// Eintrag-Tab, sonst neutral. Nichts zu sagen → Chip verschwindet.
//
// Lädt als letztes Modul und umschließt showView als äußerste Schicht.
// Liest nur – geschrieben wird nichts.
// ═══════════════════════════════════════════════════

(function () {

// Beim Monatsreview pflegen. date als "JJJJ-MM-TT", sobald fest;
// bis dahin steht text bis einschließlich "bis".
var TERMINE = [
  { label: "InBody", date: "2026-10-31" }   // Kalender: Sa 07:00, nüchtern
];
// Nächster Monatsreview (Kalender: Export-Termin am 1.). null → Monat aus PLAN.version.
var REVIEW = "2026-11-01";

var MONATE = ["Januar","Februar","März","April","Mai","Juni","Juli",
              "August","September","Oktober","November","Dezember"];
var MON_KURZ = ["Jan.","Feb.","März","Apr.","Mai","Juni","Juli",
                "Aug.","Sep.","Okt.","Nov.","Dez."];

var CSS = `
.hchip { flex-shrink: 0; margin-left: 12px; margin-bottom: 1px; padding: 7px 12px; border-radius: 999px;
  border: 1.5px solid var(--border); background: var(--surface); color: var(--text);
  font-family: var(--fb); font-size: 12.5px; font-weight: 700; line-height: 1; white-space: nowrap;
  font-variant-numeric: tabular-nums; transition: opacity .15s;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.hdr-title { white-space: nowrap; }
.hchip[hidden] { display: none; }
.hchip.tap { cursor: pointer; }
.hchip.tap:active { opacity: .6; }
.hchip .hc-m { color: var(--muted); font-weight: 600; }
.hchip.open { border-color: #E8C84A; background: #FFF6DC; color: #7A6200; }
.hchip.open .hc-m { color: #A88E2E; }
.hchip.go   { border-color: #B8DCB8; background: var(--go-bg); color: var(--go); }
.hchip.Push { border-color: var(--push-bd); background: var(--push-bg); color: var(--push); }
.hchip.Legs { border-color: var(--legs-bd); background: var(--legs-bg); color: var(--legs); }
.hchip.Push .hc-m, .hchip.Legs .hc-m, .hchip.go .hc-m { color: inherit; opacity: .7; }
`;

var cur = "add";
var action = null;

// ─── HELFER ──────────────────────────────────────
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
function today() { return typeof todayStr === "function" ? todayStr() : new Date().toISOString().split("T")[0]; }
function dayDiff(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }
function fmtInt(n) { return Math.round(n).toLocaleString("de-DE"); }
function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); }
function entries() { try { return typeof loadEntries === "function" ? loadEntries() : []; } catch (e) { return []; } }

// ─── EINTRAG: ROTATION ───────────────────────────
// Ein Trainingstag ist Legs, wenn dort mehr Legs- als Push/Pull-
// Einträge stehen, sonst Push+Pull. Nächste Einheit = die andere.
function tagTyp(list) {
  var legs = 0, pp = 0;
  list.forEach(function (e) { if (e.einheit === "Legs") legs++; else pp++; });
  return legs > pp ? "Legs" : "Push";
}
function chipEintrag() {
  var t = today(), byDate = {};
  entries().forEach(function (e) {
    if (!e.date || e.date > t) return;
    (byDate[e.date] = byDate[e.date] || []).push(e);
  });
  var tage = Object.keys(byDate).sort();
  if (!tage.length) return null;
  var name = function (typ) { return typ === "Legs" ? "LEGS" : "PUSH+PULL"; };

  if (byDate[t]) {
    var heute = tagTyp(byDate[t]);
    return { cls: heute, html: name(heute) + ' <span class="hc-m">· heute</span>' };
  }
  var last = tage[tage.length - 1];
  var next = tagTyp(byDate[last]) === "Legs" ? "Push" : "Legs";
  var pick = function () { if (typeof selEinheit === "function") selEinheit(next); };
  if (dayDiff(last, t) === 1) {
    return { cls: "", html: "Ruhetag", tap: pick };   // Tap wählt trotzdem die nächste Einheit vor
  }
  return { cls: next, html: name(next) + ' <span class="hc-m">· dran</span>', tap: pick };
}

// ─── LOG: FÄLLIGE ERHÖHUNGEN ─────────────────────
function chipLog() {
  if (typeof window.pgFaellig !== "function") return null;
  var n = 0;
  try { n = window.pgFaellig().length; } catch (e) { return null; }
  if (!n) return null;
  return {
    cls: "go",
    html: "↑ " + n + ' <span class="hc-m">fällig</span>',
    tap: function () {
      var box = document.getElementById("pg-ov");
      if (!box && typeof setFilter === "function") {   // aus dem Übungsverlauf zurück
        try { setFilter("Alle"); } catch (e) {}
        box = document.getElementById("pg-ov");
      }
      if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
}

// ─── STATS: NÄCHSTER TERMIN ──────────────────────
function chipStats() {
  var t = today();
  for (var i = 0; i < TERMINE.length; i++) {
    var x = TERMINE[i];
    if (x.date) {
      var d = dayDiff(t, x.date);
      if (d < 0) continue;
      var wann = d === 0 ? "heute" : d === 1 ? "morgen" : "in " + d + " T.";
      return { cls: "", html: esc(x.label) + ' <span class="hc-m">' + wann + "</span>" };
    }
    if (x.bis && t <= x.bis) return { cls: "", html: esc(x.label) + ' <span class="hc-m">' + esc(x.text) + "</span>" };
  }
  return null;
}

// ─── WERTE: OFFEN ODER Ø STEIFIGKEIT ─────────────
function chipWerte() {
  var items = typeof window.dailyOpenItems === "function" ? window.dailyOpenItems() : [];
  if (items.length) {
    var txt = items.length === 1 ? esc(items[0].label) + ' <span class="hc-m">offen</span>'
                                 : items.length + ' <span class="hc-m">offen</span>';
    return { cls: "open", html: txt, tap: function () { if (typeof jumpOpen === "function") jumpOpen(); } };
  }
  if (typeof window.loadDaily !== "function") return null;
  var t = today(), vals = [];
  window.loadDaily().forEach(function (d) {
    if (typeof d.rate !== "number" || !d.date) return;
    var diff = dayDiff(d.date, t);
    if (diff >= 0 && diff < 7) vals.push(d.rate);
  });
  if (!vals.length) return null;
  var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  return { cls: "", html: '<span class="hc-m">Steifigkeit Ø</span> ' + fmt1(avg) };
}

// ─── ESSEN: KCAL HEUTE ───────────────────────────
function chipEssen() {
  if (typeof window.foodDaySum !== "function") return null;
  var s = window.foodDaySum(today());
  var goal = typeof window.loadFoodGoal === "function" ? window.loadFoodGoal() : null;
  if (!s || !s.kcal) return null;
  return { cls: "", html: fmtInt(s.kcal) + (goal && goal.kcal ? ' <span class="hc-m">/ ' + fmtInt(goal.kcal) + "</span>" : "") };
}

// ─── PLAN: REVISION + REVIEW ─────────────────────
function chipPlan() {
  if (typeof PLAN === "undefined" || !PLAN.version) return null;
  var v = String(PLAN.version);
  var rev = (v.match(/Rev\.\s*([\d.]+)/) || [])[1];
  var m = -1;
  MONATE.forEach(function (name, i) { if (v.indexOf(name) === 0) m = i; });
  var review = m >= 0 ? "Review " + MON_KURZ[(m + 1) % 12] : "";
  if (REVIEW) {
    var d = dayDiff(today(), REVIEW);
    review = d < 0 ? "" :   // Review vorbei, neue Revision steht aus
      "Review " + (d === 0 ? "heute" : d === 1 ? "morgen" : REVIEW.slice(8, 10) + "." + REVIEW.slice(5, 7) + ".");
  }
  if (!rev && !review) return null;
  return { cls: "", html: (rev ? "Rev. " + esc(rev.replace(/\.$/, "") + ".") : "") +
                         (rev && review ? ' <span class="hc-m">· ' + review + "</span>" : review) };
}

var QUELLEN = { add: chipEintrag, log: chipLog, stats: chipStats, weight: chipWerte, food: chipEssen, plan: chipPlan };

// ─── RENDER ──────────────────────────────────────
function render() {
  var el = document.getElementById("hdr-chip");
  if (!el) return;
  var c = null;
  try { c = QUELLEN[cur] ? QUELLEN[cur]() : null; } catch (e) { c = null; }
  if (!c) { el.hidden = true; el.innerHTML = ""; action = null; return; }
  el.className = "hchip" + (c.cls ? " " + c.cls : "") + (c.tap ? " tap" : "");
  el.innerHTML = c.html;
  el.hidden = false;
  action = c.tap || null;
  if (action) el.setAttribute("role", "button"); else el.removeAttribute("role");
}

var pending = 0;
function soon() {
  if (pending) return;
  pending = setTimeout(function () { pending = 0; render(); }, 60);
}

function init() {
  var el = document.getElementById("hdr-chip");
  if (!el) return;

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  el.addEventListener("click", function () { if (action) action(); });

  // Aktiven Tab übernehmen (Start oder Sprung aus Benachrichtigung)
  Object.keys(QUELLEN).forEach(function (id) {
    var v = document.getElementById("view-" + id);
    if (v && v.classList.contains("active")) cur = id;
  });

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      var r = origShow.apply(this, arguments);
      cur = v;
      render();
      return r;
    };
  }

  // Jede Speicherung der App (tl-*) zieht den Chip nach – Training,
  // Essen, Werte, Steifigkeit. Statt jede Funktion einzeln zu umschließen.
  try {
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, val) {
      var r = origSet.apply(this, arguments);
      if (this === window.localStorage && String(k).indexOf("tl-") === 0) soon();
      return r;
    };
  } catch (e) {}

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") soon();
  });

  render();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
