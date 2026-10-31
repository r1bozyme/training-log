/* ═══════════════════════════════════════════════════
   energie.js – Energiebilanz-Schätzer (31.10.2026, Review)

   Schätzt den Erhaltungsbedarf aus Daten statt aus Formeln:
     Erhaltung = Ø Zufuhr (saubere Tage) − Gewichtstrend × Energiedichte
   Saubere Tage: im Tracker erfasst, Tag abgeschlossen, weder „geschätzt“
   noch „Reise“. Gewichtstrend: Regressionsgerade über die Hauswaage-
   Einträge im selben Fenster (robuster als Anfang gegen Ende).

   Energiedichte 7.000 kcal/kg: Mischwert für einen Lean Bulk (reines Fett
   ~9.400, Muskel mit Wasser ~1.800). Die Unsicherheit der Steigung wird
   als Band ausgewiesen (±1 Standardfehler) – bei 2–3 Wochen Daten ist
   das Band breit, das ist Absicht.

   Fenster: die letzten 28 Tage (bis gestern) und – sobald 14 Tage alt –
   „seit Zielwechsel“ (goalSince aus tl-fg, z. B. 08.11.: 3.200 kcal).
   Karte in Ernährung › Heute unter dem Tagesinhalt.

   Rechenkern auch per require nutzbar (Auswerteskript in training-log-data).
   ═══════════════════════════════════════════════════ */
(function (root) {
"use strict";

var RHO = 7000, MIN_TAGE = 10, MIN_W = 6;

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(s, n) { var d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); }
function dnum(s) { return Math.round(new Date(s + "T12:00:00").getTime() / 864e5); }
function kcalDay(items) {
  return (items || []).reduce(function (a, it) {
    var r = Number(it.ref) || 1; return a + (Number(it.kcal) || 0) * (Number(it.menge) || 0) / r;
  }, 0);
}

/* food = tl-f, days = tl-d (Array), weights = tl-w (Array), von/bis inklusive */
function calc(food, days, weights, von, bis) {
  var flags = {};
  (days || []).forEach(function (d) { flags[d.date] = d; });
  var kc = [];
  Object.keys(food || {}).forEach(function (day) {
    if (day < von || day > bis) return;
    var f = flags[day] || {};
    if (!f.kcal || f.est || f.trip) return;
    var k = kcalDay(food[day]);
    if (k > 800) kc.push(k);     // offensichtlich unvollständige Tage raus
  });
  var ws = (weights || []).filter(function (w) { return w.date >= von && w.date <= bis && isFinite(+w.kg); })
    .map(function (w) { return [dnum(w.date), +w.kg]; });
  var out = { von: von, bis: bis, nTage: kc.length, nW: ws.length };
  if (kc.length) out.zufuhr = kc.reduce(function (a, b) { return a + b; }, 0) / kc.length;
  if (ws.length >= 3) {
    var mx = ws.reduce(function (a, p) { return a + p[0]; }, 0) / ws.length;
    var my = ws.reduce(function (a, p) { return a + p[1]; }, 0) / ws.length;
    var sxx = 0, sxy = 0;
    ws.forEach(function (p) { sxx += (p[0] - mx) * (p[0] - mx); sxy += (p[0] - mx) * (p[1] - my); });
    if (sxx > 0) {
      var b = sxy / sxx, a = my - b * mx, sse = 0;
      ws.forEach(function (p) { var e = p[1] - (a + b * p[0]); sse += e * e; });
      var se = ws.length > 2 ? Math.sqrt(sse / (ws.length - 2) / sxx) : 0;
      out.trendWoche = b * 7; out.seWoche = se * 7;
    }
  }
  out.ok = out.nTage >= MIN_TAGE && out.nW >= MIN_W && typeof out.trendWoche === "number";
  if (out.ok) {
    out.erhaltung = out.zufuhr - out.trendWoche / 7 * RHO;
    out.band = out.seWoche / 7 * RHO;
  }
  return out;
}

var api = { calc: calc, RHO: RHO, addDays: addDays, iso: iso };
if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
root.tlEnergie = api;

/* ─── UI (nur Browser) ───────────────────────────── */
function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; } }
function fmt(x) { return Math.round(x).toLocaleString("de-DE"); }
function kgw(x) { return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2).replace(".", ",") + " kg/Woche"; }
function dm(s) { return s.slice(8, 10) + "." + s.slice(5, 7) + "."; }

function block(r, titel) {
  if (!r.ok) {
    return '<div class="eb-b"><div class="eb-t">' + titel + '</div><div class="fhint" style="margin-top:4px">Noch zu wenig Daten: ' +
      r.nTage + ' von ' + MIN_TAGE + ' sauberen Tagen, ' + r.nW + ' von ' + MIN_W + ' Wiegungen.</div></div>';
  }
  return '<div class="eb-b"><div class="eb-t">' + titel + '</div>' +
    '<div class="eb-v">≈ ' + fmt(r.erhaltung) + ' kcal <span class="eb-pm">± ' + fmt(r.band) + '</span></div>' +
    '<div class="fhint" style="margin-top:4px">Zufuhr Ø ' + fmt(r.zufuhr) + ' kcal an ' + r.nTage + ' sauberen Tagen · Trend ' +
    kgw(r.trendWoche) + ' (' + r.nW + ' Wiegungen)</div></div>';
}

function render() {
  var box = document.getElementById("eb-cont"); if (!box) return;
  var food = readJSON("tl-f", {}), days = readJSON("tl-d", []), ws = readJSON("tl-w", []), cfg = readJSON("tl-fg", {});
  var heute = iso(new Date()), bis = addDays(heute, -1);
  var r28 = calc(food, days, ws, addDays(heute, -28), bis);
  var h = block(r28, "Letzte 28 Tage (" + dm(addDays(heute, -28)) + "–" + dm(bis) + ")");
  var gs = cfg.goalSince;
  if (gs && gs <= addDays(heute, -14) && gs > addDays(heute, -28)) h += block(calc(food, days, ws, gs, bis), "Seit Zielwechsel " + dm(gs));
  var g = cfg.goal && cfg.goal.kcal;
  var best = r28.ok ? r28 : null;
  if (best && g) {
    var diff = g - best.erhaltung, erw = diff * 7 / RHO;
    h += '<div class="fhint">Ziel ' + fmt(g) + ' kcal = ' + (diff >= 0 ? "Überschuss" : "Defizit") + ' ≈ ' + fmt(Math.abs(diff)) +
      ' kcal → erwartet ' + kgw(erw) + '. Zielkorridor Lean Bulk: +0,1 bis +0,35 kg/Woche.</div>';
  }
  h += '<div class="fhint">Rechnung: Zufuhr − Trend × 7.000 kcal/kg. Saubere Tage = abgeschlossen, nicht „geschätzt“, nicht „Reise“. ' +
    'Das Band ist die Unsicherheit des Trends – bei wenigen Wiegungen breit.</div>';
  box.innerHTML = '<div class="fsec"><div class="fsub">Energiebilanz · geschätzte Erhaltung</div>' + h + '</div>';
}

var CSS = [
  ".eb-b { padding:8px 0 10px; border-bottom:1px solid var(--border); }",
  ".eb-b:last-of-type { border-bottom:none; }",
  ".eb-t { font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.5px; }",
  ".eb-v { font-family:var(--fd); font-size:28px; line-height:1.1; color:var(--text); margin-top:4px; }",
  ".eb-pm { font-family:var(--fb); font-size:13px; font-weight:600; color:var(--muted); }"
].join("\n");

function init() {
  var fv = document.getElementById("view-food");
  if (!fv || document.getElementById("eb-cont")) return;
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  var box = document.createElement("div"); box.id = "eb-cont";
  fv.appendChild(box);
  var orig = window.showView;
  if (typeof orig === "function") {
    window.showView = function (v) { var r = orig.apply(this, arguments); if (v === "food") render(); return r; };
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") render(); });
  render();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})(typeof window !== "undefined" ? window : this);
