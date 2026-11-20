/* ═══════════════════════════════════════════════════
   kraft.js – Stats-Tab pro Studio + Kraftindex (20.11.2026, ENTWURF)

   Anlass: Seit 17.11. zwei Stammstudios (studio.js). Der alte Stats-Tab
   (buildStats in index.html) mischt alle Studios in eine Kurve – die
   Sendling-Maschinen haben andere Hebel, Shoulder Press gibt es dort
   gar nicht. Dieses Modul zeichnet den Stats-Tab nach buildStats neu:
   pro Studio getrennt, Standardstudio (Sendling) vorausgewählt.

   KRAFTINDEX
     · Leistung je Eintrag = geschätztes 1RM nach Epley aus dem besten
       Satz: kg × (1 + Wdh/30). Fängt Gewicht UND Wiederholungen ein.
     · Kettenindex je Studio: Start = 100 bei der ersten Einheit dort.
       An jedem Trainingstag wird der Index mit dem Mittel der
       log-Veränderungen aller Übungen fortgeschrieben, die schon einen
       Vorwert in diesem Studio haben. Neue Übungen ziehen den Index
       daher nicht nach unten; ein Sprung pro Übung ist auf ±20 %
       begrenzt (Tippfehler, Geräteumbau).
     · Zählt: Einträge der Studio-Gruppe (tlStudio.gruppe) plus
       studiofreie Übungen (PLAN …studiofrei) aus jedem Studio.
       Fremde Studios zählen sonst nicht. Deload-Fenster (PLAN.deload)
       und Wiedereinstiege (progression.ab) unterbrechen die Kette.
     · Geglättet: monotone kubische Kurve, ab 8 Punkten zusätzlich EMA.

   FARBEN: ausschließlich window.tlStudio.farbe() – Clever fit
   Bernstein, Sendling Blau, fremde grau. Push/Pull/Legs-Farben nur
   für die Überschriften.

   ZWEI VARIANTEN (zur Auswahl durch Thomas, danach fliegt eine raus):
     A "Raster" – Studio-Chips, Kraftindex-Karte des gewählten Studios,
                  je Einheit ein 2-spaltiges Raster kleiner Karten.
     B "Kurven" – Kraftindex beider Studios übereinander, je Einheit
                  eine Karte mit Index-Kurve und kompakter Übungsliste.
   Umschalter oben rechts. Storage-Key tl-kx {studio, variante}
   (nur Ansicht, nicht im Backup nötig).

   Zusammenspiel: hört auf tl:view (view.js), liest loadEntries/PLAN/
   scrubAttr aus index.html bzw. plan.js, tlStudio aus studio.js.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var KEY = "tl-kx";
var EINHEITEN = ["Push", "Pull", "Legs"];
var KAPPE = Math.log(1.2);

/* ─── Einstellungen ─────────────────────────────────── */
function opt() {
  var o = null;
  try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { o = null; }
  return o && typeof o === "object" ? o : {};
}
function setOpt(k, v) {
  var o = opt(); o[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* egal */ }
}

/* ─── Studio-Helfer ─────────────────────────────────── */
function S() { return window.tlStudio || null; }
function gruppen() { return S() ? S().stamm() : [""]; }
function farbe(g) { return S() ? S().farbe(g) : "#B07810"; }
function voll(g) { return S() ? S().name(g) : "Heimstudio"; }
function farbeEintrag(e) { return S() ? S().farbe(String(e.studio || "").trim()) : "#B07810"; }
var FUELL = { all: 1, inclusive: 1, fitness: 1, studio: 1, gym: 1, club: 1 };
function kurz(g) {
  var w = voll(g).split(/\s+/).filter(function (x) { return x && !FUELL[x.toLowerCase()]; });
  if (!w.length) return voll(g);
  return w.length <= 2 ? w.join(" ") : w.slice(0, 2).join(" ");
}
function gewaehlt() {
  var g = gruppen(), o = opt().studio;
  if (typeof o === "string" && g.indexOf(o) !== -1) return o;
  var s = S() ? S().standard() : "";
  return g.indexOf(s) !== -1 ? s : g[0];
}

/* ─── Daten ─────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function num(g) { var n = parseFloat(String(g == null ? "" : g).replace(",", ".")); return isNaN(n) ? null : n; }
function saetze(e) {
  return [e.s1, e.s2, e.s3, e.s4].map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n > 0; });
}
function e1rm(e) {
  var kg = num(e.gewicht), s = saetze(e);
  if (kg === null || kg <= 0 || !s.length) return null;
  return Math.max.apply(null, s.map(function (r) { return kg * (1 + Math.min(r, 20) / 30); }));
}
var exCache = null;
function findEx(name) {
  if (!exCache) {
    exCache = {};
    if (typeof PLAN !== "undefined") EINHEITEN.forEach(function (u) {
      (PLAN[u] || []).forEach(function (x) { if (!exCache[x.name] || x.studiofrei) exCache[x.name] = x; });
    });
  }
  return exCache[name] || null;
}
function frei(name) { var x = findEx(name); return !!(x && x.studiofrei); }
function abVon(name) { var x = findEx(name); return x && x.progression && x.progression.ab ? String(x.progression.ab) : ""; }
function deload(d) {
  var w = typeof PLAN !== "undefined" ? PLAN.deload : null;
  return !!(w && d >= w.von && d <= w.bis);
}
function gruppeVon(e) { return S() ? S().gruppe(e) : ""; }

/* Einträge eines Studios (plus studiofreie Übungen), nach Datum, mit _r */
function eintraege(g) {
  var all = typeof loadEntries === "function" ? loadEntries() : [];
  return all.filter(function (e) {
    if (!e || !e.date || deload(e.date)) return false;
    if (!(frei(e.uebung) || gruppeVon(e) === g)) return false;
    e._r = e1rm(e);
    return e._r !== null;
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

/* Kettenindex: [{d, v}] */
function kette(list) {
  var prev = {}, tage = {}, out = [], I = 100;
  list.forEach(function (e) { (tage[e.date] = tage[e.date] || []).push(e); });
  Object.keys(tage).sort().forEach(function (d) {
    var best = {};
    tage[d].forEach(function (e) { if (!best[e.uebung] || e._r > best[e.uebung]._r) best[e.uebung] = e; });
    var sum = 0, n = 0;
    Object.keys(best).forEach(function (u) {
      var p = prev[u], ab = abVon(u);
      if (p && !(ab && p.d < ab && d >= ab)) {
        var l = Math.log(best[u]._r / p.r);
        sum += Math.max(-KAPPE, Math.min(KAPPE, l)); n++;
      }
      prev[u] = { r: best[u]._r, d: d };
    });
    if (n) I *= Math.exp(sum / n);
    out.push({ d: d, v: I });
  });
  return out;
}
function index(g, einheit) {
  var l = eintraege(g);
  if (einheit) l = l.filter(function (e) { return e.einheit === einheit; });
  return kette(l);
}
/* Übungen einer Einheit im Studio, Plan-Reihenfolge zuerst */
function uebungen(list, einheit) {
  var plan = typeof PLAN !== "undefined" && PLAN[einheit] ? PLAN[einheit].map(function (x) { return x.name; }) : [];
  var map = {};
  list.forEach(function (e) { if (e.einheit === einheit) (map[e.uebung] = map[e.uebung] || []).push(e); });
  var names = plan.filter(function (n) { return map[n]; })
    .concat(Object.keys(map).filter(function (n) { return plan.indexOf(n) === -1; }));
  return names.map(function (n) { return { name: n, es: map[n], frei: frei(n) }; });
}

/* ─── Zeichnen ──────────────────────────────────────── */
function ema(v, a) {
  var o = [], s = v[0];
  v.forEach(function (x, i) { s = i ? a * x + (1 - a) * s : x; o.push(s); });
  return o;
}
/* Monotone kubische Kurve (Fritsch–Carlson): kein Überschwingen */
function glatt(p) {
  var n = p.length, i;
  if (!n) return "";
  if (n === 1) return "M" + f(p[0][0]) + "," + f(p[0][1]);
  var dx = [], m = [], t = [];
  for (i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0] || 1e-6; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { var k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  var d = "M" + f(p[0][0]) + "," + f(p[0][1]);
  for (i = 0; i < n - 1; i++) {
    var h = dx[i] / 3;
    d += "C" + f(p[i][0] + h) + "," + f(p[i][1] + t[i] * h) + " " + f(p[i + 1][0] - h) + "," + f(p[i + 1][1] - t[i + 1] * h) + " " + f(p[i + 1][0]) + "," + f(p[i + 1][1]);
  }
  return d;
}
function f(x) { return (Math.round(x * 10) / 10).toString(); }
function iso(t) { var d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function ms(d) { return new Date(d + "T12:00:00").getTime(); }
function fmtD(d) { var p = String(d).split("-"); return p[2] + "." + p[1] + "."; }
function fmtI(v) { return Math.round(v).toString(); }
function fmtKg(n) { return (Math.round(n * 10) / 10).toString().replace(".", ",") + " kg"; }
function delta(v, nk) {
  var r = Math.round(v * (nk ? 10 : 1)) / (nk ? 10 : 1);
  if (!r) return "±0";
  return (r > 0 ? "+" : "−") + String(Math.abs(r)).replace(".", ",");
}

/* Zeitachsen-Diagramm, mehrere Reihen. reihen: [{pts:[{d,v,info}], farbe, dick, matt, flaeche}] */
function diagramm(reihen, w, h, mitAchse) {
  var alle = [];
  reihen.forEach(function (r) { r.pts.forEach(function (p) { alle.push(p); }); });
  if (!alle.length) return "";
  var x0 = Math.min.apply(null, alle.map(function (p) { return ms(p.d); }));
  var x1 = Math.max.apply(null, alle.map(function (p) { return ms(p.d); }));
  var y0 = Math.min.apply(null, alle.map(function (p) { return p.v; }));
  var y1 = Math.max.apply(null, alle.map(function (p) { return p.v; }));
  var pad = (y1 - y0) * 0.12 || 2; y0 -= pad; y1 += pad;
  var L = 4, R = mitAchse ? 30 : 6, T = 6, B = mitAchse ? 16 : 4;
  function X(d) { return x1 === x0 ? (L + w - R) / 2 : L + (ms(d) - x0) / (x1 - x0) * (w - L - R); }
  function Y(v) { return T + (1 - (v - y0) / (y1 - y0)) * (h - T - B); }
  var svg = "", scrub = null;
  if (mitAchse) {
    var tick = [y0 + pad, (y0 + y1) / 2, y1 - pad];
    tick.forEach(function (v) {
      svg += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + f(Y(v)) + '" y2="' + f(Y(v)) + '" class="kx-gl"/>' +
        '<text x="' + (w - R + 4) + '" y="' + f(Y(v) + 3) + '" class="kx-ax">' + fmtI(v) + "</text>";
    });
    svg += '<text x="' + L + '" y="' + (h - 3) + '" class="kx-ax">' + fmtD(iso(x0)) + "</text>" +
      '<text x="' + (w - R) + '" y="' + (h - 3) + '" class="kx-ax" text-anchor="end">' + fmtD(iso(x1)) + "</text>";
  }
  reihen.forEach(function (r, ri) {
    if (!r.pts.length) return;
    var vals = r.pts.map(function (p) { return p.v; });
    var sm = vals.length >= 8 ? ema(vals, 0.4) : vals;
    var P = r.pts.map(function (p, i) { return [X(p.d), Y(sm[i])]; });
    var op = r.matt ? ' opacity=".45"' : "";
    if (r.flaeche && P.length > 1) {
      var gid = "kxg" + Math.random().toString(36).slice(2, 7);
      svg += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + r.farbe + '" stop-opacity=".28"/><stop offset="1" stop-color="' + r.farbe + '" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + glatt(P) + "L" + f(P[P.length - 1][0]) + "," + (h - B) + "L" + f(P[0][0]) + "," + (h - B) + 'Z" fill="url(#' + gid + ')"/>';
    }
    if (r.punkte) r.pts.forEach(function (p) {
      svg += '<circle cx="' + f(X(p.d)) + '" cy="' + f(Y(p.v)) + '" r="1.8" fill="' + (p.farbe || r.farbe) + '" opacity=".55"/>';
    });
    if (P.length > 1) svg += '<path d="' + glatt(P) + '" fill="none" stroke="' + r.farbe + '" stroke-width="' + (r.dick || 2.5) + '" stroke-linecap="round" stroke-linejoin="round"' + op + "/>";
    var lp = P[P.length - 1];
    svg += '<circle cx="' + f(lp[0]) + '" cy="' + f(lp[1]) + '" r="' + (r.matt ? 2.5 : 3.5) + '" fill="' + r.farbe + '"' + op + "/>";
    if (ri === 0 && typeof scrubAttr === "function") {
      scrub = scrubAttr(r.pts.map(function (p, i) {
        return { x: P[i][0], y: [P[i][1]], c: [r.farbe], v: p.info ? p.info.v : fmtI(p.v), t: p.info ? p.info.t : fmtD(p.d) };
      }));
    }
  });
  return '<svg class="kx-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" style="height:' + h + 'px"' + (scrub || "") + ">" + svg + "</svg>";
}

/* Punkte einer Übung: Leistung (1RM) als Linie, Infozeile mit kg × Wdh. */
function uebPts(es) {
  var tage = {};
  es.forEach(function (e) { if (!tage[e.date] || e._r > tage[e.date]._r) tage[e.date] = e; });
  return Object.keys(tage).sort().map(function (d) {
    var e = tage[d];
    return { d: d, v: e._r, farbe: farbeEintrag(e),
      info: { v: fmtKg(num(e.gewicht)), t: fmtD(d) + " · " + saetze(e).join("/") } };
  });
}
function uebKennz(es) {
  var l = es[es.length - 1], fst = es[0];
  return { kg: num(l.gewicht), dkg: num(l.gewicht) - num(fst.gewicht),
    dr: (l._r / fst._r - 1) * 100, n: es.length };
}

/* ─── Bausteine ─────────────────────────────────────── */
function chips(g) {
  return '<div class="kx-chips">' + gruppen().map(function (x) {
    var c = farbe(x), an = x === g;
    return '<button type="button" class="kx-chip' + (an ? " an" : "") + '" data-kx-studio="' + esc(x) + '" style="--kc:' + c + '">' +
      '<i style="background:' + c + '"></i>' + esc(kurz(x)) + "</button>";
  }).join("") + "</div>";
}
function umschalter(v) {
  return '<div class="kx-var">' + [["A", "Raster"], ["B", "Kurven"]].map(function (x) {
    return '<button type="button" data-kx-var="' + x[0] + '" class="' + (v === x[0] ? "an" : "") + '">' + x[1] + "</button>";
  }).join("") + "</div>";
}
function aenderung(ser, tage) {
  if (ser.length < 2) return null;
  var l = ser[ser.length - 1], grenze = iso(ms(l.d) - tage * 864e5), b = ser[0];
  for (var i = ser.length - 1; i >= 0; i--) if (ser[i].d <= grenze) { b = ser[i]; break; }
  return l.v - b.v;
}
function einheitenZeile(g) {
  return '<div class="kx-units">' + EINHEITEN.map(function (u) {
    var s = index(g, u), v = s.length ? fmtI(s[s.length - 1].v) : "–";
    return '<div><span class="kx-ul ' + u + '">' + u.toUpperCase() + "</span><b>" + v + "</b></div>";
  }).join("") + "</div>";
}
function info(ser) {
  return ser.map(function (p) { return { d: p.d, v: p.v, info: { v: "Index " + fmtI(p.v), t: fmtD(p.d) } }; });
}
function einheitenKopf(u, rechts) {
  return '<div class="peh"><div class="pel ' + u + '">' + u.toUpperCase() + '</div><div class="pline"></div>' + (rechts || "") + "</div>";
}
function fussnote() {
  return '<div class="kx-fn">Kraftindex: 100 = erste Einheit im Studio. Leistung je Übung = kg × (1 + Wdh/30) aus dem besten Satz. ' +
    "Studiofreie Übungen (Kurzhanteln …) zählen in jedem Studio mit. Gedrückt halten zeigt die Werte.</div>";
}

/* ─── Variante A: Raster ────────────────────────────── */
function varianteA(g) {
  var c = farbe(g), ser = index(g), list = eintraege(g);
  var h = chips(g);
  if (!ser.length) return h + '<div class="kx-card"><div class="kx-leer">Noch keine Einheit in ' + esc(voll(g)) + ".</div></div>";
  var d28 = aenderung(ser, 28);
  h += '<div class="kx-card kx-hero" style="--kc:' + c + '">' +
    '<div class="kx-top"><div><div class="kx-lbl">Kraftindex</div><div class="kx-big">' + fmtI(ser[ser.length - 1].v) +
    (d28 !== null ? '<span class="kx-d ' + (d28 >= 0 ? "up" : "down") + '">' + delta(d28) + " in 4 Wo.</span>" : "") + "</div></div>" +
    (S() ? S().tag(voll(g)) : "") + "</div>" +
    diagramm([{ pts: info(ser), farbe: c, flaeche: true, dick: 2.5 }], 320, 96, true) +
    einheitenZeile(g) + "</div>";
  EINHEITEN.forEach(function (u) {
    var ue = uebungen(list, u);
    if (!ue.length) return;
    h += '<div class="peinheit">' + einheitenKopf(u) + '<div class="kx-grid">';
    ue.forEach(function (x) {
      var k = uebKennz(x.es), pts = uebPts(x.es);
      h += '<div class="kx-mini" style="--kc:' + c + '">' +
        '<div class="kx-mn">' + esc(x.name) + (x.frei ? ' <span class="kx-frei">frei</span>' : "") + "</div>" +
        '<div class="kx-mv"><b>' + fmtKg(k.kg) + '</b><span class="' + (k.dkg > 0 ? "up" : k.dkg < 0 ? "down" : "flat") + '">' + delta(k.dkg, true) + "</span></div>" +
        (pts.length > 1 ? diagramm([{ pts: pts, farbe: c, dick: 2, punkte: true }], 150, 34, false)
                        : '<div class="kx-eins">1 Einheit</div>') +
        "</div>";
    });
    h += "</div></div>";
  });
  return h;
}

/* ─── Variante B: Kurven ────────────────────────────── */
function varianteB(g) {
  var gs = gruppen(), list = eintraege(g);
  /* gewähltes Studio zuerst (bekommt den Scrub), andere matt dahinter */
  var reihen = [g].concat(gs.filter(function (x) { return x !== g; })).map(function (x) {
    return { g: x, ser: index(x) };
  }).filter(function (r) { return r.ser.length; });
  var h = '<div class="kx-card"><div class="kx-top"><div class="kx-lbl">Kraftindex je Studio</div></div>' +
    '<div class="kx-leg">' + reihen.map(function (r) {
      var s = r.ser, v = s[s.length - 1].v;
      return '<button type="button" class="kx-legi' + (r.g === g ? " an" : "") + '" data-kx-studio="' + esc(r.g) + '" style="--kc:' + farbe(r.g) + '">' +
        '<i style="background:' + farbe(r.g) + '"></i>' + esc(kurz(r.g)) + " <b>" + fmtI(v) + "</b></button>";
    }).join("") + "</div>" +
    diagramm(reihen.map(function (r) {
      return { pts: info(r.ser), farbe: farbe(r.g), dick: r.g === g ? 2.8 : 2, matt: r.g !== g, flaeche: r.g === g };
    }), 320, 110, true) + "</div>";

  EINHEITEN.forEach(function (u) {
    var ue = uebungen(list, u);
    if (!ue.length) return;
    var ser = index(g, u), other = gs.filter(function (x) { return x !== g; }).map(function (x) { return { g: x, s: index(x, u) }; });
    var v = ser.length ? fmtI(ser[ser.length - 1].v) : "–";
    h += '<div class="peinheit">' + einheitenKopf(u, '<span class="kx-uv" style="color:' + farbe(g) + '">' + v + "</span>") +
      '<div class="kx-card kx-ucard">' +
      diagramm([{ pts: info(ser), farbe: farbe(g), dick: 2.5, flaeche: true }].concat(other.filter(function (o) { return o.s.length; }).map(function (o) {
        return { pts: info(o.s), farbe: farbe(o.g), dick: 1.6, matt: true };
      })), 320, 56, false) +
      '<div class="kx-rows">';
    ue.forEach(function (x) {
      var k = uebKennz(x.es), pts = uebPts(x.es);
      h += '<div class="kx-row"><div class="kx-rn">' + esc(x.name) + (x.frei ? ' <span class="kx-frei">frei</span>' : "") + "</div>" +
        '<div class="kx-rs">' + (pts.length > 1 ? diagramm([{ pts: pts, farbe: farbe(g), dick: 1.8 }], 64, 20, false) : "") + "</div>" +
        '<div class="kx-rk"><b>' + fmtKg(k.kg) + '</b><span class="' + (k.dkg > 0 ? "up" : k.dkg < 0 ? "down" : "flat") + '">' + delta(k.dkg, true) + "</span></div></div>";
    });
    h += "</div></div></div>";
  });
  return h;
}

/* ─── Kopfzahlen (pro Studio) ───────────────────────── */
function kopf(g) {
  var all = typeof loadEntries === "function" ? loadEntries() : [];
  var l = all.filter(function (e) { return e && e.date && (gruppeVon(e) === g); });
  var einh = {}, e30 = {}, grenze = new Date(Date.now() - 30 * 864e5);
  var g30 = grenze.getFullYear() + "-" + String(grenze.getMonth() + 1).padStart(2, "0") + "-" + String(grenze.getDate()).padStart(2, "0");
  l.forEach(function (e) { einh[e.date] = 1; if (e.date >= g30) e30[e.date] = 1; });
  return '<div class="kx-kopf"><div><b>' + Object.keys(einh).length + "</b><span>Trainingstage</span></div>" +
    "<div><b>" + Object.keys(e30).length + "</b><span>Letzte 30 Tage</span></div></div>";
}

/* ─── Render ────────────────────────────────────────── */
function render() {
  var cont = document.getElementById("stats-cont");
  if (!cont) return;
  exCache = null;
  var all = typeof loadEntries === "function" ? loadEntries() : [];
  if (!all.length) return;   // Leerzustand aus buildStats bleibt stehen
  css();
  var g = gewaehlt(), v = opt().variante === "B" ? "B" : "A";
  cont.innerHTML = '<div class="kx">' +
    '<div class="kx-head"><div class="kx-h">Stats</div>' + umschalter(v) + "</div>" +
    (v === "B" ? chips(g) + kopf(g) + varianteB(g) : varianteA(g) + kopf(g)) +
    fussnote() + "</div>";
}

var cssDa = false;
function css() {
  if (cssDa) return; cssDa = true;
  var st = document.createElement("style");
  st.textContent =
    ".kx{padding:16px 20px 24px}" +
    ".kx-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}" +
    ".kx-h{font-family:var(--fd);font-size:22px;letter-spacing:2px;color:var(--text)}" +
    ".kx-var{display:flex;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:2px}" +
    ".kx-var button{border:0;background:transparent;color:var(--muted);font:600 12px var(--fb);padding:5px 10px;border-radius:7px;cursor:pointer}" +
    ".kx-var button.an{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.08)}" +
    ".kx-chips{display:flex;gap:8px;margin-bottom:12px}" +
    ".kx-chip{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 8px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font:700 13px var(--fb);cursor:pointer}" +
    ".kx-chip i,.kx-legi i{width:9px;height:9px;border-radius:50%;flex:none}" +
    ".kx-chip.an{border-color:var(--kc);color:var(--kc);background:color-mix(in srgb,var(--kc) 9%,var(--surface))}" +
    ".kx-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 12px 10px;margin-bottom:12px}" +
    ".kx-hero{border-top:3px solid var(--kc)}" +
    ".kx-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px}" +
    ".kx-lbl{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}" +
    ".kx-big{font-family:var(--fd);font-size:40px;line-height:1;color:var(--kc);letter-spacing:1px}" +
    ".kx-d{font-family:var(--fb);font-size:12px;font-weight:700;margin-left:8px;letter-spacing:0}" +
    ".up{color:#2E8A3E}.down{color:#C04015}.flat{color:var(--muted)}" +
    ".kx-svg{display:block;width:100%;overflow:visible}" +
    "line.kx-gl{stroke:var(--border);stroke-width:1}" +
    "text.kx-ax{font:9px var(--fb);fill:var(--muted)}" +
    ".kx-units{display:flex;gap:6px;margin-top:8px}" +
    ".kx-units div{flex:1;background:var(--bg);border-radius:8px;padding:6px 0;text-align:center}" +
    ".kx-units b{display:block;font:700 15px var(--fb);color:var(--text)}" +
    ".kx-ul{font-family:var(--fd);font-size:13px;letter-spacing:1.5px}.kx-ul.Push{color:var(--push)}.kx-ul.Pull{color:var(--pull)}.kx-ul.Legs{color:var(--legs)}" +
    ".kx .peinheit{padding:0;margin:14px 0 0}" +
    ".kx-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}" +
    ".kx-mini{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--kc);border-radius:10px;padding:8px 9px 6px;min-width:0}" +
    ".kx-mn{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".kx-mv{display:flex;align-items:baseline;gap:6px;margin:2px 0 3px}.kx-mv b{font:700 16px var(--fb);color:var(--text)}.kx-mv span,.kx-rk span{font-size:11px;font-weight:700}" +
    ".kx-eins{font-size:10px;color:var(--muted);height:34px;line-height:34px}" +
    ".kx-frei{font-size:9px;font-weight:700;letter-spacing:.5px;color:var(--muted);border:1px solid var(--border);border-radius:5px;padding:0 4px;vertical-align:1px}" +
    ".kx-leg{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 6px}" +
    ".kx-legi{display:flex;align-items:center;gap:6px;border:1.5px solid var(--border);background:var(--surface);border-radius:20px;padding:4px 10px;font:600 12px var(--fb);color:var(--muted);cursor:pointer}" +
    ".kx-legi b{color:var(--kc)}.kx-legi.an{border-color:var(--kc);color:var(--text)}" +
    ".kx-uv{font:700 18px var(--fb)}" +
    ".kx-ucard{padding:8px 12px 4px}" +
    ".kx-rows{margin-top:6px}" +
    ".kx-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border)}" +
    ".kx-rn{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".kx-rs{width:64px;flex:none}.kx-rk{width:86px;flex:none;text-align:right;display:flex;justify-content:flex-end;align-items:baseline;gap:5px}.kx-rk b{font:700 14px var(--fb)}" +
    ".kx-kopf{display:flex;gap:8px;margin:2px 0 4px}.kx-kopf div{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px;text-align:center}" +
    ".kx-kopf b{display:block;font:700 18px var(--fb)}.kx-kopf span{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}" +
    ".kx-leer{font-size:13px;color:var(--muted);padding:12px 0}" +
    ".kx-fn{font-size:11px;color:var(--muted);line-height:1.45;margin-top:16px}";
  document.head.appendChild(st);
}

/* ─── Ereignisse ────────────────────────────────────── */
document.addEventListener("tl:view", function (e) {
  if (e.detail && e.detail.view === "stats") render();
});
document.addEventListener("click", function (e) {
  var t = e.target && e.target.closest ? e.target.closest("[data-kx-studio],[data-kx-var]") : null;
  if (!t || !document.getElementById("stats-cont") || !document.getElementById("stats-cont").contains(t)) return;
  if (t.hasAttribute("data-kx-studio")) setOpt("studio", t.getAttribute("data-kx-studio"));
  else setOpt("variante", t.getAttribute("data-kx-var"));
  render();
});

window.tlKraft = { index: index, render: render };   // für Tests/Review
})();
