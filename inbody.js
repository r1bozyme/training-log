/* ═══════════════════════════════════════════════════
   inbody.js – InBody-Bereitschaftscheck (03.11.2026, aus Dezember vorgezogen)

   Prüft vor dem nächsten InBody-Termin die Gültigkeitskriterien
   (festgelegt 07.08.2026), damit eine Messung nicht erst hinterher
   verworfen werden muss:
     1. Symptomfrei – manuell bestätigt (Feld sym in tl-d: "frei" | "krank"),
        zählt ab dem Vortag der Messung
     2. Normale KH an den 3 Tagen davor – je ≥ 330 g laut Tracker (normal ~350)
     3. ≥ 2 Trainingstage in den 7 Tagen davor, Deload-Tage zählen nicht
     4. Ruhetag am Vortag (kein Eintrag in tl-e)
   Messbedingungen am Morgen (07:00 nüchtern, vor dem Trinken) stehen als
   Hinweis dabei, prüfen kann die App sie nicht.

   Termin: erster InBody-Eintrag in TERMINE (header.js, beim Review pflegen),
   gelesen über window.tlTermine. Karte oben im Werte-Tab, sichtbar ab
   6 Tage vorher bis einschließlich Messtag. Status je Kriterium:
   ok · offen (liegt noch in der Zukunft) · fehlt (nicht erfasst) · nein.

   Rechenkern auch per require nutzbar (Auswerteskript in training-log-data).
   ═══════════════════════════════════════════════════ */
(function (root) {
"use strict";

var MIN_KH = 330, KH_TAGE = 3, MIN_TRAIN = 2, TRAIN_FENSTER = 7, VORLAUF = 6;

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function khDay(items) {
  return (items || []).reduce(function (a, it) {
    var r = Number(it.ref) || 1; return a + (Number(it.kh) || 0) * (Number(it.menge) || 0) / r;
  }, 0);
}

/* termin "JJJJ-MM-TT", heute "JJJJ-MM-TT"; food = tl-f, days = tl-d,
   entries = tl-e, deload = {von, bis} | null */
function check(termin, heute, food, days, entries, deload) {
  food = food || {}; days = days || []; entries = entries || [];
  var flags = {}; days.forEach(function (d) { flags[d.date] = d; });
  var trainDates = {};
  entries.forEach(function (e) { if (e && e.date) trainDates[e.date] = true; });
  var inDeload = function (s) { return !!(deload && s >= deload.von && s <= deload.bis); };
  var vortag = addDays(termin, -1);
  var out = { termin: termin, krit: [] };

  /* 1 – Symptome: letzte Angabe bis einschließlich Messtag */
  var sym = null, symDate = null;
  days.forEach(function (d) {
    if (d.sym && d.date <= termin && d.date <= heute && (!symDate || d.date > symDate)) { sym = d.sym; symDate = d.date; }
  });
  var s1;
  if (sym === "krank") s1 = "nein";
  else if (sym === "frei" && symDate >= vortag) s1 = "ok";
  else s1 = heute < vortag ? "offen" : "fehlt";
  out.krit.push({ id: "sym", st: s1, sym: sym, symDate: symDate });

  /* 2 – Kohlenhydrate an den KH_TAGE Tagen vor dem Termin */
  var tage = [];
  for (var i = KH_TAGE; i >= 1; i--) {
    var t = addDays(termin, -i), items = food[t], kh = khDay(items), f = flags[t] || {};
    var st;
    if (t > heute) st = "offen";
    else if (!items || !items.length) st = t === heute ? "offen" : "fehlt";
    else if (kh >= MIN_KH) st = "ok";
    else st = (t === heute && !f.kcal) ? "offen" : "nein";   // heute noch nicht abgeschlossen
    tage.push({ date: t, kh: items && items.length ? kh : null, st: st });
  }
  out.krit.push({ id: "kh", st: worst(tage.map(function (x) { return x.st; })), tage: tage });

  /* 3 – Trainingstage im Fenster davor, ohne Deload */
  var von = addDays(termin, -TRAIN_FENSTER), n = 0, nDeload = 0, liste = [];
  Object.keys(trainDates).sort().forEach(function (t) {
    if (t < von || t > vortag || t > heute) return;
    if (inDeload(t)) { nDeload++; return; }
    n++; liste.push(t);
  });
  var rest = 0;   // noch mögliche Trainingstage vor dem Vortag (der ist Ruhetag), ohne Deload
  for (var t2 = addDays(heute, trainDates[heute] ? 1 : 0); t2 < vortag; t2 = addDays(t2, 1)) if (!inDeload(t2) && t2 >= von) rest++;
  var s3 = n >= MIN_TRAIN ? "ok" : (rest > 0 ? "offen" : "nein");
  out.krit.push({ id: "train", st: s3, n: n, nDeload: nDeload, daten: liste, restTage: rest });

  /* 4 – Ruhetag am Vortag */
  // am Vortag selbst: vorläufig ok, solange nichts eingetragen ist
  var s4 = trainDates[vortag] ? "nein" : (heute < vortag ? "offen" : "ok");
  out.krit.push({ id: "ruhe", st: s4, vortag: vortag });

  out.gesamt = worst(out.krit.map(function (k) { return k.st; }));
  return out;
}
function worst(arr) {
  var rang = { nein: 3, fehlt: 2, offen: 1, ok: 0 }, w = "ok";
  arr.forEach(function (s) { if (rang[s] > rang[w]) w = s; });
  return w;
}

var api = { check: check, MIN_KH: MIN_KH, addDays: addDays, iso: iso };
if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
root.tlInbody = api;

/* ─── UI (nur Browser) ───────────────────────────── */
function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; } }
function heute() { return typeof todayStr === "function" ? todayStr() : iso(new Date()); }
function dm(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
var WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function wt(s) { return WT[new Date(s + "T12:00:00").getDay()]; }
function dayDiff(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }

function termin() {
  var tt = root.tlTermine || [];
  for (var i = 0; i < tt.length; i++) if (tt[i].label === "InBody" && tt[i].date) return tt[i].date;
  return null;
}
/* aktiver Termin: liegt im Fenster [heute, heute + VORLAUF] */
function aktiv() {
  var t = termin(), h = heute();
  if (!t) return null;
  var d = dayDiff(h, t);
  return d >= 0 && d <= VORLAUF ? t : null;
}
function result() {
  var t = aktiv(); if (!t) return null;
  var dl = (typeof PLAN !== "undefined" && PLAN.deload) ? PLAN.deload : null;
  return check(t, heute(), readJSON("tl-f", {}), readJSON("tl-d", []), readJSON("tl-e", []), dl);
}

var ICON = { ok: "✓", offen: "○", fehlt: "?", nein: "✕" };
function zeile(st, titel, text) {
  return '<div class="ib-r ib-' + st + '"><span class="ib-i">' + ICON[st] + '</span><div><div class="ib-k">' + titel +
    '</div><div class="ib-x">' + text + '</div></div></div>';
}

function render() {
  var box = document.getElementById("ib-cont"); if (!box) return;
  var r = result();
  if (!r) { box.innerHTML = ""; return; }
  var h = heute(), d = dayDiff(h, r.termin), K = {};
  r.krit.forEach(function (k) { K[k.id] = k; });
  var wann = d === 0 ? "heute" : d === 1 ? "morgen" : "in " + d + " Tagen";

  var head = {
    ok:    ["ok", "Bereit – Messung vergleichbar"],
    offen: ["offen", "Auf Kurs – noch nicht alles erfüllt"],
    fehlt: ["fehlt", "Unklar – Angaben fehlen"],
    nein:  ["nein", "Nicht vergleichbar – Messung verschieben"]
  }[r.gesamt];

  /* 1 Symptome */
  var k1 = K.sym, t1;
  if (k1.st === "nein") t1 = "Zuletzt „Symptome“ angegeben (" + dm(k1.symDate) + "). Erkältung verschiebt Wasser und Glykogen – BIA liest das als Magermasse.";
  else if (k1.st === "ok") t1 = "Bestätigt am " + dm(k1.symDate) + ".";
  else t1 = "Ab dem Vortag (" + dm(addDays(r.termin, -1)) + ") hier bestätigen." + (k1.symDate ? " Letzte Angabe " + dm(k1.symDate) + ": " + (k1.sym === "frei" ? "symptomfrei" : "Symptome") + "." : "");
  var heuteSym = (readJSON("tl-d", []).find(function (x) { return x.date === h; }) || {}).sym || null;
  t1 += '<div class="ib-btns"><button class="ib-b' + (heuteSym === "frei" ? " on" : "") + '" onclick="tlInbodySym(\'frei\')">Heute symptomfrei</button>' +
        '<button class="ib-b' + (heuteSym === "krank" ? " on no" : "") + '" onclick="tlInbodySym(\'krank\')">Noch Symptome</button></div>';

  /* 2 KH */
  var t2 = K.kh.tage.map(function (x) {
    var v = x.kh === null ? (x.st === "offen" ? "–" : "nicht erfasst") : Math.round(x.kh) + " g";
    return '<span class="ib-c ib-' + x.st + '">' + wt(x.date) + " " + dm(x.date) + " · " + v + "</span>";
  }).join("") + '<div class="ib-x2">je ≥ ' + MIN_KH + " g (normal ~350, Ziel derzeit höher)</div>";

  /* 3 Training */
  var k3 = K.train, t3 = k3.n + " von " + MIN_TRAIN + " Einheiten" + (k3.daten.length ? " (" + k3.daten.map(dm).join(", ") + ")" : "");
  if (k3.nDeload) t3 += " · " + k3.nDeload + " Deload-Tag" + (k3.nDeload > 1 ? "e" : "") + " zählt nicht";
  if (k3.st === "offen") t3 += " · " + (k3.restTage === 1 ? "nur noch ein möglicher Tag" : "noch " + k3.restTage + " mögliche Tage") + " vor dem Ruhetag";
  if (k3.st === "nein") t3 += " · reicht bis zum Termin nicht mehr";

  /* 4 Ruhetag */
  var k4 = K.ruhe, t4 = wt(k4.vortag) + " " + dm(k4.vortag) + (k4.st === "nein" ? " wurde trainiert" : k4.st === "offen" ? " – an dem Tag nicht trainieren" : h === k4.vortag ? " – heute bisher ohne Training" : " ohne Training");

  box.innerHTML = '<div class="fsec ib-sec"><div class="fsub">InBody ' + wt(r.termin) + " " + dm(r.termin) + " · " + wann + "</div>" +
    '<div class="ib-h ib-' + head[0] + '">' + head[1] + "</div>" +
    zeile(k1.st, "Symptomfrei", t1) +
    zeile(K.kh.st, "Normale Kohlenhydrate, 3 Tage davor", t2) +
    zeile(k3.st, "≥ 2 Trainingstage in den 7 Tagen davor", t3) +
    zeile(k4.st, "Ruhetag am Vortag", t4) +
    '<div class="fhint">Am Morgen: 07:00, nüchtern, vor dem Trinken, nach dem Toilettengang · altes Studio, gleiches Gerät. ' +
    "Kriterien seit 07.08.: Messungen, die sie verfehlen, werden verworfen.</div></div>";
}

root.tlInbodySym = function (v) {
  var h = heute(), arr = readJSON("tl-d", []), i = arr.findIndex(function (x) { return x.date === h; });
  var cur = i >= 0 ? arr[i].sym : null, next = cur === v ? null : v;
  if (i >= 0) arr[i].sym = next;
  else { arr.push({ date: h, kcal: null, est: false, trip: false, rate: null, ratedAt: null, stiff: null, sym: next }); arr.sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  localStorage.setItem("tl-d", JSON.stringify(arr));
  render();
  if (typeof showFlash === "function") showFlash(next === null ? "Zurückgesetzt" : "Gespeichert ✓");
};
/* für header.js: Gesamtstatus + Sprung zur Karte */
root.tlInbodyStatus = function () { var r = result(); return r ? r.gesamt : null; };
root.tlInbodyJump = function () {
  if (typeof window.showView === "function") window.showView("weight");
  render();
  var b = document.getElementById("ib-cont");   // Abstand für die festen Chips oben
  if (b) setTimeout(function () { window.scrollTo({ top: Math.max(0, b.getBoundingClientRect().top + window.scrollY - 70), behavior: "smooth" }); }, 50);
};

var CSS = [
  ".ib-sec { margin-top:16px; }",
  ".ib-h { font-size:14px; font-weight:700; padding:8px 12px; border-radius:8px; margin-bottom:6px; }",
  ".ib-h.ib-ok { background:var(--go-bg); color:var(--go); }",
  ".ib-h.ib-offen { background:#F2F2F2; color:var(--text); }",
  ".ib-h.ib-fehlt { background:#FFF6DC; color:#7A6200; }",
  ".ib-h.ib-nein { background:#FBE9E7; color:#A33A2A; }",
  ".ib-r { display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); }",
  ".ib-r:last-of-type { border-bottom:none; }",
  ".ib-i { flex:0 0 22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }",
  ".ib-r.ib-ok .ib-i { background:var(--go-bg); color:var(--go); }",
  ".ib-r.ib-offen .ib-i { background:#F2F2F2; color:var(--muted); }",
  ".ib-r.ib-fehlt .ib-i { background:#FFF6DC; color:#7A6200; }",
  ".ib-r.ib-nein .ib-i { background:#FBE9E7; color:#A33A2A; }",
  ".ib-k { font-size:13.5px; font-weight:700; color:var(--text); }",
  ".ib-x { font-size:12.5px; color:var(--muted); line-height:1.5; margin-top:2px; }",
  ".ib-x2 { font-size:11.5px; color:var(--muted); margin-top:4px; }",
  ".ib-c { display:inline-block; font-size:12px; font-weight:600; padding:3px 8px; border-radius:6px; margin:4px 4px 0 0; background:#F2F2F2; color:var(--text); font-variant-numeric:tabular-nums; }",
  ".ib-c.ib-ok { background:var(--go-bg); color:var(--go); }",
  ".ib-c.ib-nein { background:#FBE9E7; color:#A33A2A; }",
  ".ib-c.ib-fehlt { background:#FFF6DC; color:#7A6200; }",
  ".ib-btns { display:flex; gap:8px; margin-top:8px; }",
  ".ib-b { flex:1; padding:9px 6px; border-radius:8px; border:1.5px solid var(--border); background:var(--surface); color:var(--text); font-family:var(--fb); font-size:12.5px; font-weight:700; }",
  ".ib-b.on { border-color:#B8DCB8; background:var(--go-bg); color:var(--go); }",
  ".ib-b.on.no { border-color:#E8B4AC; background:#FBE9E7; color:#A33A2A; }"
].join("\n");

function init() {
  var wv = document.getElementById("view-weight");
  if (!wv || document.getElementById("ib-cont")) return;
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  var box = document.createElement("div"); box.id = "ib-cont";
  // „Heute offen“ (daily.js) bleibt ganz oben, die InBody-Karte direkt darunter
  var todo = document.getElementById("d-todo");
  if (todo && todo.parentNode) todo.parentNode.insertBefore(box, todo.nextSibling);
  else wv.insertBefore(box, wv.firstChild);
  var orig = window.showView;
  if (typeof orig === "function") {
    window.showView = function (v) { var r = orig.apply(this, arguments); if (v === "weight") render(); return r; };
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") render(); });
  render();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})(typeof window !== "undefined" ? window : this);
