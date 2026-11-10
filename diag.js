/* ═══════════════════════════════════════════════════
   diag.js – Diagnose (08.11.2026)

   1. Dauerhafter Speicher: navigator.storage.persist() bittet Chrome,
      die Daten dieser Herkunft nicht unter Speicherdruck zu räumen.
      Gilt für die ganze Herkunft r1bozyme.github.io, also auch für das
      Finanz-Cockpit. Chrome fragt nicht nach, sondern entscheidet still
      (installierte PWA → in der Regel ja). Das Ergebnis steht im Werte-Tab.

   2. Fehlerprotokoll: window "error" (auch nicht geladene Dateien) und
      "unhandledrejection" landen in einem Ringpuffer unter tl-err
      (max. 25 Einträge, nur auf dem Gerät, nicht im Backup). Karte
      „Diagnose“ ganz unten im Werte-Tab: Speicherstatus, Belegung je App,
      letzte Fehler, „Kopieren“ für die Weitergabe im Chat.

   Lädt als erstes Modul, damit Fehler aller späteren Module erfasst werden.
   Fehler in index.html/plan.js vor diesem Zeitpunkt bleiben außen vor.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

/* Übergang 10.11.: Die Module hören seit heute auf tl:view (view.js) statt
   showView zu umschließen. Kommt plan.js noch aus dem Browser-Cache und
   kennt view.js nicht, wird es hier nachgeladen – sonst bliebe der
   Ansichtswechsel für einen Start ohne Wirkung. Entfällt mit Schritt 3. */
if (!window.tlViewCore && !document.querySelector('script[src="view.js"]')) {
  var vs = document.createElement("script");
  vs.src = "view.js"; vs.async = false;
  document.head.appendChild(vs);
}

var KEY = "tl-err", MAX = 25;
var persisted = null, est = null, allOpen = false, box = null;

function read() { try { var v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
function add(e) {
  var a = read();
  /* gleicher Fehler innerhalb von 10 s nur zählen, nicht stapeln */
  var l = a[a.length - 1];
  if (l && l.m === e.m && l.s === e.s && e.t - l.t < 10000) { l.n = (l.n || 1) + 1; l.t = e.t; }
  else a.push(e);
  while (a.length > MAX) a.shift();
  write(a);
  if (box && box.offsetParent) render();
}
function short(u) { return String(u || "").split("?")[0].split("/").pop(); }

window.addEventListener("error", function (ev) {
  var t = ev.target;
  if (ev.message !== undefined || t === window) {
    add({ t: Date.now(), m: String(ev.message || "Fehler").slice(0, 200),
          s: ev.filename ? short(ev.filename) + ":" + ev.lineno : "" });
  } else if (t && (t.src || t.href)) {
    add({ t: Date.now(), m: "Datei nicht geladen: " + short(t.src || t.href), s: (t.tagName || "").toLowerCase() });
  }
}, true);
window.addEventListener("unhandledrejection", function (ev) {
  var r = ev.reason, m = r && r.message ? r.message : String(r);
  var st = r && r.stack ? String(r.stack).split("\n").slice(1, 2).join("").trim() : "";
  add({ t: Date.now(), m: ("Promise: " + m).slice(0, 200), s: st.slice(0, 80) });
});

/* ─── Speicher ────────────────────────────────────── */
function checkStorage() {
  if (!navigator.storage) { render(); return; }
  var p = navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null);
  p.then(function (v) {
    if (v === true || !navigator.storage.persist) return v;
    return navigator.storage.persist();
  }).then(function (v) { persisted = v; return navigator.storage.estimate ? navigator.storage.estimate() : null; })
   .then(function (e) { est = e || null; }, function () {})
   .then(render);
}
function lsBytes() {
  var tl = 0, fc = 0, rest = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i), n = (k.length + (localStorage.getItem(k) || "").length) * 2;
      if (k.indexOf("tl-") === 0) tl += n; else if (k.indexOf("fc-") === 0) fc += n; else rest += n;
    }
  } catch (e) {}
  return { tl: tl, fc: fc, rest: rest };
}
function mb(b) { return (Math.round(b / 1024 / 1024 * 10) / 10).toString().replace(".", ",") + " MB"; }
function kb(b) { return b < 1024 * 900 ? Math.round(b / 1024) + " KB" : mb(b); }

/* ─── Karte ───────────────────────────────────────── */
var CSS = [
  "#dg-cont { margin-top:28px; }",
  ".dg-card { margin:0 20px 24px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:6px 16px 14px; font-size:13px; }",
  ".dg-row { display:flex; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px solid var(--border); }",
  ".dg-row span:first-child { color:var(--muted); } .dg-row span:last-child { text-align:right; }",
  ".dg-ok { color:var(--go); font-weight:700; } .dg-warn { color:#B87A15; font-weight:700; }",
  ".dg-err { padding:8px 0; border-bottom:1px solid var(--border); font-size:12px; color:var(--muted); word-break:break-word; line-height:1.4; }",
  ".dg-err b { color:var(--text); font-weight:600; display:block; }",
  ".dg-btns { display:flex; gap:8px; margin-top:12px; }",
  ".dg-btns button { flex:1; padding:9px; border-radius:10px; border:1px solid var(--border); background:transparent; font-size:13px; font-family:var(--fb); color:var(--text); }",
  ".dg-note { font-size:12px; color:var(--muted); margin-top:10px; line-height:1.45; }"
].join("\n");

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
function fmt(t) {
  var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + ". " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function render() {
  if (!box) return;
  var wv = document.getElementById("view-weight");
  if (wv && box.parentNode === wv && wv.lastElementChild !== box) wv.appendChild(box);   // bleibt ganz unten
  var errs = read().slice().reverse(), ls = lsBytes();
  var sp = persisted === true ? '<span class="dg-ok">dauerhaft ✓</span>'
         : persisted === false ? '<span class="dg-warn">nicht garantiert</span>' : "–";
  var h = '<div class="dhead"><div class="dhl">DIAGNOSE</div><div class="dhline"></div></div><div class="dg-card">' +
    '<div class="dg-row"><span>Speicher</span>' + sp + "</div>" +
    '<div class="dg-row"><span>Belegt</span><span>Training Log ' + kb(ls.tl) + " · Cockpit " + kb(ls.fc) +
      (est && est.usage ? " · gesamt " + mb(est.usage) : "") + "</span></div>" +
    '<div class="dg-row"><span>Fehler</span><span>' + (errs.length ? errs.length + " · zuletzt " + fmt(errs[0].t) : "keine") + "</span></div>";
  var show = allOpen ? errs : errs.slice(0, 3);
  h += show.map(function (e) {
    return '<div class="dg-err"><b>' + esc(e.m) + (e.n > 1 ? " (×" + e.n + ")" : "") + "</b>" + fmt(e.t) + (e.s ? " · " + esc(e.s) : "") + "</div>";
  }).join("");
  if (errs.length) {
    h += '<div class="dg-btns">' +
      (errs.length > 3 ? '<button onclick="tlDiag.toggle()">' + (allOpen ? "Weniger" : "Alle " + errs.length) + "</button>" : "") +
      '<button onclick="tlDiag.copy()">Kopieren</button><button onclick="tlDiag.clear()">Leeren</button></div>';
  }
  if (persisted === false) h += '<div class="dg-note">Chrome hat dauerhaften Speicher nicht zugesagt – unter Speicherdruck dürfte es die Website-Daten räumen. Das Backup bleibt die Absicherung; die Anfrage wird bei jedem Start wiederholt.</div>';
  h += "</div>";
  box.innerHTML = h;
}

window.tlDiag = {
  toggle: function () { allOpen = !allOpen; render(); },
  clear: function () { write([]); allOpen = false; render(); if (window.showFlash) showFlash("Protokoll geleert"); },
  copy: function () {
    var txt = read().slice().reverse().map(function (e) { return fmt(e.t) + "  " + e.m + (e.n > 1 ? " (×" + e.n + ")" : "") + (e.s ? "  [" + e.s + "]" : ""); }).join("\n");
    var done = function () { if (window.showFlash) showFlash("Kopiert ✓"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallback(txt); done(); });
    else { fallback(txt); done(); }
    function fallback(t) { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
  },
  log: function (m, s) { add({ t: Date.now(), m: String(m).slice(0, 200), s: s || "" }); },
  errors: read
};

function init() {
  var wv = document.getElementById("view-weight");
  if (!wv || document.getElementById("dg-cont")) return;
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  box = document.createElement("div"); box.id = "dg-cont";
  wv.appendChild(box);
  document.addEventListener("tl:view", function (e) { if (e.detail.view === "weight") render(); });
  render();
  checkStorage();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
