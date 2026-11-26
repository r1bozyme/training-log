/* ═══════════════════════════════════════════════════
   frueh.js – Karte „Frühindikator“ in Körper › Tracker (26.11.2026)

   Frage: Ist das Kalorienziel ein Überschuss? Frühes Signal aus der Nacht
   nach der Zufuhr: mittlerer Nachtpuls (hrAvg) und Temperaturabweichung
   (temp) aus oura/data.json, gegen die erfasste Zufuhr des Vortags.

   Rechnet genau wie Abschnitt 6 in training-log-data/review/auswertung.js
   (dort führend – Änderungen an der Logik in beiden Dateien):
   - Paar = Zufuhr am Tag D → Nacht, aus der man am Tag D+1 aufwacht
     (Oura-Tag = Tag des Aufwachens).
   - Gewertet nur, wenn D sauber ist (abgeschlossen, nicht geschätzt, keine
     Reise, > 800 kcal), der Aufwachtag keine Reise ist und die Nacht keine
     Ausnahme hat (tl-d.aus am Aufwachtag, gesetzt in der Heute-Box unter
     „Letzte Nacht“: alk/spaet = diese Nacht, krank = diese und die
     folgende, impf = diese und die drei folgenden).
   - Training abends (letzter Log-Eintrag des Tages D ab 17 Uhr) wird
     getrennt ausgewiesen, weil es den Nachtpuls hebt.
   - Zielphase = Kalorienziel am Tag D (Ziel-Historie, tracker.js).

   Zwei Teile:
   1. Beschreibend (sofort): Verlauf Ø Nachtpuls und Temperatur mit den
      Zielphasen als Hintergrund, Zahlen je Phase, ausgeschlossene Nächte.
   2. Bewertung nach der vorab festgelegten Regel (25.11.) – erst ab
      BEWERTUNG_AB sichtbar, damit vorher nicht auf einzelne Ausschläge
      reagiert wird. Signal, wenn der Ø Nachtpuls der aktuellen Phase
      ≥ 2 Schläge über der Vergleichsphase liegt, die Temperatur dabei
      < +0,3 °C bleibt und der Waagentrend steigt (gewicht.js). Beide
      Phasen brauchen ≥ MIN_N gewertete Nächte; Vergleichsphase = die
      jüngere frühere Phase, die das erfüllt.
   Korridor (26.11.): Temperaturlinie +0,3 °C sofort; im Pulsgraphen ab
   BEWERTUNG_AB Normalband (Ø ± 1 SD der Vergleichsphase, getönt wie der
   Gewichtskorridor) und gestrichelte Schwelle Ø + 2.

   Eingebunden über oura.js (render ruft tlFrueh.card). Liest tl-d, tl-f,
   tl-e und die Ziel-Historie; schreibt nichts außer dem Aufklappzustand
   (tlui-werte, Zweig ou.fr – nicht im Backup).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var BEWERTUNG_AB = "2027-01-15";   // Prüfung Mitte Januar (entschieden 25.11.)
var OURA0 = "2026-11-06";          // erste Nacht mit hrAvg/temp
var MIN_N = 21;                    // ~3 Wochen gewertete Nächte je Phase
var MIN_DESC = 7;                  // Δ je Phase erst ab so vielen Nächten zeigen
var C_AVG = "var(--text)", C_PT = "var(--ch-lbl)";

function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function J(k, fb) { try { var v = JSON.parse(ls(k)); return v == null ? fb : v; } catch (e) { return fb; } }
function num(v) { return typeof v === "number" && !isNaN(v); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function localDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return localDate(d); }
function dnum(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function dm(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }
function f1(x) { return x.toFixed(1).replace(".", ","); }
function sgn(x, dec) { return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dec).replace(".", ","); }
function kc(x) { return Math.round(x).toLocaleString("de-DE"); }
function today() { return typeof window.todayStr === "function" ? window.todayStr() : localDate(new Date()); }

function kcalDay(it) {
  return (it || []).reduce(function (s, x) { return s + (+x.kcal || 0) * (+x.menge || 0) / (+x.ref || 1); }, 0);
}
function goalAt(d) {
  var g = typeof window.loadFoodGoalAt === "function" ? window.loadFoodGoalAt(d) : null;
  return g && num(+g.kcal) ? +g.kcal : null;
}
function avg(arr, fn) {
  var v = arr.map(fn).filter(num);
  return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null;
}

/* ─── Nächte (wie auswertung.js, Abschnitt 6) ─────── */
function nights(ou) {
  var food = J("tl-f", {}), flag = {}, aus = {}, trainH = {};
  J("tl-d", []).forEach(function (d) { if (d && d.date) flag[d.date] = d; });
  Object.keys(flag).sort().forEach(function (d) {
    var a = flag[d].aus; if (!a) return;
    var n = a === "impf" ? 3 : a === "krank" ? 1 : 0;
    for (var i = 0; i <= n; i++) { var x = addDays(d, i); if (!aus[x]) aus[x] = a; }
  });
  J("tl-e", []).forEach(function (e) {
    if (!e || !e.date) return;
    var h = +new Date(+e.id).toLocaleString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false });
    if (!isNaN(h)) trainH[e.date] = Math.max(trainH[e.date] || 0, h);
  });
  var clean = function (d) { var f = flag[d] || {}; return !!(f.kcal && !f.est && !f.trip && kcalDay(food[d]) > 800); };
  var out = [];
  Object.keys(ou || {}).sort().forEach(function (w) {
    var o = ou[w];
    if (w < OURA0 || !o || !num(o.hrAvg)) return;
    var d = addDays(w, -1), why = "";
    if (!clean(d)) {
      var f = flag[d] || {};
      why = !(food[d] || []).length ? "nicht erfasst" : f.trip ? "Reise" : f.est ? "geschätzt" : "nicht abgeschlossen";
    } else if ((flag[w] || {}).trip) why = "Reise";
    else if (aus[w]) why = "Ausnahme";
    out.push({ w: w, d: d, kcal: kcalDay(food[d]), goal: goalAt(d), hr: o.hrAvg, rhr: o.rhr, temp: num(o.temp) ? o.temp : null,
               abends: trainH[d] != null && trainH[d] >= 17, ok: !why, why: why });
  });
  return out;
}

/* Zielphasen in zeitlicher Folge (ein Ziel kann zweimal vorkommen) */
function phases(ns) {
  var ph = [];
  ns.forEach(function (n) {
    var p = ph[ph.length - 1];
    if (!p || p.goal !== n.goal) { p = { goal: n.goal, von: n.d, bis: n.d, all: [], ok: [] }; ph.push(p); }
    p.bis = n.d; p.all.push(n); if (n.ok) p.ok.push(n);
  });
  return ph;
}

/* ─── Diagramm ────────────────────────────────── */
/* Punkte = Nächte (gefüllt gewertet, hohl nicht gewertet), Linie = Ø der
   gewerteten Nächte in den letzten 7 Nächten derselben Zielphase (ab 3),
   Hintergrund = Zielphasen */
function chart(ns, ph, key, opt) {
  var W = 310, H = 118, X0 = 30, X1 = 304, Y0 = 96, Y1 = 22;
  if (!ns.length) return "";
  var start = ns[0].w, end = ns[ns.length - 1].w, n = Math.max(1, dnum(end) - dnum(start));
  var by = {}; ns.forEach(function (x) { by[x.w] = x; });
  var lo = Infinity, hi = -Infinity, line = [];
  for (var i = 0; i <= n; i++) {
    var w = addDays(start, i), s = 0, c = 0, g = goalAt(addDays(w, -1));
    for (var k = 0; k < 7; k++) { var q = by[addDays(w, -k)]; if (q && q.ok && q.goal === g && num(q[key])) { s += q[key]; c++; } }
    line.push(c >= 3 ? s / c : null);
  }
  ns.forEach(function (x) { if (num(x[key])) { lo = Math.min(lo, x[key]); hi = Math.max(hi, x[key]); } });
  if (lo === Infinity) return "";
  if (opt.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  var ex = opt.extra || {};
  (ex.lines || []).concat(ex.band ? [{ v: ex.band.lo }, { v: ex.band.hi }] : []).forEach(function (l) { lo = Math.min(lo, l.v); hi = Math.max(hi, l.v); });
  var st = opt.step, a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
  if (b - a < 2 * st) b = a + 2 * st;
  if (Math.round((b - a) / st) % 2) b += st;
  var x = function (d) { return X0 + (dnum(d) - dnum(start)) * (X1 - X0) / n; };
  var y = function (v) { return Y0 - ((v - a) / (b - a)) * (Y0 - Y1); };
  var font = ' font-size="9" fill="var(--ch-lbl)" font-family="Figtree,sans-serif"';
  var svg = "";
  /* Phasen: Band ab der ersten Nacht nach dem Zufuhrtag, abwechselnd getönt */
  ph.forEach(function (p, j) {
    var xa = Math.max(X0, x(addDays(p.von, 1)) - (j ? (X1 - X0) / n / 2 : 0));
    var xb = j === ph.length - 1 ? X1 : x(addDays(ph[j + 1].von, 1)) - (X1 - X0) / n / 2;
    if (j % 2 === 0) svg += '<rect x="' + xa.toFixed(1) + '" y="' + (Y1 - 12) + '" width="' + Math.max(0, xb - xa).toFixed(1) + '" height="' + (Y0 - Y1 + 12) + '" fill="var(--ch-grid)"/>';
    if (xb - xa > 26) svg += '<text x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (Y1 - 3) + '" text-anchor="middle"' + font + '>' + (p.goal ? kc(p.goal) : "?") + '</text>';
  });
  [a, (a + b) / 2, b].forEach(function (t) {
    svg += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="var(--ch-grid-2)"/>'
         + '<text x="' + (X0 - 5) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end"' + font + '>' + opt.lab(t) + '</text>';
  });
  /* Korridor (26.11.): Normalband der Vergleichsphase und Schwellenlinien */
  var xs = ex.from ? Math.max(X0, x(ex.from)) : X0;   // ab Beginn der Vergleichsphase
  if (ex.band) svg += '<rect x="' + xs.toFixed(1) + '" y="' + y(ex.band.hi).toFixed(1) + '" width="' + (X1 - xs).toFixed(1) + '" height="' + (y(ex.band.lo) - y(ex.band.hi)).toFixed(1) + '" fill="var(--fc-a18)"/>';
  (ex.lines || []).forEach(function (l) {
    svg += '<line x1="' + xs.toFixed(1) + '" x2="' + X1 + '" y1="' + y(l.v).toFixed(1) + '" y2="' + y(l.v).toFixed(1) + '" stroke="var(--bad-2)" stroke-width="1.2" stroke-dasharray="4 3"/>';
    if (l.lab) svg += '<text x="' + (X1 - 2) + '" y="' + (y(l.v) - 3).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="var(--bad-2)" font-family="Figtree,sans-serif">' + l.lab + '</text>';
  });
  if (opt.zero && a < 0 && b > 0) svg += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="var(--ch-lbl)" stroke-dasharray="2 3"/>';
  var seg = [], segs = [];
  line.forEach(function (v, k) {
    if (v === null) { if (seg.length > 1) segs.push(seg); seg = []; return; }
    seg.push(x(addDays(start, k)).toFixed(1) + "," + y(v).toFixed(1));
  });
  if (seg.length > 1) segs.push(seg);
  segs.forEach(function (s) { svg += '<polyline points="' + s.join(" ") + '" fill="none" stroke="' + C_AVG + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'; });
  var r = n > 45 ? 1.9 : 2.8, pts = [];
  ns.forEach(function (q) {
    if (!num(q[key])) return;
    var cx = x(q.w), cy = y(q[key]), li = line[dnum(q.w) - dnum(start)];
    svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r + '"'
         + (q.ok ? ' fill="' + C_PT + '" stroke="' + C_PT + '"' : ' fill="var(--surface)" stroke="' + C_PT + '"') + ' stroke-width="1.3"/>';
    pts.push({ x: cx, y: [cy, li === null ? null : y(li)], c: [C_PT, C_AVG],
      v: opt.fmt(q[key]) + (li === null ? "" : " · Ø " + opt.fmt(li)),
      t: "Nacht auf " + dm(q.w) + " · " + (q.kcal ? kc(q.kcal) + " kcal" : "–") + (q.ok ? (q.abends ? " · Training abends" : "") : " · " + q.why) });
  });
  svg += '<text x="' + X0 + '" y="114"' + font + '>' + dm(start) + '</text>'
       + '<text x="' + X1 + '" y="114" text-anchor="end"' + font + '>' + dm(end) + '</text>';
  var attr = typeof window.scrubAttr === "function" && pts.length ? window.scrubAttr(pts) : "";
  return '<svg class="wt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Verlauf ' + opt.l + '"' + attr + '>' + svg + '</svg>';
}
var HR = { l: "Ø Nachtpuls", step: 2, lab: function (v) { return String(v); }, fmt: function (v) { return f1(v); } };
var TP = { l: "Temperatur", step: 0.2, zero: 1, lab: function (v) { return (Math.round(v * 10) / 10).toString().replace(".", ","); }, fmt: function (v) { return sgn(v, 2) + " °C"; } };

/* ─── Bewertung (ab BEWERTUNG_AB) ─────────────────── */
/* Vergleichsphase: die jüngste frühere Phase mit ≥ MIN_N gewerteten Nächten */
function refPhase(ph) {
  var cur = ph[ph.length - 1];
  for (var i = ph.length - 2; i >= 0; i--) { if (ph[i].ok.length >= MIN_N && ph[i].goal !== cur.goal) return ph[i]; }
  return null;
}
/* Korridor für die Graphen. Temperatur-Schwelle sofort (braucht keine
   Vergleichsphase, Oura liefert schon die Abweichung von der Basislinie).
   Puls: Normalband (Ø ± 1 SD der Vergleichsphase) und Schwelle Ø + 2 erst
   ab BEWERTUNG_AB und nur mit Vergleichsphase. */
function korridor(ph, tag) {
  var k = { temp: { lines: [{ v: 0.3, lab: "+0,3 °C" }] }, hr: {} }, ref = refPhase(ph);
  if (tag < BEWERTUNG_AB || !ref) return k;
  var v = ref.ok.map(function (n) { return n.hr; }).filter(num);
  var m = v.reduce(function (s, x) { return s + x; }, 0) / v.length;
  var sd = Math.sqrt(v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / Math.max(1, v.length - 1));
  k.hr = { band: { lo: m - sd, hi: m + sd }, lines: [{ v: m + 2 }], ref: ref, from: addDays(ref.von, 1), thr: m + 2 };
  return k;
}
function bewertung(ph, tag, rate) {
  if (tag < BEWERTUNG_AB) {
    return '<div class="ou-cmp">Bewertung nach der Regel vom 25.11. ab ' + dm(BEWERTUNG_AB) + BEWERTUNG_AB.slice(0, 4) + ' – bis dahin nur beschreibend.</div>';
  }
  var cur = ph[ph.length - 1], ref = refPhase(ph);
  var txt;
  if (cur.ok.length < MIN_N) txt = "Noch nicht bewertbar: aktuelle Phase hat " + cur.ok.length + " von " + MIN_N + " gewerteten Nächten.";
  else if (!ref) txt = "Noch nicht bewertbar: keine frühere Zielphase mit mindestens " + MIN_N + " gewerteten Nächten zum Vergleich.";
  else {
    var dHr = avg(cur.ok, function (n) { return n.hr; }) - avg(ref.ok, function (n) { return n.hr; });
    var t = avg(cur.ok, function (n) { return n.temp; });
    var c1 = dHr >= 2, c2 = t === null || t < 0.3, c3 = num(rate) ? rate > 0 : null;
    var z = function (ok, s) { return (ok === null ? "? " : ok ? "✓ " : "✗ ") + s; };
    var sig = c1 && c2 && c3 === true;
    txt = "<b>" + (sig ? "Signal: " + kc(cur.goal) + " kcal ist wahrscheinlich ein Überschuss" : c3 === null && c1 && c2 ? "Unvollständig: Waagentrend fehlt" : "Kein Signal") + "</b><br>"
        + z(c1, "Ø Puls " + sgn(dHr, 1) + " gegen " + kc(ref.goal) + " kcal (Schwelle +2)") + " · "
        + z(c2, "Temp " + (t === null ? "–" : sgn(t, 2) + " °C") + " (unter +0,3)") + " · "
        + z(c3, "Waage " + (num(rate) ? sgn(rate, 2) + " kg/Wo" : "– (Werte-Tab öffnen)"));
  }
  return '<div class="ou-cmp">' + txt + '</div>';
}

/* ─── Karte ───────────────────────────────────── */
function ui() { try { return JSON.parse(ls("tlui-werte")) || {}; } catch (e) { return {}; } }
function isOpen() { var o = ui().ou || {}; return o.fr === undefined ? true : !!o.fr; }

function card(ou) {
  var ns = nights(ou);
  if (!ns.length) return "";
  var ph = phases(ns), cur = ph[ph.length - 1];
  var hrCur = avg(cur.ok, function (n) { return n.hr; });
  var kv = hrCur === null ? "–" : f1(hrCur);
  if (!isOpen()) {
    return '<div class="wt-mini" onclick="frCard()"><div class="wt-lbl">Frühindikator</div>'
         + '<div class="wt-mv">Ø Puls ' + kv + ' · ' + cur.ok.length + ' N.</div><span>▸</span></div>';
  }
  /* Zahlen je Phase (beschreibend), ältere Phasen oben */
  var ref = ph.filter(function (p) { return p.ok.length >= MIN_DESC; })[0];
  var rowsH = ph.map(function (p) {
    var a = p.ok, ohne = a.filter(function (n) { return !n.abends; });
    var hr = avg(a, function (n) { return n.hr; }), t = avg(a, function (n) { return n.temp; }), z = avg(a, function (n) { return n.kcal; });
    var d = ref && p !== ref && a.length >= MIN_DESC ? hr - avg(ref.ok, function (n) { return n.hr; }) : null;
    return '<div style="margin-top:8px"><b>' + (p.goal ? kc(p.goal) : "?") + ' kcal</b> · ' + dm(addDays(p.von, 1)) + '–' + dm(addDays(p.bis, 1))
      + ' · ' + a.length + ' von ' + p.all.length + ' Nächten gewertet'
      + (a.length ? '<br>Zufuhr Ø ' + kc(z) + ' · Ø Puls <b>' + f1(hr) + '</b>'
        + (ohne.length && ohne.length < a.length ? ' (ohne Abendtraining ' + f1(avg(ohne, function (n) { return n.hr; })) + ')' : '')
        + ' · Temp ' + (t === null ? "–" : sgn(t, 2) + " °C")
        + (d === null ? "" : ' · Δ Puls gegen ' + kc(ref.goal) + ': ' + sgn(d, 1)) : '') + '</div>';
  }).join("");
  var raus = {};
  ns.forEach(function (n) { if (!n.ok) raus[n.why] = (raus[n.why] || 0) + 1; });
  var rausH = Object.keys(raus).map(function (k) { return k + " " + raus[k]; }).join(" · ");
  var rate = typeof window.tlGewichtRate === "function" ? window.tlGewichtRate() : null;
  var kor = korridor(ph, today());

  return '<div class="wt-card">'
    + '<div class="wt-hd"><button type="button" class="wt-lbl wt-fold" onclick="frCard()">Frühindikator <span>▾</span></button><div class="wt-k">'
    + '<span class="wt-kv">' + kv + '</span>'
    + '<div class="wt-sub">Ø Nachtpuls ' + (cur.goal ? kc(cur.goal) : "?") + ' kcal · ' + cur.ok.length + (cur.ok.length === 1 ? ' Nacht' : ' Nächte') + '</div></div></div>'
    + '<div class="dhint" style="margin:6px 0 0">Ø Nachtpuls (Schläge/min) – Nacht nach der Zufuhr, Hintergrund = Kalorienziel</div>'
    + chart(ns, ph, "hr", Object.assign({ extra: kor.hr }, HR))
    + '<div class="dhint" style="margin:4px 0 0">Temperaturabweichung (°C, Oura-Basislinie)</div>'
    + chart(ns, ph, "temp", Object.assign({ extra: kor.temp }, TP))
    + '<div class="wt-leg"><span><i style="background:' + C_PT + '"></i>gewertet</span>'
    + '<span><i style="background:var(--surface);box-shadow:inset 0 0 0 1.5px ' + C_PT + '"></i>nicht gewertet</span>'
    + '<span><i style="background:' + C_AVG + '"></i>Ø 7 Nächte</span>'
    + (kor.hr.band ? '<span><i style="background:var(--fc-a18)"></i>Normal ' + kc(kor.hr.ref.goal) + '</span>' : '')
    + '<span><i style="background:var(--bad-2)"></i>Schwelle' + (kor.hr.thr ? ' (Puls ' + f1(kor.hr.thr) + ')' : '') + '</span></div>'
    + '<div class="ou-cmp">' + rowsH + (rausH ? '<div style="margin-top:8px">Nicht gewertet: ' + rausH + '</div>' : '') + '</div>'
    + bewertung(ph, today(), rate)
    + '</div>';
}

window.frCard = function () {
  var s = ui(); s.ou = s.ou || {}; s.ou.fr = !isOpen();
  try { localStorage.setItem("tlui-werte", JSON.stringify(s)); } catch (e) {}
  if (window.tlOura && window.tlOura.render) window.tlOura.render();
};
window.tlFrueh = { card: card, nights: nights, phases: phases, bewertung: bewertung, korridor: korridor };
})();
