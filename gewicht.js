/* ═══════════════════════════════════════════════════
   gewicht.js – Gewicht als Karte im Werte-Tab (13.11.2026)

   Ersetzt buildWeight() aus index.html durch eine Karte im Aufbau des
   Werte-Tabs (werte.js): Kennzahl Trend kg und kg/Woche, Zeile „Heute“
   bzw. „Nächste Messung“, Verlauf mit Prognose-Trichter, aufklappbar
   Einschätzung, Fortschritt seit Startpunkt, Messungen, Hinweis und
   Startpunkt-Editor.

   Rechnung, Speicher und Aktionen bleiben in index.html (loadWeights,
   computeTrend, weeklyRate, weightChart, saveWeight, delWeight,
   Startpunkt). Hier entsteht nur die Darstellung. Das alte Formular
   (w-date, w-kg) wird entfernt, die Karte legt die Felder mit denselben
   IDs neu an – saveWeight() liest sie unverändert. Gewogen wird für den
   oben gewählten Tag.

   Zeichnet bei jedem Neuaufbau des Werte-Tabs mit (Ereignis "tl:werte"
   aus daily.js). Lädt nach daily.js.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";
if (window.tlGewichtKarte) return;
window.tlGewichtKarte = 1;

var WTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function naechsteMessung(ab) {
  /* nächster Di oder Fr ab dem Tag nach „ab“ */
  for (var i = 1; i <= 7; i++) {
    var d = new Date(ab + "T12:00:00"); d.setDate(d.getDate() + i);
    if (d.getDay() === 2 || d.getDay() === 5) return i === 1 ? "morgen" : WTAG[d.getDay()];
  }
  return "";
}

function kgStr(n) { return fmtNum(n, 1).replace(".", ","); }

function build() {
  var slot = document.getElementById("d-weightsec");
  var W = window.tlWerte;
  if (!slot || !W || typeof window.loadWeights !== "function") return;
  var S = typeof window.tlWerteState === "function" ? window.tlWerteState() : { date: todayStr(), isToday: true };
  var date = S.date;
  var all = loadWeights().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var onDate = all.filter(function (w) { return w.date === date; })[0] || null;
  var lab = S.isToday ? "Heute" : fmtDate(date).slice(0, 6);

  var allPts = all.length ? computeTrend(all) : [];
  var cur = allPts.length ? allPts[allPts.length - 1] : null;
  var rate = allPts.length ? weeklyRate(allPts) : null;
  var lastDay = cur ? cur.day : 0;
  var ref30 = allPts.filter(function (p) { return lastDay - p.day >= 28; });
  var d30 = cur && ref30.length ? cur.trend - ref30[ref30.length - 1].trend : null;
  var rateStr = rate === null ? "–" : (rate > 0 ? "+" : "−") + fmtNum(Math.abs(rate), 2);
  var rateCls = rate === null ? "" : rate >= W_MIN && rate <= W_MAX ? "good" : "warn";

  /* Morgens geschrumpft, solange anderes offen ist und hier nichts fällig */
  if (S.focus && !S.weighOpen && !W.isShown("weight")) {
    slot.innerHTML = '<div class="wt-mini" onclick="tlWerte.show(\'weight\')"><div class="wt-lbl">Gewicht</div><div class="wt-mv">' +
      (cur ? kgStr(cur.trend) + " · " + rateStr + "/Wo" : "–") + '</div>' +
      /* ＋ wiegt auch an Tagen außer Di/Fr mit einem Tipp */
      (onDate ? "" : '<button type="button" class="wt-mplus" aria-label="Gewicht eintragen" onclick="event.stopPropagation();tlWerte.showEdit(\'weight\')">＋</button>') +
      '<span>▸</span></div>';
    return;
  }

  var ed = S.weighOpen || W.isEdit("weight");
  var h = '<div class="wt-card">' +
    '<div class="wt-hd"><div class="wt-lbl">Gewicht</div><div class="wt-k">' +
      '<span class="wt-kv">' + (cur ? kgStr(cur.trend) : "–") + '</span>' +
      (rate === null ? "" : '<span class="wt-kd ' + rateCls + '">' + rateStr + '/Wo</span>') +
      '<div class="wt-sub">Trend kg · Δ 30 Tage ' + (d30 === null ? "–" : (d30 >= 0 ? "+" : "−") + fmtNum(Math.abs(d30), 1)) + '</div></div></div>';

  if (ed) {
    h += '<div class="wt-in"><div class="wt-wrow">' +
      '<input type="hidden" id="w-date" value="' + date + '">' +
      '<input type="number" id="w-kg" placeholder="' + (onDate ? kgStr(onDate.kg) : cur ? kgStr(cur.kg) : "74,5") + '" inputmode="decimal" step="0.1" aria-label="Gewicht in kg"' +
        (onDate ? ' value="' + onDate.kg + '"' : "") + '>' +
      '<button type="button" class="dsave" onclick="saveWeight()">Eintragen</button></div>' +
      '<div class="drends"><span>nüchtern, morgens · ' + (S.isToday ? "für heute" : "für den " + fmtDate(date)) + '</span></div>' +
      (S.weighOpen ? "" : '<button type="button" class="wt-done" onclick="tlWerte.edit(\'weight\', false)">Fertig</button>') +
      '</div>';
  } else {
    var val = onDate ? kgStr(onDate.kg) + " kg" : "Nächste Messung " + naechsteMessung(date);
    h += '<div class="wt-today"><div class="wt-tl">' + (onDate ? lab : "Wiegen") + '</div><div class="wt-tv' + (onDate ? "" : " dim") + '">' + val + '</div>' +
      '<button type="button" class="wt-ed" aria-label="Gewicht eintragen" onclick="tlWerte.edit(\'weight\')">' + (onDate ? "✎" : "＋") + '</button></div>';
  }

  /* Kompakt nur, solange morgens auch die Sehnen offen sind – dann zählt
     schnelles Eintragen. „Verlauf zeigen“ holt den Rest trotzdem dazu. */
  var kompakt = S.focus && S.weighOpen && S.sehnenOpen && !W.isShown("weightfull");
  if (kompakt) {
    slot.innerHTML = h + '<button type="button" class="wt-more" onclick="tlWerte.show(\'weightfull\')">Verlauf &amp; Messungen<span>▸</span></button></div>';
    return;
  }
  if (!all.length) {
    h += '<div class="dhint">Noch keine Messungen – zweimal pro Woche nüchtern wiegen (Di und Fr).</div>';
  } else {
    var pts = wRange ? allPts.filter(function (p) { return lastDay - p.day <= wRange; }) : allPts;
    if (pts.length >= 2) {
      var fc = wForecast(cur);
      h += '<div class="wt-wchart">' + weightChart(pts) + '</div>' +
        W.legend([["Messung", "#D8D8D8"], ["Trend", "#1A1A1A"], ["Korridor", "rgba(46,125,50,.45)"]]) +
        '<div class="wfc">In 4 Wochen (' + fmtDate(fc.date).slice(0, 6) + '): Ziel ≈ <b>' + kgStr(fc.ziel) + ' kg</b> · Korridor ' +
        kgStr(fc.lo) + '–' + kgStr(fc.hi) + '</div>';
    }
  }

  var open = W.isMore("weight");
  h += '<button type="button" class="wt-more' + (open ? " open" : "") + '" onclick="tlWerte.more(\'weight\')">Messungen, Korridor &amp; Startpunkt<span>' + (open ? "▾" : "▸") + '</span></button>';
  if (open) {
    if (cur) {
      var vCls, verdict;
      if (rate === null) { vCls = "slow"; verdict = "Noch zu wenig Daten für eine belastbare Rate. Ab etwa 3 Wochen bzw. 6 Messungen wird die Trendlinie tragfähig – bis dahin sagen einzelne Werte mehr über Wasserhaushalt und Darminhalt als über Muskelaufbau."; }
      else if (rate < 0) { vCls = "fast"; verdict = "<strong>Trend fällt.</strong> Bei laufendem Aufbau spricht das für ein Kaloriendefizit – Zufuhr über eine Woche gegenprüfen, bevor du nachjustierst."; }
      else if (rate < W_MIN) { vCls = "slow"; verdict = "<strong>Unter dem Korridor.</strong> Hält das über 2–3 Wochen an, Zufuhr um 100–150 kcal anheben – der Überschuss ist rechnerisch zu knapp für spürbaren Aufbau."; }
      else if (rate <= W_MAX) { vCls = "ok"; verdict = "<strong>Im Zielkorridor.</strong> Rund " + fmtNum(rate * 4.35, 2) + " kg/Monat – in dieser Größenordnung bleibt der Fettanteil am Zuwachs klein. Kurs halten."; }
      else { vCls = "fast"; verdict = "<strong>Über dem Korridor.</strong> Oberhalb von " + fmtNum(W_MAX, 2) + " kg/Woche wandert ein wachsender Anteil in Fettmasse, weil die Muskelproteinsynthese die Obergrenze bildet – nicht die Kalorienzufuhr. Überschuss um 100–150 kcal senken."; }
      h += '<div class="wverdict ' + vCls + '">' + verdict + '</div>' + startBanner(cur.trend);
    } else {
      h += startBanner(null);
    }
    if (allPts.length) {
      h += '<div class="wlist"><div class="dl2">LETZTE MESSUNGEN</div>' + allPts.slice(-14).reverse().map(function (p) {
        var pend = typeof wPendingDel !== "undefined" && wPendingDel === p.id;
        return '<div class="wrow"><div class="wrow-d">' + fmtDate(p.date) + '</div><div class="wrow-kg">' + kgStr(p.kg) + ' kg</div>' +
          '<div class="wrow-tr">Trend ' + kgStr(p.trend) + '</div>' +
          '<button class="dbtn ' + (pend ? "confirm" : "") + '" onclick="delWeight(' + p.id + ')">' + (pend ? "✓" : "×") + '</button></div>';
      }).join("") + '</div>';
    }
    h += '<div class="wnote">Immer unter gleichen Bedingungen wiegen: morgens, nüchtern, nach dem Toilettengang, vor dem Trinken. Die Trendlinie glättet Tagesschwankungen über eine Zeitkonstante von ' + W_TAU +
      ' Tagen – nur sie zählt, nicht der Einzelwert.<br><br>Zielkorridor Lean Bulk: <strong>' + fmtNum(W_MIN, 2) + '–' + fmtNum(W_MAX, 2) + ' kg/Woche</strong>, Ziel ' + fmtNum(W_ZIEL, 1) +
      '. Gewichtsdaten sind im CSV-Export im Log-Tab enthalten.</div>' + startEditor();
  }
  h += '</div>';
  slot.innerHTML = S.focus && !S.weighOpen && W.isShown("weight") ? W.foldable(h, "weight") : h;
}

var CSS = [
  ".wt-wrow { display:flex; gap:8px; }",
  ".wt-wrow input { flex:1; min-width:0; margin-bottom:0; }",
  ".wt-wchart { margin-top:12px; }",
  ".wt-card .wfc { padding:6px 0 0; }",
  ".wt-card .wverdict, .wt-card .wstart, .wt-card .wset { margin:12px 0 0; }",
  ".wt-card .wnote { margin:12px 0 0; background:var(--bg); }",
  ".wt-card .wlist { padding:14px 0 0; }"
].join("\n");

function init() {
  var slot = document.getElementById("d-weightsec");
  /* Nur mit der neuen daily.js (Kartenplatz statt altem Formular) */
  if (!slot || !slot.classList.contains("wt-wrap")) return;
  var wv = document.getElementById("view-weight");
  Array.prototype.slice.call(wv.children).forEach(function (el) {
    if (el.classList.contains("sec") || el.id === "weight-cont") el.remove();   // altes Formular und alter Inhalt
  });
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  window.buildWeight = build;
  /* Nach dem Speichern Eingabe schließen */
  var origSave = window.saveWeight;
  if (typeof origSave === "function") {
    window.saveWeight = function () {
      var r = origSave.apply(this, arguments);
      if (window.tlWerte && tlWerte.isEdit("weight")) tlWerte.edit("weight", false);
      return r;
    };
  }
  document.addEventListener("tl:werte", build);
  build();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
