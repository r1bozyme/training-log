/* ═══════════════════════════════════════════════════
   reise.js – Reise-Modus (03.11.2026, aus Dezember vorgezogen)

   Für Dienstreisen über mehrere Tage. Ein Zeitraum von–bis statt
   eines Schalters: endet von selbst, nichts zu vergessen.
   Solange er läuft:
     · Jeder Reisetag wird einmalig als „Reise“ markiert (trip in tl-d).
       Wer die Markierung danach von Hand entfernt, behält das –
       markiert wird je Tag nur einmal (rs.markiert).
     · „Fixbasis eintragen“ trägt an Reisetagen die Reise-Basis ein
       (Standard: Hotelfrühstück-Schätzung, 1 Whey, 1 Cappuccino Hafer)
       statt Müsli, Skyr usw. Mengen in der Karte änderbar (0 = aus).
     · Schnellposten: Schätzwerte für unterwegs plus deine eigenen
       „Gerichte / Unterwegs“-Produkte, nach Häufigkeit.
     · Studio steht morgens auf „Unterwegs“ statt auf dem Heimstudio
       (studio.js fragt tlReise.aktivAm). Von Hand umstellen geht.
   Reisetage fallen wie bisher aus der Energiebilanz (energie.js).

   Karte oben in Ernährung › Heute. Storage-Key tl-rs (im Backup):
     { von, bis, markiert: { "JJJJ-MM-TT": 1 }, basis: [{ pid, menge }] }
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var KEY = "tl-rs";
var BASIS_STD = [{ pid: "hotelfr", menge: 1 }, { pid: "whey", menge: 1 }, { pid: "cappu", menge: 1 }];
/* Kandidaten für die Reise-Basis (Mengen-Stepper in der Karte) */
var BASIS_WAHL = ["hotelfr", "whey", "cappu", "banane", "nuesse", "norsan"];
/* feste Schätzposten, ergänzt um eigene Unterwegs-Produkte */
var SCHNELL = ["rveg", "rpasta", "sandw", "hotelfr"];

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function heute() { return typeof todayStr === "function" ? todayStr() : iso(new Date()); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function dayDiff(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }
var WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function lbl(s) { return WT[new Date(s + "T12:00:00").getDay()] + " " + s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; } }
function flash(m) { if (typeof window.showFlash === "function") window.showFlash(m); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function cfg() {
  var c = readJSON(KEY, {});
  if (!c || typeof c !== "object") c = {};
  if (!c.markiert || typeof c.markiert !== "object") c.markiert = {};
  if (!Array.isArray(c.basis)) c.basis = BASIS_STD.map(function (b) { return { pid: b.pid, menge: b.menge }; });
  return c;
}
function save(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
function aktivAm(d) { var c = cfg(); return !!(c.von && c.bis && d >= c.von && d <= c.bis); }

window.tlReise = { aktivAm: aktivAm, zeitraum: function () { var c = cfg(); return c.von ? { von: c.von, bis: c.bis } : null; },
                   basis: function () { return cfg().basis.filter(function (b) { return b.menge > 0; }); } };

/* ─── Reisetage markieren (tl-d.trip), je Tag einmal ─── */
function setTrip(date, val) {
  var arr = readJSON("tl-d", []); if (!Array.isArray(arr)) arr = [];
  var i = arr.findIndex(function (x) { return x.date === date; });
  if (i >= 0) { if (!!arr[i].trip === val) return false; arr[i].trip = val; }
  else {
    if (!val) return false;
    arr.push({ date: date, kcal: null, est: false, trip: true, rate: null, ratedAt: null, stiff: null });
    arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  localStorage.setItem("tl-d", JSON.stringify(arr));
  return true;
}
function markieren() {
  var c = cfg(); if (!c.von) return;
  var bis = c.bis < heute() ? c.bis : heute(), neu = false;
  for (var d = c.von; d <= bis; d = addDays(d, 1)) {
    if (c.markiert[d]) continue;
    setTrip(d, true); c.markiert[d] = 1; neu = true;
  }
  if (neu) save(c);
}

/* ─── Aktionen ─── */
window.reiseStart = function () {
  if (!window.tlAsk) return;
  tlAsk.form({
    title: "Reise-Modus", ok: "Starten",
    text: "Ab heute (" + lbl(heute()) + "). Wie viele Tage einschließlich heute? Verlängern und vorzeitig beenden geht jederzeit.",
    fields: [{ key: "n", label: "Reisetage", type: "num", value: 3, step: 1, min: 1, suffix: "Tage" }]
  }).then(function (r) {
    if (!r) return;
    var n = Math.round(r.n);
    if (!isFinite(n) || n < 1 || n > 30) { flash("Tage prüfen (1–30)"); return; }
    var c = cfg();
    c.von = heute(); c.bis = addDays(c.von, n - 1); c.markiert = {};
    save(c);
    markieren();
    studioSync();
    render();
    if (typeof window.buildFood === "function") window.buildFood();
    flash("Reise bis " + lbl(c.bis) + " ✓");
  });
};
window.reiseMehr = function () {
  var c = cfg(); if (!c.von) return;
  c.bis = addDays(c.bis < heute() ? heute() : c.bis, 1); save(c); render();
  flash("Verlängert bis " + lbl(c.bis));
};
window.reiseEnde = function () {
  var c = cfg(); if (!c.von) return;
  var h = heute();
  tlAsk.confirm({
    title: "Reise beenden?",
    text: "Heute (" + lbl(h) + ") gilt dann nicht mehr als Reisetag. War heute noch unterwegs: stattdessen „Heute letzter Tag“.",
    ok: "Beenden"
  }).then(function (yes) {
    if (!yes) return;
    if (c.markiert[h]) setTrip(h, false);
    if (c.von >= h) { delete c.von; delete c.bis; c.markiert = {}; }
    else c.bis = addDays(h, -1);
    save(c); render();
    if (typeof window.buildFood === "function") window.buildFood();
    flash("Reise-Modus beendet");
  });
};
window.reiseLetzter = function () {
  var c = cfg(); if (!c.von) return;
  c.bis = heute(); save(c); render(); flash("Heute ist der letzte Reisetag");
};
window.reiseBasisMenge = function (pid, delta) {
  var c = cfg(), b = c.basis.find(function (x) { return x.pid === pid; });
  var p = produkte().find(function (x) { return x.id === pid; });
  if (p && p.ref === 100) delta *= p.std || 10;   // Gramm-Posten in Standardportionen
  if (!b) { b = { pid: pid, menge: 0 }; c.basis.push(b); }
  b.menge = Math.max(0, Math.round((b.menge + delta) * 10) / 10);
  c.basis = c.basis.filter(function (x) { return x.menge > 0; });
  save(c); render();
};
window.reiseBasisEintragen = function () { basisEintragen(); };

/* Reise-Basis in den gerade gezeigten Tag des Trackers */
function trackerDatum() { var el = document.getElementById("f-day"); return (el && el.value) || heute(); }
function produkte() { return typeof window.foodProducts === "function" ? window.foodProducts() : []; }
function basisEintragen() {
  var d = trackerDatum(), log = readJSON("tl-f", {}), arr = (log[d] || []).slice(), n = 0;
  var pr = {}; produkte().forEach(function (p) { pr[p.id] = p; });
  cfg().basis.forEach(function (b) {
    var p = pr[b.pid]; if (!p || !(b.menge > 0)) return;
    if (arr.some(function (x) { return x.pid === b.pid; })) return;
    arr.push({ id: Date.now() + Math.floor(Math.random() * 100000), pid: p.id, n: p.n, menge: b.menge, unit: p.unit, ref: p.ref,
               kcal: p.kcal, kh: p.kh, f: p.f, p: p.p });
    n++;
  });
  if (n) { log[d] = arr; localStorage.setItem("tl-f", JSON.stringify(log)); }
  if (typeof window.buildFood === "function") window.buildFood();
  flash(n ? "Reise-Basis: " + n + " Posten ✓" : "Reise-Basis steht schon");
}

/* ─── Studio: an Reisetagen morgens „Unterwegs“ ─── */
function studioSync() { if (window.tlStudio && typeof window.tlStudio.autoZurueck === "function") window.tlStudio.autoZurueck(); }

/* ─── Schnellposten: feste Schätzungen + eigene Unterwegs-Produkte nach Häufigkeit (90 Tage) ─── */
function schnell() {
  var pr = {}; produkte().forEach(function (p) { pr[p.id] = p; });
  var out = SCHNELL.filter(function (id) { return pr[id]; }).map(function (id) { return pr[id]; });
  var log = readJSON("tl-f", {}), ab = addDays(heute(), -90), cnt = {};
  Object.keys(log).forEach(function (d) {
    if (d < ab) return;
    (log[d] || []).forEach(function (it) { var p = pr[it.pid]; if (p && p.g === "Gerichte / Unterwegs" && SCHNELL.indexOf(p.id) < 0) cnt[p.id] = (cnt[p.id] || 0) + 1; });
  });
  Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 4).forEach(function (id) { out.push(pr[id]); });
  return out;
}

/* ─── Karte ─── */
function render() {
  var box = document.getElementById("rs-cont"); if (!box) return;
  var c = cfg(), h = heute();
  if (!c.von || c.bis < h) {
    box.innerHTML = '<button class="rs-start" onclick="reiseStart()">✈ Reise-Modus starten</button>';
    return;
  }
  if (c.von > h) { box.innerHTML = ""; return; }
  var tag = dayDiff(c.von, h) + 1, ges = dayDiff(c.von, c.bis) + 1;
  var pr = {}; produkte().forEach(function (p) { pr[p.id] = p; });
  var bm = {}; c.basis.forEach(function (b) { bm[b.pid] = b.menge; });
  var kc = 0;
  var basis = BASIS_WAHL.filter(function (id) { return pr[id]; }).map(function (id) {
    var p = pr[id], m = bm[id] || 0;
    kc += m * p.kcal / (p.ref || 1);
    return '<div class="rs-bz' + (m ? "" : " off") + '"><span class="rs-bn">' + esc(p.n) + "</span>" +
      '<button class="rs-st" onclick="reiseBasisMenge(\'' + id + '\',-1)">−</button><span class="rs-bm">' + String(m).replace(".", ",") + (p.ref === 100 && m ? " " + (p.unit === "ml" ? "ml" : "g") : "") + "</span>" +
      '<button class="rs-st" onclick="reiseBasisMenge(\'' + id + '\',1)">+</button></div>';
  }).join("");
  var chips = schnell().map(function (p) {
    return '<button class="rs-chip" onclick="foodAdd(\'' + p.id + '\',1)">' + esc(p.n.replace(/\s*\((Schätzung|Menü)\)/, "")) +
      ' <span>~' + Math.round(p.kcal * (p.ref === 1 ? 1 : p.std / p.ref)) + "</span></button>";
  }).join("");
  box.innerHTML = '<div class="fsec rs-sec">' +
    '<div class="rs-hd"><div><div class="fsub" style="margin-bottom:2px">✈ Reise-Modus</div>' +
    '<div class="rs-t">Tag ' + tag + " von " + ges + " · bis " + lbl(c.bis) + "</div></div>" +
    '<div class="rs-act"><button class="rs-l" onclick="reiseMehr()">+1 Tag</button>' +
    (c.bis !== h ? '<button class="rs-l" onclick="reiseLetzter()">Heute letzter</button>' : "") +
    '<button class="rs-l" onclick="reiseEnde()">Beenden</button></div></div>' +
    '<div class="rs-k">Schnell erfassen (Schätzwerte, Tap = 1 Portion)</div><div class="rs-chips">' + chips + "</div>" +
    '<button class="fbtn2 prim" style="width:100%;margin-top:12px" onclick="reiseBasisEintragen()">Reise-Basis eintragen (~' + Math.round(kc) + " kcal)</button>" +
    '<details class="rs-det"><summary>Reise-Basis anpassen</summary>' + basis + "</details>" +
    '<div class="fhint">Reisetage sind automatisch als „Reise“ markiert und zählen nicht für die Energiebilanz. Studio steht morgens auf „Unterwegs“.</div>' +
    "</div>";
}

var CSS = [
  ".rs-start { display:block; margin:12px 20px 0 auto; padding:7px 14px; border-radius:999px; border:1.5px solid var(--border); background:var(--surface); color:var(--muted); font-family:var(--fb); font-size:12.5px; font-weight:700; }",
  ".rs-sec { border-color:#E0A030; }",
  ".rs-hd { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }",
  ".rs-t { font-size:15px; font-weight:700; color:var(--text); }",
  ".rs-act { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px 10px; }",
  ".rs-l { border:none; background:none; padding:2px 0; font-family:var(--fb); font-size:12px; font-weight:700; color:#B07810; }",
  ".rs-k { font-size:11px; font-weight:700; color:var(--muted); margin-top:14px; }",
  ".rs-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }",
  ".rs-chip { padding:8px 10px; border-radius:8px; border:1.5px solid var(--border); background:var(--surface); color:var(--text); font-family:var(--fb); font-size:12.5px; font-weight:600; text-align:left; }",
  ".rs-chip span { color:var(--muted); font-weight:600; font-size:11.5px; }",
  ".rs-chip:active, .rs-st:active { opacity:.6; }",
  ".rs-det { margin-top:10px; }",
  ".rs-det summary { font-size:12.5px; font-weight:700; color:var(--muted); padding:4px 0; }",
  ".rs-bz { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); }",
  ".rs-bz.off .rs-bn { color:var(--muted); }",
  ".rs-bn { flex:1; font-size:13px; }",
  ".rs-st { width:32px; height:32px; border-radius:8px; border:1.5px solid var(--border); background:var(--surface); font-size:16px; font-weight:700; color:var(--text); }",
  ".rs-bm { min-width:44px; text-align:center; font-weight:700; font-variant-numeric:tabular-nums; }"
].join("\n");

function tick() { markieren(); studioSync(); render(); }

function init() {
  var fv = document.getElementById("view-food");
  if (!fv || document.getElementById("rs-cont")) return;
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  var box = document.createElement("div"); box.id = "rs-cont";
  fv.insertBefore(box, fv.firstChild);

  /* „Fixbasis eintragen“ im Tracker: an Reisetagen die Reise-Basis */
  var origBasis = window.foodBasis;
  if (typeof origBasis === "function") {
    window.foodBasis = function () { if (aktivAm(trackerDatum())) return basisEintragen(); return origBasis.apply(this, arguments); };
  }
  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) { var r = origShow.apply(this, arguments); if (v === "food" || v === "add") tick(); return r; };
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") tick(); });
  tick();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
