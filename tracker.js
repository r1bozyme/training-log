/* ─────────────────────────────────────────────────────────────
   tracker.js — Makro-Tracking + Abendpensum
   Stand: 6. September 2026

   Zweck: Das Restbudget für die Abendmahlzeit lokal ausrechnen,
   statt den Tag jedes Mal als Fließtext zu verschicken.

   Verhältnis zu daily.js: Der Kalorien-Haken (darunter/Ziel/
   darüber) dort bleibt die niedrigschwellige Tagesbewertung und
   die Grundlage der 14-Tage-Punktreihe. Dieses Modul ist die
   optionale Detailebene für Tage, an denen die Zahl gebraucht
   wird. Der Knopf "Tag abschließen" schreibt das Ergebnis in den
   Haken zurück, damit beide Ebenen nicht auseinanderlaufen.

   Bewusst NICHT enthalten: Ballaststoffe. Für die Hälfte der
   Produkte liegt kein belastbarer Etikettenwert vor, und ein
   Ziel von 38–42 g, das gegen halb geratene Zahlen läuft, ist
   schlechter als gar keins. Nachrüstbar, sobald die Werte im
   Produktreview stehen.

   Datenmodell
     tl-f   { "2026-09-05": [ Eintrag, ... ] }
            Eintrag = { id, pid, n, menge, unit, ref, kcal, kh, f, p }
            kcal/kh/f/p beziehen sich IMMER auf ref (100 g bzw.
            1 Stück). Absolutwert = wert * menge / ref. Dadurch
            bleibt die Menge nachträglich änderbar.
     tl-fp  eigene Produkte, gleiche Struktur wie PRODUKTE
     tl-fg  { goal, basis, basisV, ovr, rez }

   chk:1 heißt: Wert geschätzt. Der ?-Marker ist antippbar und
   öffnet den Werte-Editor; korrigierte Werte liegen als Override
   in tl-fg (c.ovr) und ersetzen die eingebauten Zahlen dauerhaft.
   Bereits eingetragene Posten behalten ihre Werte – ein Tag von
   gestern soll sich nicht rückwirkend ändern.

   06.09. – Ziel auf 3.000 kcal (einmalige Migration über GOAL_V,
   Datum landet in goalSince). Glycin als Produkt und als
   abschaltbarer Basisposten für Trainingstage. Basis-Migration
   von Reset auf additiv umgestellt.

   05.09. – zweite Fassung:
   · Hafermilch auf echte Etikettenwerte (Minor Figures Barista
     Oat Organic, je 100 ml). Der Platzhalter lag beim Fett fast
     2 g zu niedrig – Barista-Hafer ist fettangereichert.
   · FAGE in der Basis auf 250 g: 100 g morgens ins Müsli,
     150 g nachmittags. Migration über BASIS_V.
   · REZEPTE: Mittag- und Abendessen bestehen aus immer denselben
     vier bis sieben Posten. Einzeln eingetippt ist das der Punkt,
     an dem Tracking im Alltag abbricht – deshalb ein Tap.
   ───────────────────────────────────────────────────────────── */
(function () {
"use strict";

var LOG_KEY = "tl-f", PROD_KEY = "tl-fp", CFG_KEY = "tl-fg";

/* Ziel steht auf dem Stand vor der Erhöhung. Die +250 kcal sind
   für nach der InBody am 06.09. beschlossen – im Tab liegt dafür
   ein Knopf, damit der Wechsel ein datierter Akt ist und nicht
   unbemerkt passiert. */
var GOAL_ALT = { kcal: 2775, kh: 350, f: 82, p: 160 };
var GOAL_NEU = { kcal: 3000, kh: 405, f: 82, p: 160 };

/* 06.09.: InBody gemacht und gegen die Hauswaage gerechnet. Zwei
   unabhängige Fenster (04.08., 04.09.) ergeben +0,05 kg/Woche
   gegen ein Ziel von 0,2 – 2.775 kcal sind Erhaltung. Die
   Erhöhung ist damit beschlossen; GOAL_V schaltet sie einmalig
   um und datiert den Schritt über goalSince. Die Knöpfe bleiben:
   ein späterer Druck auf "2.775 kcal" wird nicht wieder
   überschrieben, weil GOAL_V dann bereits steht. */
var GOAL_V = 2;

/* ─── Produktbasis ──────────────────────────────────────────
   Werte je ref-Einheit. Quelle: Etikett, soweit vorhanden.
   chk:1 = geschätzt, beim nächsten Einkauf gegenprüfen. */
var PRODUKTE = [
  // Frühstück
  { id:"m615",    n:"Müsli Seitenbacher #615",        g:"Frühstück", ref:100, unit:"g",      kcal:380, kh:51,   f:12,   p:11,   std:100, chk:1 },
  { id:"menergy", n:"Müsli Seitenbacher Energy",      g:"Frühstück", ref:100, unit:"g",      kcal:365, kh:59,   f:9,    p:10,   std:100, chk:1 },
  { id:"mbaer",   n:"Alnatura Knusper Bär",           g:"Frühstück", ref:100, unit:"g",      kcal:400, kh:60,   f:12,   p:9,    std:60,  chk:1 },
  { id:"hafermi", n:"Hafermilch Minor Figures Barista",g:"Frühstück", ref:100, unit:"ml",     kcal:45.5,kh:6.9,  f:1.85, p:0.35, std:150 },
  { id:"haferfl", n:"Haferflocken",                   g:"Frühstück", ref:100, unit:"g",      kcal:372, kh:59,   f:7,    p:13,   std:60 },
  { id:"cappu",   n:"Cappuccino",                     g:"Frühstück", ref:1,   unit:"Tasse",  kcal:60,  kh:4.5,  f:3,    p:4,    std:2,   chk:1 },

  // Milchprodukte
  { id:"fage02",  n:"FAGE Total 0,2 %",               g:"Milch",     ref:100, unit:"g",      kcal:55,  kh:3.0,  f:0.2,  p:10.3, std:200 },
  { id:"fage2",   n:"FAGE Total 2 %",                 g:"Milch",     ref:100, unit:"g",      kcal:70,  kh:3.0,  f:2.0,  p:9.9,  std:200 },
  { id:"quark",   n:"Magerquark Berchtesgadener",     g:"Milch",     ref:100, unit:"g",      kcal:70,  kh:3.6,  f:0.6,  p:11.9, std:250 },
  { id:"mozza",   n:"Bio Mozzarella (EDEKA)",         g:"Milch",     ref:100, unit:"g",      kcal:243, kh:1.0,  f:18.5, p:18.1, std:60 },
  { id:"parmesan",n:"Parmesan / Pecorino",            g:"Milch",     ref:100, unit:"g",      kcal:402, kh:0,    f:29,   p:32,   std:30 },

  // Protein
  { id:"whey",    n:"Whey ON Gold Standard",          g:"Protein",   ref:1,   unit:"Scoop",  kcal:120, kh:3,    f:1,    p:24,   std:1 },
  { id:"tofu",    n:"Berief Bio Tofu Natur",          g:"Protein",   ref:100, unit:"g",      kcal:138, kh:0.7,  f:8.0,  p:15.4, std:200 },
  { id:"tempeh",  n:"Tempeh",                         g:"Protein",   ref:100, unit:"g",      kcal:177, kh:6,    f:9,    p:21,   std:150 },
  { id:"ei",      n:"Ei (Größe M, ~58 g)",            g:"Protein",   ref:1,   unit:"Stück",  kcal:78,  kh:0.6,  f:5.5,  p:6.5,  std:2 },
  { id:"linsen",  n:"Rote Linsen (trocken)",          g:"Protein",   ref:100, unit:"g",      kcal:304, kh:45,   f:1.5,  p:23,   std:70 },
  { id:"edamame", n:"Edamame TK",                     g:"Protein",   ref:100, unit:"g",      kcal:125, kh:8,    f:5,    p:11,   std:100 },

  // Brot & Beilagen
  { id:"lieken",  n:"Lieken Urkorn",                  g:"Brot/KH",   ref:1,   unit:"Scheibe",kcal:113, kh:21.2, f:0.7,  p:3.1,  std:2 },
  { id:"saaten",  n:"Saatenbrot (60 g/Scheibe)",      g:"Brot/KH",   ref:1,   unit:"Scheibe",kcal:176, kh:10.8, f:10.8, p:6.6,  std:2 },
  { id:"roggkl",  n:"Bio Roggenbrot m. Weizenkleie",  g:"Brot/KH",   ref:1,   unit:"Scheibe",kcal:99,  kh:5.6,  f:4.0,  p:8.0,  std:2 },
  { id:"fusilli", n:"Protein+ Fusilli (roh)",         g:"Brot/KH",   ref:100, unit:"g",      kcal:354, kh:63,   f:1.7,  p:20,   std:100 },
  { id:"reis",    n:"Basmatireis (roh)",              g:"Brot/KH",   ref:100, unit:"g",      kcal:350, kh:77,   f:1,    p:8,    std:100 },
  { id:"kartof",  n:"Kartoffeln",                     g:"Brot/KH",   ref:100, unit:"g",      kcal:77,  kh:17,   f:0.1,  p:2,    std:300 },

  // Fett
  { id:"norsan",  n:"Norsan Omega-3 Vegan (5 ml)",    g:"Fett",      ref:1,   unit:"Port.",  kcal:41,  kh:0,    f:4.6,  p:0,    std:1 },
  { id:"olivoel", n:"Olivenöl",                       g:"Fett",      ref:1,   unit:"EL",     kcal:88,  kh:0,    f:10,   p:0,    std:1 },
  { id:"butter",  n:"Butter",                         g:"Fett",      ref:100, unit:"g",      kcal:740, kh:0.6,  f:82,   p:0.7,  std:10 },
  { id:"nuesse",  n:"Nüsse gemischt",                 g:"Fett",      ref:100, unit:"g",      kcal:620, kh:12,   f:55,   p:20,   std:30 },
  { id:"avocado", n:"Avocado",                        g:"Fett",      ref:100, unit:"g",      kcal:160, kh:2,    f:15,   p:2,    std:100 },
  { id:"sesamoel",n:"Sesamöl",                        g:"Fett",      ref:1,   unit:"TL",     kcal:45,  kh:0,    f:5,    p:0,    std:1 },

  // Obst & Gemüse
  { id:"banane",  n:"Banane (~120 g)",                g:"Obst/Gem.", ref:1,   unit:"Stück",  kcal:107, kh:27,   f:0.3,  p:1.3,  std:1 },
  { id:"heidel",  n:"Heidelbeeren TK",                g:"Obst/Gem.", ref:100, unit:"g",      kcal:57,  kh:12,   f:0.3,  p:0.7,  std:70 },
  { id:"gemuese", n:"Gemüse gemischt",                g:"Obst/Gem.", ref:100, unit:"g",      kcal:35,  kh:5,    f:0.3,  p:2,    std:200 },
  { id:"passata", n:"Passata",                        g:"Obst/Gem.", ref:100, unit:"g",      kcal:35,  kh:6,    f:0.2,  p:1.3,  std:200 },

  // Würzen
  { id:"sojasauce",n:"Sojasauce",                     g:"Würzen",    ref:1,   unit:"EL",     kcal:10,  kh:1,    f:0,    p:1,    std:2 },

  /* Glycin zählt mit 4 kcal/g in die Tagesbilanz, aber bewusst
     NICHT in das Proteinziel: nicht essenziell, kein Beitrag zur
     Muskelproteinsynthese. Deshalb p:0 - 15 g erscheinen als
     60 kcal ohne Makrozuordnung. Die Bilanz KCAL vs. KH+F+P geht
     dadurch um diese 60 kcal auseinander; das ist gewollt und die
     einzige ehrliche Darstellung. */
  { id:"glycin",  n:"Glycin (Trainingstag)",          g:"Supplemente", ref:1,  unit:"g",      kcal:4,   kh:0,    f:0,    p:0,    std:15 }
];

/* Fixbasis: die täglich wiederkehrenden Posten. on:false heißt,
   der Posten gehört zur Basis, wird aber aktuell nicht mitgeführt. */
var BASIS_V = 3;   // hochzählen, wenn BASIS_DEF sich ändert -> Migration
var BASIS_DEF = [
  { pid:"m615",    menge:100, on:true },
  { pid:"hafermi", menge:150, on:true },
  { pid:"quark",   menge:100, on:true },
  { pid:"fage02",  menge:250, on:true },
  { pid:"nuesse",  menge:30,  on:true },
  { pid:"banane",  menge:1,   on:true },
  { pid:"heidel",  menge:70,  on:true },
  { pid:"cappu",   menge:2,   on:true },
  { pid:"whey",    menge:1,   on:true },
  { pid:"norsan",  menge:1,   on:true },
  /* Steht in der Basis, ist aber standardmäßig aus: Glycin läuft
     nur an Trainingstagen. Ein Tap auf das Häkchen vor dem
     Training, statt den Posten jedes Mal zu suchen. */
  { pid:"glycin",  menge:15,  on:false }
];

/* Rezepte aus dem Ernährungsplan plus die drei Abend-Bausteine.
   items = [{pid, menge}]. Eigene Rezepte liegen in cfg().rez und
   haben dieselbe Struktur. */
var REZEPTE = [
  { id:"r1", n:"Linsen-Bolognese", zeit:"Mittag", items:[
    {pid:"fusilli",menge:100},{pid:"linsen",menge:70},{pid:"passata",menge:200},
    {pid:"olivoel",menge:1},{pid:"parmesan",menge:30}] },
  { id:"r2", n:"Gebratener Reis, Tofu & Edamame", zeit:"Mittag", items:[
    {pid:"reis",menge:100},{pid:"tofu",menge:180},{pid:"edamame",menge:100},
    {pid:"ei",menge:2},{pid:"olivoel",menge:1},{pid:"sesamoel",menge:1},{pid:"sojasauce",menge:2}] },
  { id:"r3", n:"Tempeh-Bowl mit Linsen", zeit:"Mittag", items:[
    {pid:"tempeh",menge:150},{pid:"linsen",menge:80},{pid:"saaten",menge:2},
    {pid:"gemuese",menge:200},{pid:"olivoel",menge:1},{pid:"sojasauce",menge:1}] },
  { id:"a1", n:"Pasta-Abend (fettarm)", zeit:"Abend", items:[
    {pid:"fusilli",menge:120},{pid:"passata",menge:200},{pid:"parmesan",menge:20}] },
  { id:"a2", n:"Brot-Abend", zeit:"Abend", items:[
    {pid:"lieken",menge:3},{pid:"roggkl",menge:2},{pid:"quark",menge:150}] },
  { id:"a3", n:"Reis & Tofu", zeit:"Abend", items:[
    {pid:"reis",menge:100},{pid:"tofu",menge:200},{pid:"gemuese",menge:200}] }
];

/* ─── Storage ───────────────────────────────────────────── */
function readJSON(k, fb) {
  try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; }
  catch (e) { return fb; }
}
window.loadFood = function () { return readJSON(LOG_KEY, {}); };
function saveLog(o) { localStorage.setItem(LOG_KEY, JSON.stringify(o)); }

function ownProducts() { return readJSON(PROD_KEY, []); }
function saveOwn(a) { localStorage.setItem(PROD_KEY, JSON.stringify(a)); }

function cfg() {
  var c = readJSON(CFG_KEY, {});
  if (!c.goal)  c.goal  = { kcal:GOAL_ALT.kcal, kh:GOAL_ALT.kh, f:GOAL_ALT.f, p:GOAL_ALT.p };
  if (!c.basis) c.basis = BASIS_DEF.map(function (b) { return { pid:b.pid, menge:b.menge, on:b.on }; });
  if (!c.ovr)   c.ovr   = {};
  if (!c.rez)   c.rez   = [];
  return c;
}
function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

window.loadFoodGoal = function () { return cfg().goal; };

/* Overrides sind korrigierte Etikettenwerte. Sie ersetzen die
   eingebauten Zahlen und löschen die chk-Markierung – der Wert
   ist dann geprüft. */
function applyOvr(p, ovr) {
  var o = ovr[p.id];
  if (!o) return p;
  var q = {};
  for (var k in p) q[k] = p[k];
  ["kcal","kh","f","p"].forEach(function (k) {
    if (typeof o[k] === "number" && isFinite(o[k])) q[k] = o[k];
  });
  delete q.chk;
  return q;
}
function allProducts() {
  var ovr = readJSON(CFG_KEY, {}).ovr || {};
  return PRODUKTE.concat(ownProducts()).map(function (p) { return applyOvr(p, ovr); });
}
function prod(pid) {
  var a = allProducts();
  for (var i = 0; i < a.length; i++) if (a[i].id === pid) return a[i];
  return null;
}

/* ─── Rechnen ───────────────────────────────────────────── */
function abs(it, key) {
  var per = Number(it[key]) || 0, m = Number(it.menge) || 0, r = Number(it.ref) || 1;
  return per * m / r;
}
function sumDay(items) {
  var s = { kcal:0, kh:0, f:0, p:0 };
  (items || []).forEach(function (it) {
    s.kcal += abs(it, "kcal"); s.kh += abs(it, "kh");
    s.f    += abs(it, "f");    s.p  += abs(it, "p");
  });
  return s;
}
window.foodDaySum = function (date) { return sumDay(loadFood()[date] || []); };

function n0(x) { return Math.round(x); }
function n1(x) { return (Math.round(x * 10) / 10).toString().replace(".", ","); }

/* ─── Tageszustand ──────────────────────────────────────── */
var fDate = null, fSearch = "", fOpen = null, fBasisOpen = false, fNewOpen = false;

function curDate() {
  var el = document.getElementById("f-day");
  return (el && el.value) || fDate || todayStr();
}
function dayItems(d) { return loadFood()[d] || []; }
function putItems(d, arr) {
  var log = loadFood();
  if (!arr.length) delete log[d]; else log[d] = arr;
  saveLog(log);
}

window.foodAdd = function (pid, menge) {
  var pr = prod(pid);
  if (!pr) return;
  var m = Number(String(menge).replace(",", "."));
  if (!isFinite(m) || m <= 0) { showFlash("Menge prüfen"); return; }
  var d = curDate(), arr = dayItems(d).slice();
  arr.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    pid: pr.id, n: pr.n, menge: m, unit: pr.unit, ref: pr.ref,
    kcal: pr.kcal, kh: pr.kh, f: pr.f, p: pr.p
  });
  putItems(d, arr);
  fOpen = null; fSearch = "";
  buildFood();
  showFlash(pr.n + " ✓");
};

window.foodDel = function (id) {
  var d = curDate();
  putItems(d, dayItems(d).filter(function (x) { return x.id !== id; }));
  buildFood();
};

window.foodBasis = function () {
  var d = curDate(), arr = dayItems(d).slice(), c = cfg(), n = 0;
  c.basis.forEach(function (b) {
    if (!b.on) return;
    var pr = prod(b.pid); if (!pr) return;
    // doppelte Basis-Posten am selben Tag vermeiden
    var da = arr.some(function (x) { return x.pid === b.pid; });
    if (da) return;
    arr.push({
      id: Date.now() + Math.floor(Math.random() * 100000),
      pid: pr.id, n: pr.n, menge: b.menge, unit: pr.unit, ref: pr.ref,
      kcal: pr.kcal, kh: pr.kh, f: pr.f, p: pr.p
    });
    n++;
  });
  putItems(d, arr);
  buildFood();
  showFlash(n ? n + " Posten übernommen ✓" : "Basis steht schon");
};

window.foodClear = function () {
  var d = curDate();
  if (!dayItems(d).length) return;
  if (!confirm("Alle Einträge vom " + fmtDate(d) + " löschen?")) return;
  putItems(d, []);
  buildFood();
};

/* Ergebnis in den Kalorien-Haken von daily.js zurückschreiben.
   Bewusst manuell: mitten am Tag liegt jede Summe unter Ziel,
   ein automatischer Haken wäre systematisch "darunter". */
window.foodClose = function () {
  var d = curDate(), s = sumDay(dayItems(d)), g = cfg().goal;
  var diff = s.kcal - g.kcal;
  var state = diff < -125 ? "under" : (diff > 125 ? "over" : "hit");
  if (typeof window.setKcal !== "function") { showFlash("Werte-Tab nicht geladen"); return; }
  var el = document.getElementById("d-date");
  var keep = el ? el.value : null;
  if (el) el.value = d;
  window.setKcal(state);                       // schreibt in tl-d
  if (el && keep !== null) el.value = keep;
  buildFood();
  showFlash("Als \u201E" + ({under:"darunter",hit:"Ziel",over:"darüber"}[state]) + "\u201C gewertet");
};

/* ─── Eigene Produkte ───────────────────────────────────── */
window.foodNewToggle = function () { fNewOpen = !fNewOpen; buildFood(); };

window.foodNewSave = function () {
  function v(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function num(id) { var x = Number(v(id).replace(",", ".")); return isFinite(x) ? x : 0; }
  var name = v("fn-name");
  if (!name) { showFlash("Name fehlt"); return; }
  var refSel = v("fn-ref");             // "100g" | "100ml" | "1"
  var unit   = v("fn-unit") || "Stück";
  var p = {
    id: "own" + Date.now(),
    n: name, g: "Eigene",
    ref: refSel === "1" ? 1 : 100,
    unit: refSel === "100g" ? "g" : (refSel === "100ml" ? "ml" : unit),
    kcal: num("fn-kcal"), kh: num("fn-kh"), f: num("fn-f"), p: num("fn-p"),
    std: refSel === "1" ? 1 : 100
  };
  if (!p.kcal && !p.kh && !p.f && !p.p) { showFlash("Nährwerte fehlen"); return; }
  var a = ownProducts(); a.push(p); saveOwn(a);
  fNewOpen = false; fSearch = name;
  buildFood();
  showFlash("Produkt gespeichert ✓");
};

window.foodOwnDel = function (pid) {
  if (!confirm("Produkt aus der eigenen Liste entfernen?\n\nBereits eingetragene Tage bleiben unverändert.")) return;
  saveOwn(ownProducts().filter(function (x) { return x.id !== pid; }));
  buildFood();
};

/* ─── Nährwerte korrigieren ─────────────────────────────── */
window.foodProdEdit = function (pid, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var pr = prod(pid);
  if (!pr) return;
  var einheit = pr.ref === 100 ? ("100 " + (pr.unit === "ml" ? "ml" : "g")) : pr.unit;
  function ask(lbl, cur) {
    var r = prompt(lbl + " je " + einheit + ":", cur);
    if (r === null) return null;
    var x = Number(String(r).replace(",", "."));
    return isFinite(x) && x >= 0 ? x : cur;
  }
  var kcal = ask("kcal", pr.kcal);      if (kcal === null) return;
  var kh   = ask("KH (g)", pr.kh);      if (kh === null) return;
  var f    = ask("Fett (g)", pr.f);     if (f === null) return;
  var p    = ask("Protein (g)", pr.p);  if (p === null) return;
  var c = cfg();
  c.ovr[pid] = { kcal:kcal, kh:kh, f:f, p:p };
  saveCfg(c); buildFood();
  showFlash("Werte korrigiert ✓");
};

/* ─── Rezepte ───────────────────────────────────────────── */
function allRezepte() { return REZEPTE.concat(cfg().rez || []); }

function rezSum(r) {
  return sumDay((r.items || []).map(function (x) {
    var pr = prod(x.pid);
    return pr ? { menge:x.menge, ref:pr.ref, kcal:pr.kcal, kh:pr.kh, f:pr.f, p:pr.p }
              : { menge:0, ref:1, kcal:0, kh:0, f:0, p:0 };
  }));
}

window.foodRez = function (rid) {
  var all = allRezepte(), r = null;
  for (var i = 0; i < all.length; i++) if (all[i].id === rid) r = all[i];
  if (!r) return;
  var d = curDate(), arr = dayItems(d).slice(), n = 0;
  r.items.forEach(function (x) {
    var pr = prod(x.pid); if (!pr) return;
    arr.push({
      id: Date.now() + Math.floor(Math.random() * 100000) + n,
      pid: pr.id, n: pr.n, menge: x.menge, unit: pr.unit, ref: pr.ref,
      kcal: pr.kcal, kh: pr.kh, f: pr.f, p: pr.p
    });
    n++;
  });
  putItems(d, arr);
  buildFood();
  showFlash(r.n + " · " + n + " Posten ✓");
};

/* Speichert die heutigen Posten als Rezept – ohne die Fixbasis,
   sonst wäre jedes Rezept das halbe Tagesgerüst.
   Abgezogen wird je Produkt nur so oft, wie es in der Basis steht.
   Sonst verschwände etwa der Magerquark eines Brot-Abends, bloß
   weil morgens ebenfalls Magerquark ins Müsli geht. */
window.foodRezSaveDay = function () {
  var c = cfg();
  var rest = {};
  c.basis.forEach(function (b) { if (b.on) rest[b.pid] = (rest[b.pid] || 0) + 1; });
  var items = dayItems(curDate()).filter(function (it) {
    if (rest[it.pid]) { rest[it.pid]--; return false; }
    return true;
  });
  if (!items.length) { showFlash("Keine Posten außerhalb der Basis"); return; }
  var name = prompt("Name der Mahlzeit:", "");
  if (name === null || !name.trim()) return;
  c.rez.push({
    id: "rz" + Date.now(), n: name.trim(), zeit: "Eigene",
    items: items.map(function (it) { return { pid: it.pid, menge: it.menge }; })
  });
  saveCfg(c); buildFood();
  showFlash("Mahlzeit gespeichert ✓");
};

window.foodRezDel = function (rid, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (!confirm("Mahlzeit löschen?")) return;
  var c = cfg();
  c.rez = (c.rez || []).filter(function (r) { return r.id !== rid; });
  saveCfg(c); buildFood();
};

/* ─── Fixbasis bearbeiten ───────────────────────────────── */
window.foodBasisToggle = function () { fBasisOpen = !fBasisOpen; buildFood(); };

window.foodBasisSet = function (pid, on) {
  var c = cfg();
  c.basis.forEach(function (b) { if (b.pid === pid) b.on = on; });
  saveCfg(c); buildFood();
};
window.foodBasisMenge = function (pid, val) {
  var m = Number(String(val).replace(",", "."));
  if (!isFinite(m) || m < 0) return;
  var c = cfg();
  c.basis.forEach(function (b) { if (b.pid === pid) b.menge = m; });
  saveCfg(c); buildFood();
};
window.foodBasisAdd = function () {
  var pid = document.getElementById("fb-add").value;
  if (!pid) return;
  var c = cfg();
  if (c.basis.some(function (b) { return b.pid === pid; })) { showFlash("Steht schon in der Basis"); return; }
  var pr = prod(pid);
  c.basis.push({ pid: pid, menge: pr ? pr.std : 1, on: true });
  saveCfg(c); buildFood();
};
window.foodBasisDel = function (pid) {
  var c = cfg();
  c.basis = c.basis.filter(function (b) { return b.pid !== pid; });
  saveCfg(c); buildFood();
};

/* ─── Ziel ──────────────────────────────────────────────── */
window.foodGoalSet = function (which) {
  var c = cfg();
  var g = which === "neu" ? GOAL_NEU : GOAL_ALT;
  c.goal = { kcal:g.kcal, kh:g.kh, f:g.f, p:g.p };
  c.goalSince = todayStr();
  saveCfg(c); buildFood();
  showFlash("Ziel auf " + g.kcal + " kcal");
};
window.foodGoalEdit = function () {
  var c = cfg();
  function ask(lbl, cur) {
    var r = prompt(lbl, cur);
    if (r === null) return null;
    var x = Number(String(r).replace(",", "."));
    return isFinite(x) && x > 0 ? x : cur;
  }
  var k = ask("Kalorienziel (kcal):", c.goal.kcal); if (k === null) return;
  var kh = ask("Kohlenhydrate (g):", c.goal.kh);    if (kh === null) return;
  var f = ask("Fett (g):", c.goal.f);               if (f === null) return;
  var p = ask("Protein (g):", c.goal.p);            if (p === null) return;
  c.goal = { kcal:k, kh:kh, f:f, p:p };
  c.goalSince = todayStr();
  saveCfg(c); buildFood();
  showFlash("Ziel gespeichert ✓");
};

/* ─── Suche / Auswahl ───────────────────────────────────── */
window.foodSearch = function (v) {
  fSearch = v || "";
  renderPicker();
};
window.foodPick = function (pid) {
  fOpen = (fOpen === pid) ? null : pid;
  renderPicker();
};
window.foodPickAdd = function (pid) {
  var el = document.getElementById("fq-" + pid);
  foodAdd(pid, el ? el.value : 0);
};
window.foodStep = function (pid, delta) {
  var el = document.getElementById("fq-" + pid);
  if (!el) return;
  var v = Number(String(el.value).replace(",", ".")) || 0;
  var nv = v + delta;
  el.value = nv > 0 ? (Math.round(nv * 10) / 10) : 0;
};

/* ─── Render: Picker ────────────────────────────────────── */
function renderPicker() {
  var box = document.getElementById("f-picker");
  if (!box) return;
  var q = fSearch.trim().toLowerCase();
  var list = allProducts().filter(function (p) {
    return !q || p.n.toLowerCase().indexOf(q) !== -1 || (p.g || "").toLowerCase().indexOf(q) !== -1;
  });
  if (!list.length) {
    box.innerHTML = '<div class="fhint">Nichts gefunden. Über <strong>+ Eigenes Produkt</strong> anlegen – es steht danach dauerhaft in der Liste.</div>';
    return;
  }
  var groups = {};
  list.forEach(function (p) { (groups[p.g || "Sonstiges"] = groups[p.g || "Sonstiges"] || []).push(p); });

  box.innerHTML = Object.keys(groups).map(function (g) {
    return '<div class="fgrp">' + g + "</div>" + groups[g].map(function (p) {
      var open = fOpen === p.id;
      var per = p.ref === 100 ? ("je 100 " + (p.unit === "ml" ? "ml" : "g")) : ("je " + p.unit);
      var head = '<div class="fprow' + (open ? " open" : "") + '" onclick="foodPick(\'' + p.id + '\')">' +
        '<div class="fpn">' + esc(p.n) +
          (p.chk ? ' <span class="fchk" onclick="foodProdEdit(\'' + p.id + '\',event)">?</span>' : "") + "</div>" +
        '<div class="fpm">' + n0(p.kcal) + " kcal " + per + "</div>" +
        '<span class="fpc">' + (open ? "−" : "+") + "</span></div>";
      if (!open) return head;
      var stepv = p.ref === 100 ? 10 : 1;
      return head + '<div class="fpbody">' +
        '<div class="fqrow">' +
          '<button class="fqb" onclick="foodStep(\'' + p.id + '\',-' + stepv + ')">−</button>' +
          '<input class="fqi" type="number" id="fq-' + p.id + '" value="' + p.std + '" inputmode="decimal" step="any">' +
          '<span class="fqu">' + (p.ref === 100 ? (p.unit === "ml" ? "ml" : "g") : p.unit) + "</span>" +
          '<button class="fqb" onclick="foodStep(\'' + p.id + '\',' + stepv + ')">+</button>' +
          '<button class="fqadd" onclick="foodPickAdd(\'' + p.id + '\')">Hinzufügen</button>' +
        "</div>" +
        '<div class="fpmacro">Je ' + (p.ref === 100 ? "100 " + (p.unit === "ml" ? "ml" : "g") : p.unit) + ": " +
          n1(p.kh) + " g KH · " + n1(p.f) + " g F · " + n1(p.p) + " g P" +
          ' <button class="fowndel" onclick="foodProdEdit(\'' + p.id + '\',event)">Werte bearbeiten</button>' +
          (p.g === "Eigene" ? ' <button class="fowndel" onclick="foodOwnDel(\'' + p.id + '\')">löschen</button>' : "") +
        "</div></div>";
    }).join("");
  }).join("");
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Render: Gesamt ────────────────────────────────────── */
window.buildFood = function () {
  var cont = document.getElementById("f-cont");
  if (!cont) return;
  var d = curDate(), items = dayItems(d), s = sumDay(items), c = cfg(), g = c.goal;

  var rest = { kcal: g.kcal - s.kcal, kh: g.kh - s.kh, f: g.f - s.f, p: g.p - s.p };

  /* Bindender Faktor: der Makro mit dem kleinsten verbleibenden
     Anteil. Nach Erfahrung fast immer Fett – die Anzeige soll das
     zeigen, statt es vorauszusetzen. */
  var quota = [
    { k:"f",    lbl:"Fett",           left:rest.f,    goal:g.f },
    { k:"kh",   lbl:"Kohlenhydrate",  left:rest.kh,   goal:g.kh },
    { k:"p",    lbl:"Protein",        left:rest.p,    goal:g.p },
    { k:"kcal", lbl:"Kalorien",       left:rest.kcal, goal:g.kcal }
  ];
  var binder = quota.slice().sort(function (a, b) {
    return (a.left / a.goal) - (b.left / b.goal);
  })[0];

  var bars = [
    { lbl:"KCAL", used:s.kcal, goal:g.kcal },
    { lbl:"KH",   used:s.kh,   goal:g.kh },
    { lbl:"FETT", used:s.f,    goal:g.f },
    { lbl:"PROT", used:s.p,    goal:g.p }
  ].map(function (b) {
    var pct = b.goal ? Math.min(b.used / b.goal * 100, 100) : 0;
    var over = b.goal && b.used > b.goal;
    var cls = over ? "over" : (pct >= 85 ? "tight" : "");
    return '<div class="fbar">' +
      '<div class="fbl">' + b.lbl + "</div>" +
      '<div class="fbv ' + cls + '">' + n0(b.used) + '<span class="fbg">/' + n0(b.goal) + "</span></div>" +
      '<div class="fbtrack"><div class="fbfill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      "</div>";
  }).join("");

  /* Abendpensum */
  var pensum;
  if (!items.length) {
    pensum = '<div class="fphint">Noch nichts eingetragen. <strong>Fixbasis eintragen</strong> setzt die zehn täglichen Posten in einem Schritt.</div>';
  } else {
    var pcls = rest.kcal < 0 ? "over" : (rest.kcal < 250 ? "tight" : "");
    var line;
    if (rest.kcal < 0) {
      line = "Das Tagesziel ist um <strong>" + n0(-rest.kcal) + " kcal</strong> überschritten. Ein einzelner Tag darüber ist ohne Bedeutung – die Wochensumme zählt.";
    } else if (binder.left < 0) {
      line = "<strong>" + binder.lbl + "</strong> ist bereits " + n1(-binder.left) + " g über dem Ziel, während noch " + n0(rest.kcal) + " kcal offen sind. Die Restkalorien müssen aus den anderen beiden Makros kommen.";
    } else {
      line = "Bindender Faktor: <strong>" + binder.lbl + "</strong> – davon sind nur noch " +
             (binder.k === "kcal" ? n0(binder.left) + " kcal" : n1(binder.left) + " g") +
             " frei (" + Math.round(binder.left / binder.goal * 100) + " % des Tagesziels). Das Abendessen daran ausrichten.";
    }
    pensum = '<div class="fpensum ' + pcls + '">' +
      '<div class="fph">RESTBUDGET</div>' +
      '<div class="fpgrid">' +
        '<div><div class="fpn2">' + n0(rest.kcal) + '</div><div class="fpl">kcal</div></div>' +
        '<div><div class="fpn2">' + n0(rest.kh)   + '</div><div class="fpl">g KH</div></div>' +
        '<div><div class="fpn2">' + n0(rest.f)    + '</div><div class="fpl">g Fett</div></div>' +
        '<div><div class="fpn2">' + n0(rest.p)    + '</div><div class="fpl">g Prot.</div></div>' +
      "</div>" +
      '<div class="fpline">' + line + "</div></div>";
  }

  /* Tagesliste */
  var liste = "";
  if (items.length) {
    liste = '<div class="fsec"><div class="fsub">Heute erfasst · ' + items.length + " Posten</div>" +
      items.map(function (it) {
        var mu = (it.ref === 100) ? (n1(it.menge) + " " + (it.unit === "ml" ? "ml" : "g"))
                                  : (n1(it.menge) + " " + it.unit);
        return '<div class="fitem">' +
          '<div class="fin"><div class="fitn">' + esc(it.n) + "</div>" +
          '<div class="fitm">' + mu + " · " + n0(abs(it, "kcal")) + " kcal · " +
            n1(abs(it, "kh")) + " KH · " + n1(abs(it, "f")) + " F · " + n1(abs(it, "p")) + " P</div></div>" +
          '<button class="fx" onclick="foodDel(' + it.id + ')">×</button></div>';
      }).join("") +
      '<div class="frow2">' +
        '<button class="fbtn2" onclick="foodClose()">Tag abschließen</button>' +
        '<button class="fbtn2 ghost" onclick="foodClear()">Tag leeren</button>' +
      "</div></div>";
  }

  /* Mahlzeiten. Sortiert nach Fett, weil das die Größe ist, an der
     die Auswahl am Abend tatsächlich scheitert. Der Rest-Fett-Wert
     des Tages entscheidet, was noch passt – deshalb steht neben
     jeder Mahlzeit das Fett und nicht nur die Kalorienzahl. */
  var rezAll = allRezepte();
  var rezHtml = ["Mittag", "Abend", "Eigene"].map(function (z) {
    var rs = rezAll.filter(function (r) { return (r.zeit || "Eigene") === z; });
    if (!rs.length) return "";
    rs.sort(function (a, b) { return rezSum(a).f - rezSum(b).f; });
    return '<div class="fgrp">' + z + "</div>" + rs.map(function (r) {
      var rs2 = rezSum(r);
      var passt = items.length && rs2.f <= rest.f && rs2.kcal <= rest.kcal;
      var eng   = items.length && !passt;
      return '<div class="frez' + (eng ? " eng" : (passt ? " passt" : "")) + '" onclick="foodRez(\'' + r.id + '\')">' +
        '<div class="frezn">' + esc(r.n) + "</div>" +
        '<div class="frezm">' + n0(rs2.kcal) + " kcal · " + n1(rs2.f) + " g F · " + n0(rs2.p) + " g P</div>" +
        (r.zeit === "Eigene" ? '<button class="fx" onclick="foodRezDel(\'' + r.id + '\',event)">×</button>' : '<span class="frezc">+</span>') +
        "</div>";
    }).join("");
  }).join("");

  var mahlzeiten = '<div class="fsec"><div class="fsub">Mahlzeiten</div>' + rezHtml +
    '<button class="fbtn2 ghost" style="width:100%;margin-top:12px" onclick="foodRezSaveDay()">Heutige Posten als Mahlzeit sichern</button>' +
    '<div class="fhint">Ein Tap setzt alle Posten des Rezepts. Mengen danach einzeln über × und Neuzugabe anpassen, wenn du abgewandelt hast. Gesichert wird ohne die Fixbasis – nur was zusätzlich auf dem Tag steht.</div></div>';

  /* Fixbasis-Editor */
  var basisSum = sumDay(c.basis.filter(function (b) { return b.on; }).map(function (b) {
    var pr = prod(b.pid);
    return pr ? { menge:b.menge, ref:pr.ref, kcal:pr.kcal, kh:pr.kh, f:pr.f, p:pr.p }
              : { menge:0, ref:1, kcal:0, kh:0, f:0, p:0 };
  }));
  var chkCount = c.basis.filter(function (b) { var pr = prod(b.pid); return b.on && pr && pr.chk; }).length;

  var basisBody = "";
  if (fBasisOpen) {
    basisBody = '<div class="fbasisbody">' +
      c.basis.map(function (b) {
        var pr = prod(b.pid);
        if (!pr) return "";
        var u = pr.ref === 100 ? (pr.unit === "ml" ? "ml" : "g") : pr.unit;
        return '<div class="fbrow' + (b.on ? "" : " off") + '">' +
          '<button class="fbtog" onclick="foodBasisSet(\'' + b.pid + '\',' + (b.on ? "false" : "true") + ')">' + (b.on ? "✓" : "") + "</button>" +
          '<div class="fbn">' + esc(pr.n) +
            (pr.chk ? ' <span class="fchk" onclick="foodProdEdit(\'' + b.pid + '\',event)">?</span>' : "") + "</div>" +
          '<input class="fbi" type="number" value="' + b.menge + '" inputmode="decimal" step="any" onchange="foodBasisMenge(\'' + b.pid + '\',this.value)">' +
          '<span class="fbu">' + u + "</span>" +
          '<button class="fx" onclick="foodBasisDel(\'' + b.pid + '\')">×</button></div>';
      }).join("") +
      '<div class="fbaddrow"><select id="fb-add">' +
        '<option value="">Posten hinzufügen …</option>' +
        allProducts().map(function (p) { return '<option value="' + p.id + '">' + esc(p.n) + "</option>"; }).join("") +
      '</select><button class="fbtn2" onclick="foodBasisAdd()">OK</button></div>' +
      (chkCount ? '<div class="fhint">' + chkCount + " Posten der Basis stehen mit geschätzten Werten. Auf das <strong>?</strong> tippen, Etikettenwerte eintragen – die Korrektur gilt danach dauerhaft.</div>" : "") +
      "</div>";
  }

  var basis = '<div class="fsec">' +
    '<div class="fsub">Fixbasis · ' + n0(basisSum.kcal) + " kcal · " + n0(basisSum.p) + " g Protein</div>" +
    '<div class="frow2">' +
      '<button class="fbtn2 prim" onclick="foodBasis()">Fixbasis eintragen</button>' +
      '<button class="fbtn2 ghost" onclick="foodBasisToggle()">' + (fBasisOpen ? "Fertig" : "Anpassen") + "</button>" +
    "</div>" + basisBody + "</div>";

  /* Ziel */
  var isNeu = g.kcal === GOAL_NEU.kcal;
  var ziel = '<div class="fsec"><div class="fsub">Tagesziel</div>' +
    '<div class="fgoal">' + n0(g.kcal) + " kcal · " + n0(g.kh) + " g KH · " + n0(g.f) + " g Fett · " + n0(g.p) + " g Protein</div>" +
    '<div class="frow2">' +
      '<button class="fbtn2' + (isNeu ? "" : " prim") + '" onclick="foodGoalSet(\'alt\')">2.775 kcal</button>' +
      '<button class="fbtn2' + (isNeu ? " prim" : "") + '" onclick="foodGoalSet(\'neu\')">3.000 kcal</button>' +
      '<button class="fbtn2 ghost" onclick="foodGoalEdit()">Frei</button>' +
    "</div>" +
    '<div class="fhint">Seit dem 06.09. steht das Ziel auf <strong>3.000 kcal</strong>: +225 kcal gegenüber 2.775, vollständig als +55 g KH (350 → 405). Fett und Protein bleiben unverändert. Grundlage ist der Hauswaage-Trend von +0,05 kg/Woche gegen ein Ziel von 0,2 – nicht die InBody-Zahl. Nächste Bewertung nach drei sauberen Wochen ab dem 10.09.' +
    (c.goalSince ? " Zuletzt gesetzt am " + fmtDate(c.goalSince) + "." : "") + "</div></div>";

  /* Neues Produkt */
  var neu = "";
  if (fNewOpen) {
    neu = '<div class="fnewbox">' +
      '<input type="text" id="fn-name" placeholder="Produktname (z. B. Hummus Edeka)">' +
      '<div class="fnrow"><select id="fn-ref">' +
        '<option value="100g">Werte je 100 g</option>' +
        '<option value="100ml">Werte je 100 ml</option>' +
        '<option value="1">Werte je Stück / Portion</option>' +
      '</select><input type="text" id="fn-unit" placeholder="Einheit (Stück, Scheibe, EL …)"></div>' +
      '<div class="fnrow4">' +
        '<div><label>kcal</label><input type="number" id="fn-kcal" inputmode="decimal" step="any"></div>' +
        '<div><label>KH g</label><input type="number" id="fn-kh" inputmode="decimal" step="any"></div>' +
        '<div><label>Fett g</label><input type="number" id="fn-f" inputmode="decimal" step="any"></div>' +
        '<div><label>Prot. g</label><input type="number" id="fn-p" inputmode="decimal" step="any"></div>' +
      "</div>" +
      '<button class="fbtn2 prim" onclick="foodNewSave()">Produkt speichern</button>' +
      '<div class="fhint">Bleibt dauerhaft in der Liste. Für einmalige Sachen – Restaurant, Einladung – reicht ein Eintrag mit geschätzten Werten; er ist nachträglich löschbar.</div>' +
      "</div>";
  }

  var picker = '<div class="fsec"><div class="fsub">Hinzufügen</div>' +
    '<input type="text" class="fsearch" placeholder="Suchen … (z. B. Ei, Brot, Tofu)" value="' + esc(fSearch) + '" oninput="foodSearch(this.value)">' +
    '<div id="f-picker"></div>' +
    '<button class="fbtn2 ghost" style="width:100%;margin-top:10px" onclick="foodNewToggle()">' + (fNewOpen ? "Abbrechen" : "+ Eigenes Produkt") + "</button>" +
    neu + "</div>";

  cont.innerHTML = '<div class="fbars">' + bars + "</div>" + pensum + liste + mahlzeiten + basis + picker + ziel +
    '<div class="fnote">Die Zahlen sind ein Steuerungsinstrument, kein Selbstzweck: Ausschlaggebend bleibt der Gewichtstrend im Werte-Tab. Das Tracking beantwortet die Frage, <strong>warum</strong> der Trend liegt, wie er liegt – vor allem, ob der Abend die strukturelle Lücke ist.<br><br>Ballaststoffe sind bewusst nicht enthalten: für zu viele Produkte fehlt der Etikettenwert.</div>';

  renderPicker();
};

/* ─── CSS ───────────────────────────────────────────────── */
var CSS = [
".fbars { display:flex; gap:6px; padding:22px 20px 0; }",
".fbar { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 8px; text-align:center; }",
".fbl { font-size:9px; font-weight:700; letter-spacing:1px; color:var(--muted); }",
".fbv { font-family:var(--fd); font-size:22px; line-height:1.1; color:var(--text); margin-top:2px; }",
".fbv.tight { color:#B87A15; } .fbv.over { color:#B33A3A; }",
".fbg { font-family:var(--fb); font-size:10px; font-weight:600; color:var(--dim); letter-spacing:0; }",
".fbtrack { height:4px; border-radius:2px; background:var(--bg); margin-top:6px; overflow:hidden; }",
".fbfill { height:100%; background:var(--text); transition:width .25s; }",
".fbfill.tight { background:#E8A33D; } .fbfill.over { background:#D96A6A; }",
".fpensum { margin:14px 20px 0; padding:14px 16px; border-radius:12px; border:1.5px solid var(--text); background:var(--surface); }",
".fpensum.tight { border-color:#E8A33D; background:#FDF3E4; }",
".fpensum.over { border-color:#D96A6A; background:#FBE9E9; }",
".fph { font-size:10px; font-weight:700; letter-spacing:1.5px; color:var(--muted); margin-bottom:10px; }",
".fpgrid { display:flex; gap:6px; }",
".fpgrid > div { flex:1; text-align:center; }",
".fpn2 { font-family:var(--fd); font-size:27px; line-height:1; color:var(--text); }",
".fpl { font-size:9px; color:var(--muted); font-weight:600; letter-spacing:.5px; margin-top:3px; }",
".fpline { font-size:12px; color:var(--muted); line-height:1.6; margin-top:12px; }",
".fpline strong { color:var(--text); font-weight:700; }",
".fphint { margin:14px 20px 0; padding:13px 16px; border:1px dashed var(--border); border-radius:12px; font-size:12.5px; color:var(--muted); line-height:1.6; }",
".fphint strong { color:var(--text); }",
".fsec { margin:12px 20px; padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:12px; }",
".fsub { font-size:11px; font-weight:700; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:10px; }",
".fitem { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); }",
".fitem:last-of-type { border-bottom:none; }",
".fin { flex:1; min-width:0; }",
".fitn { font-size:13.5px; font-weight:600; color:var(--text); }",
".fitm { font-size:11px; color:var(--muted); margin-top:2px; }",
".fx { background:none; border:none; color:var(--dim); font-size:19px; cursor:pointer; padding:0 3px; line-height:1; flex-shrink:0; }",
".frow2 { display:flex; gap:8px; margin-top:12px; }",
".fbtn2 { flex:1; padding:12px 8px; border-radius:10px; border:2px solid var(--border); background:transparent; font-family:var(--fb); font-weight:700; font-size:12.5px; color:var(--muted); cursor:pointer; }",
".fbtn2.prim { background:var(--text); border-color:var(--text); color:#FFF; }",
".fbtn2.ghost { font-weight:600; }",
".fgoal { font-size:13.5px; font-weight:600; color:var(--text); }",
".fhint { font-size:11.5px; color:var(--muted); line-height:1.6; margin-top:10px; }",
".fhint strong { color:var(--text); font-weight:700; }",
".fsearch { margin-bottom:12px !important; }",
".fgrp { font-family:var(--fd); font-size:12px; letter-spacing:2px; color:var(--dim); margin:12px 0 4px; }",
".fprow { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border); cursor:pointer; }",
".fprow.open { border-bottom:none; }",
".fpn { flex:1; font-size:13.5px; font-weight:600; color:var(--text); min-width:0; }",
".fpm { font-size:11px; color:var(--muted); flex-shrink:0; }",
".fpc { font-size:17px; color:var(--dim); width:14px; text-align:center; flex-shrink:0; }",
".fchk { display:inline-block; width:14px; height:14px; line-height:14px; text-align:center; border-radius:50%; background:#FDF3E4; color:#B87A15; font-size:10px; font-weight:700; }",
".fpbody { padding:4px 0 12px; border-bottom:1px solid var(--border); }",
".fqrow { display:flex; align-items:center; gap:6px; }",
".fqb { width:36px; height:40px; border-radius:8px; border:1.5px solid var(--border); background:transparent; font-size:18px; font-weight:700; color:var(--muted); cursor:pointer; flex-shrink:0; }",
".fqi { width:64px !important; margin-bottom:0 !important; text-align:center; padding:11px 4px !important; flex-shrink:0; }",
".fqu { font-size:12px; color:var(--muted); font-weight:600; width:34px; flex-shrink:0; }",
".fqadd { flex:1; padding:12px 6px; border-radius:8px; border:none; background:var(--text); color:#FFF; font-family:var(--fb); font-weight:700; font-size:12.5px; cursor:pointer; }",
".fpmacro { font-size:11px; color:var(--muted); margin-top:8px; }",
".fowndel { background:none; border:none; color:#B33A3A; font-size:11px; font-weight:700; cursor:pointer; padding:0 0 0 6px; }",
".frez { display:flex; align-items:center; gap:10px; padding:11px 0; border-bottom:1px solid var(--border); cursor:pointer; }",
".frez:last-of-type { border-bottom:none; }",
".frezn { flex:1; font-size:13.5px; font-weight:600; color:var(--text); min-width:0; }",
".frezm { font-size:11px; color:var(--muted); flex-shrink:0; }",
".frezc { font-size:17px; color:var(--dim); width:14px; text-align:center; flex-shrink:0; }",
".frez.passt .frezm { color:#2A7A2A; font-weight:600; }",
".frez.eng { opacity:.5; }",
".frez.eng .frezm { color:#B33A3A; }",
".fchk { cursor:pointer; }",
".fbasisbody { margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }",
".fbrow { display:flex; align-items:center; gap:8px; padding:6px 0; }",
".fbrow.off { opacity:.42; }",
".fbtog { width:26px; height:26px; border-radius:7px; border:1.5px solid var(--border); background:transparent; font-size:13px; font-weight:700; color:var(--text); cursor:pointer; flex-shrink:0; }",
".fbrow:not(.off) .fbtog { border-color:var(--text); }",
".fbn { flex:1; font-size:12.5px; font-weight:600; min-width:0; }",
".fbi { width:62px !important; margin-bottom:0 !important; text-align:center; padding:9px 4px !important; font-size:13px !important; flex-shrink:0; }",
".fbu { font-size:11px; color:var(--muted); width:30px; flex-shrink:0; }",
".fbaddrow { display:flex; gap:8px; align-items:center; margin-top:10px; }",
".fbaddrow select { margin-bottom:0 !important; flex:1; font-size:13px !important; padding:11px 12px !important; }",
".fbaddrow .fbtn2 { flex:0 0 60px; }",
".fnewbox { margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }",
".fnrow { display:flex; gap:8px; }",
".fnrow > * { flex:1; }",
".fnrow4 { display:flex; gap:6px; margin-bottom:12px; }",
".fnrow4 > div { flex:1; }",
".fnrow4 label { display:block; font-size:9px; color:var(--dim); font-weight:600; letter-spacing:.5px; text-align:center; margin-bottom:3px; }",
".fnrow4 input { margin-bottom:0 !important; text-align:center; padding:11px 2px !important; font-size:14px !important; }",
".fnote { margin:12px 20px 20px; padding:12px 14px; background:var(--surface); border:1px solid var(--border); border-radius:10px; font-size:11.5px; color:var(--muted); line-height:1.65; }",
".fnote strong { color:var(--text); font-weight:700; }",
".fdate { display:flex; align-items:center; gap:12px; margin:22px 20px 0; }",
".fdate label { font-size:10px; color:var(--muted); font-weight:600; letter-spacing:1px; text-transform:uppercase; flex-shrink:0; }",
".fdate input { flex:1; margin-bottom:0; }",
".bnav .nbtn { font-size:10px; padding:11px 0; letter-spacing:-0.3px; }"
].join("\n");

var MARKUP =
  '<div class="fdate"><label for="f-day">Datum</label>' +
  '<input type="date" id="f-day" onchange="buildFood()"></div>' +
  '<div id="f-cont"></div>';

/* ─── Init ──────────────────────────────────────────────── */
function init() {
  var app = document.getElementById("app");
  if (!app || document.getElementById("view-food")) return;

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  var view = document.createElement("div");
  view.id = "view-food";
  view.className = "view";
  view.innerHTML = MARKUP;
  var wv = document.getElementById("view-weight");
  if (wv && wv.parentNode === app) app.insertBefore(view, wv.nextSibling);
  else app.appendChild(view);

  document.getElementById("f-day").value = todayStr();
  fDate = todayStr();

  /* Basis-Migration. Greift nur, wenn tl-fg schon existiert und
     auf einer älteren Fassung steht – bei einer frischen
     Installation liefert cfg() ohnehin BASIS_DEF. */
  try {
    var raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      var c0 = cfg(), dirty = false;

      /* Additiv statt Reset: neue Standardposten werden ergänzt,
         eigene Mengen und Schalter bleiben stehen. Ein voller
         Reset hätte jede händisch angepasste Menge verworfen. */
      if (c0.basisV !== BASIS_V) {
        var have = {};
        (c0.basis || []).forEach(function (b) { have[b.pid] = true; });
        BASIS_DEF.forEach(function (b) {
          if (!have[b.pid]) c0.basis.push({ pid:b.pid, menge:b.menge, on:b.on });
        });
        c0.basisV = BASIS_V;
        dirty = true;
      }

      /* Einmalige Zielumstellung auf 3.000 kcal, datiert. */
      if (c0.goalV !== GOAL_V) {
        c0.goal = { kcal:GOAL_NEU.kcal, kh:GOAL_NEU.kh, f:GOAL_NEU.f, p:GOAL_NEU.p };
        c0.goalSince = todayStr();
        c0.goalV = GOAL_V;
        dirty = true;
      }

      if (dirty) saveCfg(c0);
    } else {
      var c1 = cfg();
      c1.basisV = BASIS_V;
      c1.goal   = { kcal:GOAL_NEU.kcal, kh:GOAL_NEU.kh, f:GOAL_NEU.f, p:GOAL_NEU.p };
      c1.goalSince = todayStr();
      c1.goalV  = GOAL_V;
      saveCfg(c1);
    }
  } catch (e) { /* unkritisch */ }

  // Nav-Knopf vor "Plan" einhängen
  var nav = document.querySelector(".bnav");
  var planBtn = document.getElementById("nav-plan");
  if (nav && !document.getElementById("nav-food")) {
    var b = document.createElement("button");
    b.className = "nbtn";
    b.id = "nav-food";
    b.textContent = "Essen";
    b.onclick = function () { showView("food"); };
    if (planBtn) nav.insertBefore(b, planBtn); else nav.appendChild(b);
  }

  /* showView erweitern. Die Fassung in index.html kennt nur ihre
     fünf Views und schaltet bei "food" schlicht alle ab – genau
     das ist hier erwünscht. Danach den eigenen Tab setzen. */
  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      origShow(v);
      var fv = document.getElementById("view-food");
      var fn = document.getElementById("nav-food");
      if (fv) fv.classList.toggle("active", v === "food");
      if (fn) fn.classList.toggle("active", v === "food");
      if (v === "food") buildFood();
    };
  }

  buildFood();

  /* Datumswechsel über Nacht – gleiche Logik wie in daily.js:
     nur weiterstellen, wenn das Feld unverändert auf gestern steht. */
  var lastToday = todayStr();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    var now = todayStr();
    if (now !== lastToday) {
      var el = document.getElementById("f-day");
      if (el && el.value === lastToday) el.value = now;
      lastToday = now;
    }
    var fv = document.getElementById("view-food");
    if (fv && fv.classList.contains("active")) buildFood();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
