// ═══════════════════════════════════════════════════
// HEIMKEHR – „Wann bist du zu Hause?“ (26.11.2026)
//
// Zweck: Während des Trainings eine ehrliche Ankunftszeit zu Hause,
// mit einem Tipp zum Weiterschicken (Teilen-Menü von Android, z. B.
// WhatsApp an die Partnerin).
//
// RECHNUNG
//   Ankunft = jetzt + restliches Training + Nachlauf (Umziehen) + Fahrt
//   · Restliches Training kommt aus deinen eigenen Zeitstempeln: Jeder
//     Eintrag trägt als id den Speicherzeitpunkt. Der Abstand zwischen
//     zwei Speichern = Dauer der späteren Übung (Lücken > 30 min zählen
//     nicht, das waren Unterbrechungen). Je Übung der Median aus den
//     letzten 30 Trainingstagen; zu wenig Daten → Median aller Übungen.
//   · Welche Übungen noch kommen: die letzten 6 Einheiten gleicher Art
//     (Pull/Legs …) im selben Studio (ab 3 vorhandenen, sonst alle
//     Studios). Jede heute noch nicht gespeicherte Übung zählt mit
//     ihrer Häufigkeit p (5 von 6 Einheiten = 0,83). Punktwert =
//     Σ p × Dauer. Spanne: früh = nur Übungen mit p ≥ 0,8, spät =
//     alle mit p ≥ 0,3.
//   · Die seit dem letzten Speichern verstrichene Zeit läuft gegen die
//     Restdauer (die laufende Übung ist ja schon im Gang).
//   Rückblick-Test 26.11. auf 188 Zeitpunkte seit September (nur mit
//   damals bekannten Daten): Trainingsende im Mittel ±12 min getroffen,
//   ohne Schiefe; die Spanne (±5 min) trifft in 70 % der Fälle. Der
//   Fehler kommt fast nur daher, ob Zusatzübungen dazukommen.
//
// ANZEIGE: Karte oben im Eintrag-Tab, nur für heute und nicht beim
//   Bearbeiten. Liegt der letzte Eintrag von heute > 45 min zurück,
//   gilt das Training als beendet und die Karte verschwindet. Antippen
//   klappt die Herleitung auf (Restübungen, Bausteine). „Teilen“ öffnet
//   das Android-Teilen-Menü (Rückfall: Zwischenablage). ✎ pflegt Fahrzeit
//   je Studio und den Nachlauf. Aktualisiert sich alle 20 s.
//
// Storage: tl-hk { fahrt: { Studioname: min }, nach: min } – nur auf dem
//   Gerät, nicht im Backup (zwei Zahlen, schnell neu eingetragen).
//   Heimstudio = Schlüssel "" (wie studio.js).
// Zusammenspiel: liest loadEntries(), curEinheit, editId (index.html),
//   window.tlStudio (studio.js), window.tlAsk (dialog.js). Hört auf
//   tl:view. Lädt nach studio.js und dialog.js.
// ═══════════════════════════════════════════════════

(function () {
"use strict";

var KEY = "tl-hk";
var POOL = 6, TAGE = 30, LUECKE = 30, AUS = 45;
var P_FRUEH = 0.8, P_SPAET = 0.3;
/* Startwerte (Auto): Kyreinstraße → Kistlerhofstraße (Sendling) ~8 min,
   → Clever fit Berg am Laim ~25 min. Fremde Studios: 15 min. */
var START_FAHRT = { "": 25, "All Inclusive Fitness Sendling": 8 };
var START_FREMD = 15, START_NACH = 10;

function cfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { c = null; }
  if (!c || typeof c !== "object") c = {};
  if (!c.fahrt || typeof c.fahrt !== "object") c.fahrt = {};
  if (typeof c.nach !== "number" || !isFinite(c.nach)) c.nach = START_NACH;
  return c;
}
function saveCfg(c) { localStorage.setItem(KEY, JSON.stringify(c)); }

function st() { return window.tlStudio || null; }
function studioKey(name) {
  var s = st(), n = String(name == null ? "" : name).trim();
  if (!s) return n;
  return (!n || n === s.heim()) ? "" : n;
}
function studioName(k) { var s = st(); return k ? k : (s ? s.heim() : "Heimstudio"); }
function fahrtMin(k) {
  var c = cfg();
  if (typeof c.fahrt[k] === "number") return c.fahrt[k];
  return START_FAHRT[k] != null ? START_FAHRT[k] : START_FREMD;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function pad(n) { return String(n).padStart(2, "0"); }
function lokal(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function heute() { return typeof todayStr === "function" ? todayStr() : lokal(new Date()); }
function median(a) {
  if (!a.length) return null;
  var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
/* auf 5 Minuten runden */
function uhr5(ms) {
  var d = new Date(Math.round(ms / 300000) * 300000);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/* ─── Sitzungen aus den Einträgen ──────────────────── */
function eintraege() {
  try { return typeof loadEntries === "function" ? loadEntries() : JSON.parse(localStorage.getItem("tl-e") || "[]"); }
  catch (e) { return []; }
}
/* Nur Einträge, deren id ein echter Speicherzeitpunkt am Eintragstag ist */
function zeitOk(e) {
  return typeof e.id === "number" && e.id > 1.6e12 && lokal(new Date(e.id)) === e.date;
}
function sitzungen(arr) {
  var tage = {};
  arr.forEach(function (e) {
    if (!e || !e.date || !e.uebung) return;
    (tage[e.date] = tage[e.date] || []).push(e);
  });
  return Object.keys(tage).sort().map(function (d) {
    var L = tage[d].slice().sort(function (a, b) { return a.id - b.id; });
    return { date: d, einheit: L[0].einheit, studio: studioKey(L[0].studio), L: L };
  });
}

/* Dauer je Übung = Abstand zum vorigen Speichern (Minuten) */
function dauern(sitz) {
  var je = {}, alle = [];
  sitz.forEach(function (s) {
    for (var i = 1; i < s.L.length; i++) {
      var a = s.L[i - 1], b = s.L[i];
      if (!zeitOk(a) || !zeitOk(b)) continue;
      var g = (b.id - a.id) / 60000;
      if (g < 0 || g > LUECKE) continue;
      (je[b.uebung] = je[b.uebung] || []).push(g);
      alle.push(g);
    }
  });
  var dflt = median(alle);
  return { je: je, dflt: dflt == null ? 9 : dflt };
}

function prognose() {
  var heuteS = heute(), alle = sitzungen(eintraege());
  var heutig = null, frueher = [];
  alle.forEach(function (s) { if (s.date === heuteS) heutig = s; else if (s.date < heuteS) frueher.push(s); });

  var einheit = heutig ? heutig.einheit : (typeof curEinheit !== "undefined" ? curEinheit : "Push");
  var gew = st() ? st().gewaehlt() : "";
  var sKey = heutig ? heutig.studio : studioKey(gew);

  var gleich = frueher.filter(function (s) { return s.einheit === einheit; });
  var imStudio = gleich.filter(function (s) { return s.studio === sKey; });
  var pool = (imStudio.length >= 3 ? imStudio : gleich).slice(-POOL);
  var D = dauern(frueher.slice(-TAGE));

  var getan = {};
  /* Abgelöste Übungen (plan.js ersetzt:[…]) gelten mit ihrem Ersatz als erledigt */
  var abgeloest = {};
  if (typeof PLAN !== "undefined") Object.keys(PLAN).forEach(function (k) {
    if (Array.isArray(PLAN[k])) PLAN[k].forEach(function (x) { if (x && x.ersetzt) abgeloest[x.name] = x.ersetzt; });
  });
  (heutig ? heutig.L : []).forEach(function (e) {
    getan[e.uebung] = true;
    (abgeloest[e.uebung] || []).forEach(function (n) { getan[n] = true; });
  });
  var zaehl = {}, reihe = [];
  pool.forEach(function (s) {
    var seen = {};
    s.L.forEach(function (e) {
      if (seen[e.uebung]) return;
      seen[e.uebung] = true;
      if (zaehl[e.uebung] == null) { zaehl[e.uebung] = 0; reihe.push(e.uebung); }
      zaehl[e.uebung]++;
    });
  });

  var rest = [], erw = 0, frueh = 0, spaet = 0;
  reihe.forEach(function (u) {
    if (getan[u]) return;
    var p = zaehl[u] / pool.length;
    var d = D.je[u] && D.je[u].length >= 2 ? median(D.je[u]) : D.dflt;
    erw += p * d;
    if (p >= P_FRUEH) frueh += d;
    if (p >= P_SPAET) spaet += d;
    if (p >= P_SPAET) rest.push({ n: u, p: p, d: d });
  });
  rest.sort(function (a, b) { return b.p - a.p || a.n.localeCompare(b.n); });

  var jetzt = Date.now();
  var letzte = heutig ? heutig.L[heutig.L.length - 1].id : null;
  var lauf = letzte && zeitOk(heutig.L[heutig.L.length - 1]) ? Math.max(0, (jetzt - letzte) / 60000) : 0;
  function ab(m) { return Math.max(0, m - lauf); }

  var nach = cfg().nach, fahrt = fahrtMin(sKey), zus = (nach + fahrt) * 60000;
  return {
    einheit: einheit, studio: sKey, pool: pool.length, heuteN: heutig ? heutig.L.length : 0,
    seitLetzter: letzte ? (jetzt - letzte) / 60000 : null,
    restTraining: ab(erw), rest: rest, nach: nach, fahrt: fahrt,
    an: jetzt + ab(erw) * 60000 + zus,
    anFrueh: jetzt + ab(frueh) * 60000 + zus,
    anSpaet: jetzt + ab(spaet) * 60000 + zus
  };
}

/* ─── Anzeige ──────────────────────────────────────── */
var CSS = `
.hk { display: none; margin: 0 0 18px; border: 2px solid var(--blue-bd); background: var(--blue-bg);
  border-radius: 14px; padding: 12px 14px; }
.hk.show { display: block; }
.hk-top { display: flex; align-items: center; gap: 10px; }
.hk-main { flex: 1; min-width: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.hk-lbl { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--blue); }
.hk-zeit { font-family: var(--fd); font-size: 30px; letter-spacing: 1px; line-height: 1.05; color: var(--text); }
.hk-zeit small { font-family: var(--fb); font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--muted); margin-left: 6px; }
.hk-sub { font-size: 12px; color: var(--muted); line-height: 1.4; }
.hk-b { flex-shrink: 0; border: 2px solid var(--blue-bd); background: var(--surface); color: var(--blue);
  border-radius: 10px; padding: 9px 12px; font-family: var(--fb); font-size: 14px; font-weight: 700; cursor: pointer; }
.hk-b:active { background: var(--bg); }
.hk-ed { padding: 9px 10px; color: var(--muted); border-color: var(--border); font-weight: 600; }
.hk-det { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--blue-bd);
  font-size: 13px; line-height: 1.55; color: var(--text); }
.hk.open .hk-det { display: block; }
.hk-det .m { color: var(--muted); }
.hk-r { display: flex; justify-content: space-between; gap: 8px; }
`;

var offen = false;

function inject() {
  if (document.getElementById("hk")) return true;
  var view = document.getElementById("view-add");
  var date = document.getElementById("f-date");
  if (!view || !date) return false;
  var s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
  var box = document.createElement("div");
  box.className = "hk"; box.id = "hk";
  box.innerHTML =
    '<div class="hk-top">' +
      '<div class="hk-main" id="hk-main"><div class="hk-lbl">🏠 Zu Hause ca.</div>' +
      '<div class="hk-zeit" id="hk-zeit">–</div><div class="hk-sub" id="hk-sub"></div></div>' +
      '<button type="button" class="hk-b" id="hk-share">Teilen</button>' +
      '<button type="button" class="hk-b hk-ed" id="hk-ed" aria-label="Fahrzeiten">✎</button>' +
    '</div><div class="hk-det" id="hk-det"></div>';
  /* vor das Label „Datum“ (erstes .fl im Formular) */
  var lbl = date.previousElementSibling;
  date.parentNode.insertBefore(box, lbl && lbl.classList.contains("fl") ? lbl : date);
  document.getElementById("hk-main").addEventListener("click", function () { offen = !offen; render(); });
  document.getElementById("hk-share").addEventListener("click", teilen);
  document.getElementById("hk-ed").addEventListener("click", einstellen);
  return true;
}

function sichtbar() {
  var v = document.getElementById("view-add");
  if (!v || !v.classList.contains("active")) return false;
  if (typeof editId !== "undefined" && editId !== null) return false;
  var d = document.getElementById("f-date");
  return !d || !d.value || d.value === heute();
}

var letzteP = null;

function render() {
  if (!inject()) return;
  var box = document.getElementById("hk");
  if (!sichtbar()) { box.classList.remove("show"); return; }
  var P = prognose();
  letzteP = P;
  if (P.seitLetzter != null && P.seitLetzter > AUS) { box.classList.remove("show"); return; }
  box.classList.add("show");
  box.classList.toggle("open", offen);

  var a = uhr5(P.anFrueh), b = uhr5(P.anSpaet);
  document.getElementById("hk-zeit").innerHTML = esc(uhr5(P.an)) +
    (a !== b ? "<small>" + esc(a) + "–" + esc(b) + "</small>" : "");
  var tr = Math.round(P.restTraining);
  var sub = !P.pool ? "Noch keine " + esc(P.einheit) + "-Einheit zum Vergleich – nur Fahrt und Nachlauf"
    : (P.heuteN ? "" : "Ab jetzt gerechnet · ") +
      (tr > 0 ? "noch ~" + tr + " min Training" : "Training praktisch durch") +
      " · " + P.fahrt + " min Fahrt";
  document.getElementById("hk-sub").innerHTML = sub;

  if (offen) {
    var h = "";
    if (P.rest.length) {
      h += '<div class="m">Erwartet noch (Anteil der letzten ' + P.pool + " " + esc(P.einheit) + "-Einheiten · Dauer):</div>";
      P.rest.forEach(function (r) {
        h += '<div class="hk-r"><span>' + esc(r.n) + (r.p < P_FRUEH ? ' <span class="m">(vielleicht)</span>' : "") +
          '</span><span class="m">' + Math.round(r.p * 100) + " % · " + (r.d < 1 ? "<1" : Math.round(r.d)) + " min</span></div>";
      });
    } else if (P.pool) {
      h += '<div class="m">Alle üblichen Übungen sind gespeichert.</div>';
    }
    h += '<div style="margin-top:8px" class="m">Training ~' + tr + " min (gewichtet)" +
      (P.seitLetzter != null ? ", seit letztem Speichern " + Math.round(P.seitLetzter) + " min verrechnet" : "") +
      " · Nachlauf " + P.nach + " min · Fahrt ab " + esc(studioName(P.studio)) + " " + P.fahrt + " min.</div>" +
      '<div class="m">Spanne: früh = nur feste Übungen, spät = inkl. „vielleicht“.</div>';
    document.getElementById("hk-det").innerHTML = h;
  }
}

function teilen() {
  var P = letzteP || prognose();
  var a = uhr5(P.anFrueh), b = uhr5(P.anSpaet);
  var txt = "Bin ca. " + uhr5(P.an) + " zu Hause" + (a !== b ? " (zwischen " + a + " und " + b + ")" : "") + " 🏠";
  if (navigator.share) {
    navigator.share({ text: txt }).catch(function () {});
    return;
  }
  var fertig = function () { if (typeof window.showFlash === "function") window.showFlash("Kopiert: " + txt); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fertig, fertig);
  else fertig();
}

function einstellen() {
  if (!window.tlAsk) return;
  var c = cfg(), s = st();
  var keys = [""].concat(s ? s.stamm().filter(function (k) { return k; }) : []);
  var akt = letzteP ? letzteP.studio : "";
  if (keys.indexOf(akt) === -1) keys.push(akt);
  var fields = keys.map(function (k, i) {
    return { key: "f" + i, label: "Fahrt ab " + studioName(k), type: "num", value: fahrtMin(k), suffix: "min", step: 1, min: 0 };
  });
  fields.push({ key: "nach", label: "Nachlauf (Umziehen, Duschen …)", type: "num", value: c.nach, suffix: "min", step: 1, min: 0 });
  window.tlAsk.form({
    title: "Heimkehr",
    text: "Fahrzeit mit dem Auto vom Studio nach Hause und was nach der letzten Übung noch dazukommt.",
    fields: fields, ok: "Speichern"
  }).then(function (r) {
    if (!r) return;
    var c2 = cfg();
    keys.forEach(function (k, i) {
      var v = r["f" + i];
      if (typeof v === "number" && isFinite(v) && v >= 0) c2.fahrt[k] = Math.round(v);
    });
    if (typeof r.nach === "number" && isFinite(r.nach) && r.nach >= 0) c2.nach = Math.round(r.nach);
    saveCfg(c2);
    render();
  });
}

/* ─── Auslöser ─────────────────────────────────────── */
document.addEventListener("tl:view", function () { render(); });
document.addEventListener("change", function (e) {
  var id = e.target && e.target.id;
  if (id === "f-studio" || id === "f-date") setTimeout(render, 0);
});
document.addEventListener("click", function (e) {
  var t = e.target && e.target.closest ? e.target.closest(".eb, #save-btn, .edit-cancel") : null;
  if (t) setTimeout(render, 50);
});
document.addEventListener("visibilitychange", function () { if (!document.hidden) render(); });
setInterval(function () { if (!document.hidden) render(); }, 20000);

window.tlHeimkehr = { prognose: prognose, render: render };
render();

})();
