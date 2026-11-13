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

   12.11.2026 – Messungen erfassen: Gewicht, Skelettmuskelmasse (SMM) und
   Körperfett (KFA) je Messung unter "tl-ib" (im Backup, sync.js):
     [{ id, date, kg, smm, kfa, src: "foto"|"hand"|"start", bed }]
   bed = Gesamtstatus des Bereitschaftschecks für den Messtag zum Zeitpunkt
   des Speicherns (ok · offen · fehlt · nein), bei Startbestand leer.
   Eingabe per Foto (Kamera oder Galerie): tlLabel.vision liest die drei
   Werte vom Ergebnisbildschirm, danach immer Bestätigung im Formular –
   mit Warnung, wenn ein Wert stark von der letzten Messung abweicht
   (Ziffern-Verwechsler). Das Foto wird nicht gespeichert. Handeingabe
   geht ohne Schlüssel. Abschnitt „InBody“ unten im Werte-Tab, über der
   Diagnose; am Messtag zusätzlich Knöpfe in der Bereitschaftskarte.
   Startbestand: die drei gültigen Messungen seit dem Serienneustart 20.08.
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

/* ─── Messungen ──────────────────────────────────── */
var MKEY = "tl-ib";
var START = [
  { date: "2026-08-20", kg: 73.7, smm: 36.7, kfa: 13.0 },
  { date: "2026-09-06", kg: 73.5, smm: 36.6, kfa: 13.2 },
  { date: "2026-09-27", kg: 72.8, smm: 36.4, kfa: 12.8 }
];
/* plausibler Bereich je Wert, und ab welcher Abweichung zur letzten Messung gewarnt wird */
var FELD = {
  kg:  { min: 40, max: 160, warn: 2.5, name: "Gewicht", einheit: "kg" },
  smm: { min: 15, max: 60,  warn: 1.2, name: "SMM",     einheit: "kg" },
  kfa: { min: 3,  max: 50,  warn: 2.5, name: "KFA",     einheit: "Punkte" }
};
var PROMPT = [
  "Das Foto zeigt den Ergebnisbildschirm (oder Ausdruck) eines InBody-Körperanalysegeräts, meist deutsch.",
  "Lies drei Werte und rufe das Werkzeug inbody auf:",
  "- gewicht = „Gewicht (kg)“.",
  "- smm = „Skelettmuskelmasse (kg)“ bzw. SMM. NICHT fettfreie Masse, NICHT Weichteil- oder Muskelmasse gesamt.",
  "- kfa = „Körperfett (%)“ bzw. PBF, der Prozentwert. NICHT die Körperfettmasse in kg.",
  "Regeln:",
  "- Lies die große Zahl direkt beim Namen des Werts, nicht die Skala oder den Balken daneben.",
  "- Das Dezimaltrennzeichen kann Punkt oder Komma sein; gib Zahlen mit einer Nachkommastelle zurück.",
  "- Größe, Alter und ID in der Kopfzeile sind keine Messwerte.",
  "- Ist ein Wert verdeckt, unscharf oder gespiegelt und nicht sicher lesbar, setze lesbar = false und rate nicht.",
  "Antworte ausschließlich mit dem Aufruf von inbody, ohne weiteren Text."
].join("\n");
var TOOL = {
  name: "inbody",
  description: "Gewicht, Skelettmuskelmasse und Körperfettanteil vom InBody-Ergebnis",
  input_schema: {
    type: "object",
    properties: {
      lesbar:  { type: "boolean", description: "alle drei Werte sicher gelesen" },
      gewicht: { type: "number", description: "kg" },
      smm:     { type: "number", description: "Skelettmuskelmasse in kg" },
      kfa:     { type: "number", description: "Körperfett in Prozent" },
      hinweis: { type: "string", description: "kurze Anmerkung, falls etwas unsicher ist" }
    },
    required: ["lesbar", "gewicht", "smm", "kfa"]
  }
};

function flash(t) { if (typeof showFlash === "function") showFlash(t); }
function f1(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); }
function sg(n) { n = Math.round(n * 10) / 10; return (n > 0 ? "+" : n < 0 ? "−" : "±") + f1(Math.abs(n)); }
function dmy(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4); }
function mess() { var a = readJSON(MKEY, null); return Array.isArray(a) ? a : []; }
function saveMess(a) {
  a.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
  localStorage.setItem(MKEY, JSON.stringify(a));
}
function seed() {
  if (localStorage.getItem(MKEY) !== null) return;
  var t = Date.now();
  saveMess(START.map(function (m, i) { return { id: t + i, date: m.date, kg: m.kg, smm: m.smm, kfa: m.kfa, src: "start" }; }));
}
function inRange(k, v) { return typeof v === "number" && isFinite(v) && v >= FELD[k].min && v <= FELD[k].max; }
/* letzte Messung vor dem Datum (sonst die jüngste überhaupt) */
function vorher(date, a) {
  var p = null;
  a.forEach(function (x) { if (x.date < date) p = x; });
  return p;
}
function abweichung(m, ref) {
  if (!ref) return [];
  return ["kg", "smm", "kfa"].filter(function (k) {
    return inRange(k, m[k]) && Math.abs(m[k] - ref[k]) > FELD[k].warn;
  }).map(function (k) { return FELD[k].name + " " + sg(m[k] - ref[k]) + " " + FELD[k].einheit; });
}
/* "12.11.2026", "12.11.26", "12.11." (laufendes Jahr) → "2026-11-12" | null */
function parseDatum(s) {
  var m = String(s || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/);
  if (!m) return null;
  var y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
  var d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12);
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
  return iso(d);
}
function bedingung(date) {
  try {
    var dl = (typeof PLAN !== "undefined" && PLAN.deload) ? PLAN.deload : null;
    return check(date, date, readJSON("tl-f", {}), readJSON("tl-d", []), readJSON("tl-e", []), dl).gesamt;
  } catch (e) { return null; }
}

/* Formular: immer der letzte Schritt vor dem Speichern, auch nach dem Foto */
function edit(m, note) {
  if (!root.tlAsk) return Promise.resolve();
  var a = mess(), ref = vorher(m.date, a) || a[a.length - 1] || null, ab = abweichung(m, ref);
  var text = m.src === "foto" ? "Vom Foto gelesen – bitte mit dem Display vergleichen." : "Werte vom InBody-Ergebnisbildschirm.";
  if (ab.length) text += "\n⚠ Weicht stark von der Messung am " + dm(ref.date) + " ab: " + ab.join(" · ") + ". Ziffern prüfen.";
  if (note) text += "\n" + note;
  var val = function (k) { return typeof m[k] === "number" && isFinite(m[k]) ? m[k] : null; };
  return root.tlAsk.form({
    title: "InBody-Messung", text: text, ok: "Speichern",
    fields: [
      { key: "date", label: "Datum", type: "text", value: dmy(m.date), placeholder: "TT.MM.JJJJ" },
      { key: "kg",  label: "Gewicht", type: "num", suffix: "kg", value: val("kg"), placeholder: "73,4" },
      { key: "smm", label: "Skelettmuskelmasse", type: "num", suffix: "kg", value: val("smm"), placeholder: "36,7" },
      { key: "kfa", label: "Körperfett", type: "num", suffix: "%", value: val("kfa"), placeholder: "13,0" }
    ]
  }).then(function (r) {
    if (!r) return;
    var date = parseDatum(r.date);
    var n = { date: date || m.date, kg: r.kg, smm: r.smm, kfa: r.kfa, src: m.src || "hand" };
    var bad = !date ? "Datum bitte als TT.MM.JJJJ"
            : date > heute() ? "Das Datum liegt in der Zukunft"
            : !inRange("kg", n.kg) || !inRange("smm", n.smm) || !inRange("kfa", n.kfa) ? "Bitte alle drei Werte plausibel eintragen" : "";
    if (bad) { flash(bad); return edit(n, note); }
    var alle = mess(), alt = alle.filter(function (x) { return x.date === n.date; })[0];
    var store = function () {
      var rest = mess().filter(function (x) { return x.date !== n.date; });
      rest.push({ id: Date.now(), date: n.date, kg: Math.round(n.kg * 10) / 10, smm: Math.round(n.smm * 10) / 10,
                  kfa: Math.round(n.kfa * 10) / 10, src: n.src, bed: bedingung(n.date) });
      saveMess(rest);
      renderMess(); render();
      flash("Messung gespeichert ✓");
    };
    if (!alt) return store();
    return root.tlAsk.confirm({
      title: "Ersetzen?",
      text: "Für den " + dmy(n.date) + " gibt es schon eine Messung (" + f1(alt.kg) + " kg · SMM " + f1(alt.smm) + " · KFA " + f1(alt.kfa) + " %).",
      ok: "Ersetzen"
    }).then(function (yes) { if (yes) store(); });
  });
}

/* how: "foto" (Kamera) | "galerie" | "hand" */
root.tlInbodyAdd = function (how) {
  var leer = { date: heute(), src: "hand" };
  var L = root.tlLabel;
  if (how === "hand" || !L || !L.vision || !L.photo) return edit(leer, "");
  return L.key().then(function (k) {
    return k ? L.photo(how === "galerie") : null;
  }).then(function (b64) {
    if (!b64) return null;
    return L.vision({ prompt: PROMPT, image: b64, tool: TOOL, maxTokens: 1000, busy: "InBody-Werte werden gelesen …" }).then(function (x) {
      if (!x) return edit(leer, "Das Foto konnte nicht gelesen werden – Werte bitte von Hand eintragen.");
      var m = { date: heute(), src: "foto", kg: Number(x.gewicht), smm: Number(x.smm), kfa: Number(x.kfa) };
      var ok = x.lesbar !== false && inRange("kg", m.kg) && inRange("smm", m.smm) && inRange("kfa", m.kfa);
      if (!ok) {
        ["kg", "smm", "kfa"].forEach(function (f) { if (!inRange(f, m[f])) m[f] = null; });
        return edit(m, "Nicht alles sicher lesbar – fehlende Werte bitte ergänzen." + (x.hinweis ? " " + String(x.hinweis).slice(0, 120) : ""));
      }
      return edit(m, x.hinweis ? String(x.hinweis).slice(0, 120) : "");
    });
  }).catch(function () { flash("Foto konnte nicht verarbeitet werden"); });
};
root.tlInbodyDel = function (id) {
  var m = mess().filter(function (x) { return x.id === id; })[0];
  if (!m || !root.tlAsk) return;
  root.tlAsk.confirm({ title: "Messung löschen?", text: dmy(m.date) + " · " + f1(m.kg) + " kg · SMM " + f1(m.smm) + " · KFA " + f1(m.kfa) + " %", ok: "Löschen", danger: true })
    .then(function (yes) {
      if (!yes) return;
      saveMess(mess().filter(function (x) { return x.id !== id; }));
      renderMess(); render();
      flash("Gelöscht");
    });
};
root.tlInbodyMess = mess;

function addBtns() {
  return '<div class="ib-btns"><button class="ib-b" onclick="tlInbodyAdd(\'foto\')">📷 Foto</button>' +
    '<button class="ib-b" onclick="tlInbodyAdd(\'galerie\')">Aus Galerie</button>' +
    '<button class="ib-b" onclick="tlInbodyAdd(\'hand\')">Von Hand</button></div>';
}
function werte(m) { return f1(m.kg) + " kg · SMM " + f1(m.smm) + " · KFA " + f1(m.kfa) + " %"; }

/* Verlauf SMM und KFA (13.11.): erscheint ab VERLAUF_AB Messungen, folgt dem
   Zeitraum oben (werte.js). Gefüllte Punkte = Bedingungen ✓ (gut vergleichbar),
   hohle Punkte = ohne bestätigte Bedingungen. Je Größe eine eigene Skala. */
var VERLAUF_AB = 6;
function dn(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function ibLinie(list, key, titel, einheit, farbe, von, bis) {
  var W = 310, H = 74, X0 = 30, X1 = 304, Y0 = 62, Y1 = 10;
  var vals = list.map(function (m) { return m[key]; });
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  var pad = Math.max((hi - lo) * 0.2, key === "smm" ? 0.3 : 0.3);
  lo -= pad; hi += pad;
  var x = function (d) { return X0 + (dn(d) - dn(von)) / Math.max(1, dn(bis) - dn(von)) * (X1 - X0); };
  var y = function (v) { return Y0 - (v - lo) / (hi - lo) * (Y0 - Y1); };
  var s = '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + Y1 + '" y2="' + Y1 + '" stroke="#EEEEEE"/><line x1="' + X0 + '" x2="' + X1 + '" y1="' + Y0 + '" y2="' + Y0 + '" stroke="#EEEEEE"/>' +
    '<text x="' + (X0 - 4) + '" y="' + (Y1 + 3) + '" text-anchor="end" font-size="9" fill="#8A8A8A" font-family="Figtree,sans-serif">' + f1(hi) + '</text>' +
    '<text x="' + (X0 - 4) + '" y="' + (Y0 + 3) + '" text-anchor="end" font-size="9" fill="#8A8A8A" font-family="Figtree,sans-serif">' + f1(lo) + '</text>' +
    '<polyline points="' + list.map(function (m) { return x(m.date).toFixed(1) + "," + y(m[key]).toFixed(1); }).join(" ") + '" fill="none" stroke="' + farbe + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    list.map(function (m) {
      var ok = m.bed === "ok";
      return '<circle cx="' + x(m.date).toFixed(1) + '" cy="' + y(m[key]).toFixed(1) + '" r="3.5" fill="' + (ok ? farbe : "#FFFFFF") + '" stroke="' + farbe + '" stroke-width="1.5"/>';
    }).join("");
  var scrub = typeof window.scrubAttr === "function" ? window.scrubAttr(list.map(function (m) {
    return { x: x(m.date), y: [y(m[key])], c: [farbe], v: titel + " " + f1(m[key]) + " " + einheit, t: dmy(m.date) + (m.bed === "ok" ? " · Bedingungen ✓" : "") };
  })) : "";
  return '<div class="ib-vt">' + titel + ' <span>' + einheit + '</span></div><svg class="wt-chart" style="margin-top:2px" viewBox="0 0 ' + W + ' ' + H + '"' + scrub + '>' + s + '</svg>';
}
function ibVerlauf(a, W) {
  if (a.length < VERLAUF_AB) return "";
  var t = heute(), tage = W.range();
  var von = tage ? addDays(t, -(tage - 1)) : a[0].date;
  var list = a.filter(function (m) { return m.date >= von; });
  if (list.length < 2) return '<div class="dhint">Im gewählten Zeitraum liegen weniger als zwei Messungen – für den Verlauf 3M oder Alles wählen.</div>';
  if (list[0].date > von) von = list[0].date;
  return '<div style="margin-top:12px">' + ibLinie(list, "smm", "Muskelmasse SMM", "kg", "#1A1A1A", von, t) + ibLinie(list, "kfa", "Körperfett", "%", "#B87A15", von, t) +
    '<div class="wt-leg" style="margin-top:4px"><span>● Bedingungen ✓</span><span>○ ohne Bestätigung</span><span>' + dm(von) + "–" + dm(t) + '</span></div></div>';
}

/* 13.11.: Im Werte-Tab mit Kartenplatz (daily.js, werte.js) als Karte in der
   Gruppe Energiebilanz – sonst wie bisher als eigener Abschnitt unten. */
function renderKarte(box, slot) {
  var W = window.tlWerte, S = typeof window.tlWerteState === "function" ? window.tlWerteState() : {};
  if (box.parentNode !== slot) slot.appendChild(box);
  var a = mess(), last = a[a.length - 1], prev = a[a.length - 2];
  if (S.focus && !W.isShown("inbody")) {
    box.innerHTML = '<div class="wt-mini" onclick="tlWerte.show(\'inbody\')"><div class="wt-lbl">InBody</div><div class="wt-mv">' +
      (last ? "SMM " + f1(last.smm) + " · KFA " + f1(last.kfa) + " %" : "–") + '</div><span>▸</span></div>';
    return;
  }
  var h = '<div class="wt-card"><div class="wt-hd"><div class="wt-lbl">InBody</div><div class="wt-k">';
  if (last) {
    h += '<span class="wt-ks">SMM</span><span class="wt-kv">' + f1(last.smm) + '</span>' +
         '<span class="wt-ks">KFA</span><span class="wt-kv">' + f1(last.kfa) + '</span>' +
         '<div class="wt-sub">kg · % · Messung ' + dmy(last.date) + ' · ' + f1(last.kg) + ' kg</div>';
  } else {
    h += '<span class="wt-kv">–</span><div class="wt-sub">noch keine Messung</div>';
  }
  h += '</div></div>';
  if (prev) h += '<div class="wt-today"><div class="wt-tl">Seit ' + dm(prev.date) + '</div><div class="wt-tv">SMM ' + sg(last.smm - prev.smm) +
    ' kg · KFA ' + sg(last.kfa - prev.kfa) + ' Pkt</div></div>';
  h += ibVerlauf(a, W);
  h += '<div class="wt-in">' + addBtns() + '</div>';
  var open = W.isMore("inbody");
  h += '<button type="button" class="wt-more' + (open ? " open" : "") + '" onclick="tlWerte.more(\'inbody\')">Messungen &amp; Hinweis<span>' + (open ? "▾" : "▸") + '</span></button>';
  if (open) {
    if (a.length) {
      h += '<div class="ib-list">' + a.slice().reverse().map(function (m) {
        var tag = m.bed === "ok" ? '<span class="ib-tag ib-ok">Bedingungen ✓</span>' : m.bed === "nein" ? '<span class="ib-tag ib-nein">Bedingungen ✕</span>' : "";
        return '<div class="ib-row"><div class="ib-rd">' + dmy(m.date) + '</div><div class="ib-rv">' + werte(m) + tag +
          '</div><button class="ib-del" aria-label="Messung löschen" onclick="tlInbodyDel(' + m.id + ')">×</button></div>';
      }).join("") + "</div>";
    }
    h += '<div class="dhint">Das Foto wird nur zum Auslesen an Claude geschickt und nicht gespeichert. Unterschiede bis etwa ±0,3 kg SMM liegen im Messrauschen des Geräts.</div>';
  }
  box.innerHTML = S.focus && W.isShown("inbody") ? W.foldable(h + '</div>', "inbody") : h + '</div>';
}

function renderMess() {
  var box = document.getElementById("ib-mess"); if (!box) return;
  var slot = document.getElementById("wt-ibsec");
  if (slot && window.tlWerte) { renderKarte(box, slot); return; }
  var wv = document.getElementById("view-weight"), dg = document.getElementById("dg-cont");
  /* bleibt direkt über der Diagnose, auch wenn andere Module danach noch etwas anhängen */
  if (wv && dg && dg.parentNode === wv && dg.previousElementSibling !== box) wv.insertBefore(box, dg);
  var a = mess(), last = a[a.length - 1], prev = a[a.length - 2];
  var h = '<div class="dhead"><div class="dhl">INBODY</div><div class="dhline"></div></div><div class="fsec ib-m">';
  if (last) {
    h += '<div class="fsub">Letzte Messung · ' + dmy(last.date) + "</div>" +
      '<div class="ib-big"><div><b>' + f1(last.kg) + "</b><span>kg Gewicht</span></div><div><b>" + f1(last.smm) +
      "</b><span>kg Muskel (SMM)</span></div><div><b>" + f1(last.kfa) + "</b><span>% Körperfett</span></div></div>";
    if (prev) h += '<div class="ib-x">Seit ' + dm(prev.date) + ": " + sg(last.kg - prev.kg) + " kg · SMM " + sg(last.smm - prev.smm) +
      " kg · KFA " + sg(last.kfa - prev.kfa) + " Punkte</div>";
  } else {
    h += '<div class="ib-x">Noch keine Messung erfasst.</div>';
  }
  h += addBtns();
  if (a.length) {
    h += '<div class="ib-list">' + a.slice().reverse().map(function (m) {
      var tag = m.bed === "ok" ? '<span class="ib-tag ib-ok">Bedingungen ✓</span>' : m.bed === "nein" ? '<span class="ib-tag ib-nein">Bedingungen ✕</span>' : "";
      return '<div class="ib-row"><div class="ib-rd">' + dmy(m.date) + '</div><div class="ib-rv">' + werte(m) + tag +
        '</div><button class="ib-del" aria-label="Messung löschen" onclick="tlInbodyDel(' + m.id + ')">×</button></div>';
    }).join("") + "</div>";
  }
  h += '<div class="fhint">Das Foto wird nur zum Auslesen an Claude geschickt und nicht gespeichert. Unterschiede bis etwa ±0,3 kg SMM liegen im Messrauschen des Geräts.</div></div>';
  box.innerHTML = h;
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
    messHeute(r.termin, d) +
    '<div class="fhint">Am Morgen: 07:00, nüchtern, vor dem Trinken, nach dem Toilettengang · altes Studio, gleiches Gerät. ' +
    "Kriterien seit 07.08.: Messungen, die sie verfehlen, werden verworfen.</div></div>";
}

/* Messtag: Werte erfassen oder das Ergebnis zeigen */
function messHeute(termin, d) {
  if (d !== 0) return "";
  var m = mess().filter(function (x) { return x.date === termin; })[0];
  if (m) return '<div class="ib-done">Messung erfasst: <b>' + werte(m) + "</b></div>";
  return '<div class="ib-add"><div class="ib-k">Messung erfassen</div>' + addBtns() + "</div>";
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
  ".ib-vt { font-size:11px; font-weight:700; color:var(--muted); margin-top:8px; } .ib-vt span { font-weight:600; color:var(--dim); }",
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
  ".ib-b.on.no { border-color:#E8B4AC; background:#FBE9E7; color:#A33A2A; }",
  /* Messungen */
  ".ib-m { margin-top:0; }",
  ".ib-big { display:flex; gap:8px; margin-bottom:8px; }",
  ".ib-big > div { flex:1; min-width:0; }",
  ".ib-big b { display:block; font-family:var(--fd); font-size:30px; letter-spacing:1px; line-height:1.1; color:var(--text); font-weight:400; font-variant-numeric:tabular-nums; }",
  ".ib-big span { display:block; font-size:11px; color:var(--muted); line-height:1.3; margin-top:2px; }",
  ".ib-list { margin-top:14px; border-top:1px solid var(--border); }",
  ".ib-row { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); }",
  ".ib-rd { flex:0 0 78px; font-size:12.5px; font-weight:600; color:var(--muted); font-variant-numeric:tabular-nums; }",
  ".ib-rv { flex:1; min-width:0; font-size:13px; font-weight:600; color:var(--text); font-variant-numeric:tabular-nums; }",
  ".ib-tag { display:block; font-size:11px; font-weight:600; margin-top:2px; }",
  ".ib-tag.ib-ok { color:var(--go); } .ib-tag.ib-nein { color:#A33A2A; }",
  ".ib-del { flex:0 0 32px; height:32px; border-radius:8px; border:1px solid var(--border); background:transparent; color:var(--muted); font-size:16px; line-height:1; }",
  ".ib-add { padding:10px 0 2px; border-top:1px solid var(--border); }",
  ".ib-done { padding:10px 0 2px; border-top:1px solid var(--border); font-size:13px; color:var(--muted); }",
  ".ib-done b { color:var(--text); font-variant-numeric:tabular-nums; }"
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
  /* Messungen: eigener Abschnitt unten, über der Diagnose */
  seed();
  var mb = document.createElement("div"); mb.id = "ib-mess";
  var dg = document.getElementById("dg-cont");
  if (dg && dg.parentNode === wv) wv.insertBefore(mb, dg); else wv.appendChild(mb);
  document.addEventListener("tl:view", function (e) { if (e.detail.view === "weight") { render(); renderMess(); } });
  document.addEventListener("tl:werte", renderMess);   // Werte-Tab neu gezeichnet (daily.js)
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { render(); renderMess(); } });
  render();
  renderMess();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})(typeof window !== "undefined" ? window : this);
