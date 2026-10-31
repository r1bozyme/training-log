/* ═══════════════════════════════════════════════════
   vorrat-core.js – Rechenkern für Vorrat & Einkauf (31.10.2026)

   Reine Rechnung ohne DOM. Läuft in der App (window.tlVorratCore)
   und im Erinnerungsdienst (training-log-data/push, require) –
   dieselbe Datei, damit Freitags-Liste und App nie auseinanderlaufen.
   Bei Änderungen beide Kopien aktualisieren (App-Repo ist führend).

   MODELL
     tl-v = { v:1, items: { pid: { packs, ts, hide, pack, lbl, src, n } }, extra:[pid] }
       packs  Bestand in Packungen zum Zeitpunkt ts (ms)
       ts     Zeitpunkt der letzten Bestandsangabe (Inventur, +1, Korrektur)
     Rest jetzt = packs × Packungsinhalt − Verbrauch seit ts.
     Verbrauch = Tracker-Posten (tl-f) mit id > ts und Datum ≥ Tag von ts.
     Die Posten-IDs sind Zeitstempel (Date.now) – so zählt ein Posten,
     der vor der Inventur erfasst wurde, nicht doppelt.

   TAGESBEDARF
     Mittel der letzten 14 Tage über die Tage, an denen überhaupt etwas
     erfasst ist (mind. 3), mindestens aber die eingeschaltete Fixbasis-Menge
     und ggf. ein Mindestwert (Glycin 7,5 g/Tag). Cappuccino zählt als
     155 ml Hafermilch. Creatin läuft nicht über den Tracker: fest 5 g/Tag.

   EINKAUF (Aldi, samstags)
     Nächster Einkauf = heute, wenn Samstag, sonst der kommende Samstag.
     Gekauft wird, was bis zum Samstag danach plus 1 Tag Puffer fehlt.
   BESTELLEN (online)
     Sobald der Rest ≤ 10 Tage reicht. Vorschlag: Menge für ~30 Tage.
   ═══════════════════════════════════════════════════ */
(function (root) {
"use strict";

var DEF = [
  /* Aldi */
  { pid:"skyr",    pack:500,  lbl:"Becher",  src:"aldi" },
  { pid:"bquark",  pack:250,  lbl:"Becher",  src:"aldi" },
  { pid:"mbasis",  pack:750,  lbl:"Beutel",  src:"aldi" },
  { pid:"banane",  pack:1,    lbl:"Stück",   src:"aldi" },
  { pid:"heidel",  pack:500,  lbl:"Beutel",  src:"aldi" },
  { pid:"sultan",  pack:250,  lbl:"Packung", src:"aldi" },
  { pid:"walnuss", pack:200,  lbl:"Packung", src:"aldi" },
  { pid:"mandel",  pack:510,  lbl:"Packung", src:"aldi" },
  { pid:"roggen",  pack:9,    lbl:"Brot",    src:"aldi" },
  /* online */
  { pid:"hafermi", pack:1000, lbl:"Liter",   src:"online" },
  { pid:"whey",    pack:76,   lbl:"Dose",    src:"online" },
  { pid:"norsan",  pack:60,   lbl:"Flasche", src:"online" },
  { pid:"glycin",  pack:1000, lbl:"Beutel",  src:"online", min:7.5 },   // 15 g jeden 2. Tag, falls nicht geloggt
  { pid:"creatin", pack:634,  lbl:"Dose",    src:"online", fix:5, n:"Creatin (ON Micronised)", unit:"g" },
  /* Altbestand, bis aufgebraucht */
  { pid:"menergy", pack:1000, lbl:"Beutel",  src:"alt" },
  { pid:"fage02",  pack:500,  lbl:"Becher",  src:"alt" },
  { pid:"quark",   pack:500,  lbl:"Becher",  src:"alt" },
  { pid:"rosinen", pack:500,  lbl:"Packung", src:"alt" },
  { pid:"nuesse",  pack:200,  lbl:"Packung", src:"alt" }
];
/* Posten, die einen anderen Vorratsposten verbrauchen: pid → [[ziel, menge je Einheit]] */
var MAP = { cappu: [["hafermi", 155]] };

var FENSTER = 14, MIN_TAGE = 3, PUFFER = 1, VORLAUF_ONLINE = 10, ORDER_TAGE = 30;

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function diffDays(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }

/* Verbrauch eines Tracker-Postens, aufgeteilt auf Vorratsposten */
function verbrauch(it, out) {
  var m = Number(it.menge) || 0;
  if (!m) return;
  out[it.pid] = (out[it.pid] || 0) + m;
  (MAP[it.pid] || []).forEach(function (x) { out[x[0]] = (out[x[0]] || 0) + m * x[1]; });
}

function defs(state) {
  var st = state || {}, seen = {}, list = [];
  DEF.forEach(function (d) { seen[d.pid] = 1; list.push(d); });
  (st.extra || []).forEach(function (pid) {
    if (!seen[pid]) { seen[pid] = 1; list.push({ pid: pid, pack: 1, lbl: "Packung", src: "aldi" }); }
  });
  return list.map(function (d) {
    var o = (st.items || {})[d.pid] || {}, r = {};
    for (var k in d) r[k] = d[k];
    ["pack", "lbl", "src", "n"].forEach(function (k) { if (o[k] != null && o[k] !== "") r[k] = o[k]; });
    r.pack = Number(r.pack) || 1;
    return r;
  });
}

/* food = tl-f (Datum → Posten), basis = tl-fg.basis, today = "JJJJ-MM-TT" */
function rechne(state, food, basis, today, nowMs) {
  state = state || {}; food = food || {};
  nowMs = nowMs || Date.now();
  var items = state.items || {};

  /* Tagesbedarf aus den letzten FENSTER Tagen (ohne heute) */
  var sum = {}, tage = 0;
  for (var i = 1; i <= FENSTER; i++) {
    var d = addDays(today, -i), arr = food[d];
    if (!arr || !arr.length) continue;
    tage++;
    arr.forEach(function (it) { verbrauch(it, sum); });
  }
  var basisRate = {};
  (basis || []).forEach(function (b) {
    if (!b.on) return;
    verbrauch({ pid: b.pid, menge: b.menge }, basisRate);
  });

  return defs(state).map(function (d) {
    var o = items[d.pid] || {};
    /* Fixbasis (eingeschaltet) als Untergrenze: nach einer Umstellung
       (z. B. Skyr an) gilt die neue Menge sofort, nicht erst nach 14 Tagen. */
    var hist = tage >= MIN_TAGE ? (sum[d.pid] || 0) / tage : 0;
    var rate = d.fix != null ? d.fix : Math.max(hist, basisRate[d.pid] || 0, d.min || 0);
    var r = { pid: d.pid, n: d.n || o.n || null, pack: d.pack, lbl: d.lbl, src: d.src, unit: d.unit || null,
              rate: rate, hide: !!o.hide, erfasst: typeof o.packs === "number" };
    if (!r.erfasst) return r;

    var ts = Number(o.ts) || 0, tsDay = ts ? iso(new Date(ts)) : "0000-00-00", weg = 0;
    if (d.fix != null) {
      weg = d.fix * Math.max(0, (nowMs - ts) / 864e5);
    } else {
      Object.keys(food).forEach(function (day) {
        if (day < tsDay) return;
        (food[day] || []).forEach(function (it) {
          if (!(Number(it.id) > ts)) return;
          var c = {}; verbrauch(it, c);
          weg += c[d.pid] || 0;
        });
      });
    }
    r.rest = Math.max(0, o.packs * d.pack - weg);
    r.restPacks = r.rest / d.pack;
    r.tage = rate > 0 ? r.rest / rate : null;
    return r;
  });
}

function naechsterEinkauf(today) {
  var dow = new Date(today + "T12:00:00").getDay();   // 6 = Samstag
  return addDays(today, (6 - dow + 7) % 7);
}

/* Einkaufsliste: { samstag, aldi:[{…, kaufen}], online:[{…, bestellen, bis}] , offen:[…] } */
function einkauf(liste, today) {
  var sa = naechsterEinkauf(today), bisSa = diffDays(today, sa);
  var aldi = [], online = [], offen = [];
  liste.forEach(function (r) {
    if (r.hide || r.src === "alt") return;
    if (!r.erfasst) { if (r.rate > 0) offen.push(r); return; }
    if (!(r.rate > 0)) return;
    if (r.src === "online") {
      if (r.tage !== null && r.tage <= VORLAUF_ONLINE) {
        var x = Object.assign({}, r);
        x.bestellen = Math.max(1, Math.ceil((r.rate * ORDER_TAGE - r.rest) / r.pack));
        x.leer = addDays(today, Math.floor(r.tage));
        online.push(x);
      }
      return;
    }
    var restSa = r.rest - r.rate * bisSa;
    var fehlt = r.rate * (7 + PUFFER) - restSa;
    if (fehlt > 0.001) {
      var y = Object.assign({}, r);
      y.kaufen = Math.ceil(fehlt / r.pack - 1e-9);
      aldi.push(y);
    }
  });
  return { samstag: sa, aldi: aldi, online: online, offen: offen };
}

var api = { DEF: DEF, MAP: MAP, rechne: rechne, einkauf: einkauf, naechsterEinkauf: naechsterEinkauf, iso: iso, addDays: addDays };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.tlVorratCore = api;
})(typeof window !== "undefined" ? window : this);
