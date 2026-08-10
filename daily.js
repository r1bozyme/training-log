// ═══════════════════════════════════════════════════
// DAILY – Kalorien-Haken + Morgensteifigkeit
// Stand: 10. August 2026
//
// Eigenständiges Modul, wird von plan.js nachgeladen.
// Injiziert CSS + Markup selbst in den Werte-Tab und
// erweitert showView() sowie exportCSV().
//
// Bewusst minimal gehalten: kein Zahlenfeld für Kalorien
// (das wäre Tracking durch die Hintertür), keine Makros,
// kein Mahlzeiten-Log.
//
// Steifigkeit: Primärgröße ist die Bewertung 0–10 auf den
// ersten ~20 Schritten – immer dieselbe Belastung,
// unabhängig vom weiteren Morgenablauf. Die Minutenangabe
// ist optional und nur für den Arzttermin gedacht (VISA-A
// fragt danach), weil sie vom Tagesablauf verwässert wird.
//
// NEU 10.08.: Jedes Rating bekommt mit ratedAt einen vollen
// Zeitstempel (ISO). Grund: die Skala ist nur dann über die
// Tage vergleichbar, wenn sie im selben Fenster nach dem
// Aufstehen erhoben wird. Ein abends nachgetragener Wert
// misst nicht dasselbe wie einer um 6:30 und zieht den
// 7-Tage-Schnitt nach unten. Die Uhrzeit macht das sichtbar,
// statt es zu verstecken.
//
// Deep-Link: ?v=weight öffnet direkt den Werte-Tab und
// springt zur Skala (für Wecker-/Automations-Notification).
// ═══════════════════════════════════════════════════

(function () {

// ─── STORAGE ──────────────────────────────────────
window.loadDaily = function () {
  try { return JSON.parse(localStorage.getItem("tl-d") || "[]"); } catch { return []; }
};
function saveDailyArr(arr) { localStorage.setItem("tl-d", JSON.stringify(arr)); }

function dailyDate() {
  const el = document.getElementById("d-date");
  return (el && el.value) || todayStr();
}
function getDay(date) { return loadDaily().find(d => d.date === date) || null; }

function putDay(date, patch) {
  const arr = loadDaily();
  const i = arr.findIndex(d => d.date === date);
  if (i >= 0) arr[i] = Object.assign({}, arr[i], patch);
  else arr.push(Object.assign({ date: date, kcal: null, rate: null, ratedAt: null, stiff: null }, patch));
  arr.sort((a, b) => a.date < b.date ? -1 : 1);
  saveDailyArr(arr);
}

// ─── AKTIONEN ───────────────────────────────────
window.setKcal = function (state) {
  const date = dailyDate();
  const cur  = getDay(date);
  const next = (cur && cur.kcal === state) ? null : state;   // nochmal tippen = zurücksetzen
  putDay(date, { kcal: next });
  buildDaily();
  showFlash(next === null ? "Zurückgesetzt" : "Gespeichert ✓");
};

window.setRate = function (v) {
  const date = dailyDate();
  const cur  = getDay(date);
  const next = (cur && cur.rate === v) ? null : v;   // nochmal tippen = zurücksetzen

  // Zeitstempel nur setzen, wenn der Eintrag heute für heute erfolgt.
  // Wird ein zurückliegendes Datum nachgepflegt, wäre die aktuelle Uhrzeit
  // irreführend – dann bleibt ratedAt leer und die Zeile zeigt "nachgetragen".
  let stamp = null;
  if (next !== null) stamp = (date === todayStr()) ? new Date().toISOString() : "manual";

  putDay(date, { rate: next, ratedAt: stamp });
  buildDaily();
  showFlash(next === null ? "Zurückgesetzt" : "Gespeichert ✓");
};

window.saveStiff = function () {
  const date = dailyDate();
  const raw  = document.getElementById("d-stiff").value;
  if (raw === "") { putDay(date, { stiff: null }); buildDaily(); showFlash("Zurückgesetzt"); return; }
  const min = parseInt(raw, 10);
  if (isNaN(min) || min < 0) { showFlash("Minuten eintragen"); return; }
  putDay(date, { stiff: min });
  buildDaily();
  showFlash("Gespeichert ✓");
};

// ─── HELFER ────────────────────────────────────
function dayDiff(a, b) {
  return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
}
function lastNDays(n, ref) {
  const out = [], base = new Date((ref || todayStr()) + "T12:00:00");
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}
function pad2(n) { return (n < 10 ? "0" : "") + n; }

// Minuten seit Mitternacht aus einem ratedAt-Stempel, sonst null
function stampMinutes(iso) {
  if (!iso || iso === "manual") return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.getHours() * 60 + d.getMinutes();
}
function fmtClock(iso) {
  if (iso === "manual") return "nachgetragen";
  const m = stampMinutes(iso);
  if (m === null) return "";
  return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
}

// ─── RENDER ────────────────────────────────────
window.buildDaily = function () {
  const date = dailyDate();
  const day  = getDay(date);
  const all  = loadDaily();

  // ── Kalorien-Haken ──
  ["under", "hit", "over"].forEach(st => {
    const b = document.getElementById("dc-" + st);
    if (b) b.className = "dsbtn" + (day && day.kcal === st ? " on-" + st : "");
  });

  const win  = lastNDays(14, date);
  const dots = win.map(d => {
    const e = all.find(x => x.date === d);
    return `<div class="ddot ${e && e.kcal ? e.kcal : ""}"></div>`;
  }).join("");

  const logged = win.filter(d => { const e = all.find(x => x.date === d); return e && e.kcal; });
  const nHit   = logged.filter(d => all.find(x => x.date === d).kcal === "hit").length;

  let kHint;
  if (logged.length < 5) {
    kHint = `Noch zu wenige Tage erfasst. Die Woche zählt, nicht der Einzeltag – ein Tag unter Ziel ist ohne Bedeutung, wenn die Wochensumme stimmt.`;
  } else if (nHit / logged.length >= 0.7) {
    kHint = `<strong>${nHit} von ${logged.length}</strong> erfassten Tagen im Ziel. Das trägt – der Gewichtstrend ist der Gegencheck.`;
  } else {
    kHint = `Nur <strong>${nHit} von ${logged.length}</strong> erfassten Tagen im Ziel. Wenn der Gewichtstrend gleichzeitig flach liegt, ist die Zufuhr die Ursache, nicht das Training.`;
  }

  const dcc = document.getElementById("dc-cont");
  if (dcc) dcc.innerHTML = `<div class="ddots">${dots}</div><div class="dhint">${kHint}</div>`;

  // ── Morgensteifigkeit: Bewertung 0–10 (Primärgröße) ──
  for (let v = 0; v <= 10; v++) {
    const b = document.getElementById("dr-" + v);
    if (b) b.className = "drbtn" + (day && day.rate === v ? " on" : "");
  }

  const sEl = document.getElementById("d-stiff");
  if (sEl) sEl.value = (day && typeof day.stiff === "number") ? day.stiff : "";

  const rateAll = all.filter(d => typeof d.rate === "number").sort((a, b) => a.date < b.date ? -1 : 1);
  let sHtml;

  if (!rateAll.length) {
    sHtml = `<div class="dhint">Direkt nach dem Aufstehen auf den ersten ~20 Schritten bewerten. 0 = nichts zu spüren, 10 = maximal steif. Immer dieselbe Belastung, unabhängig davon, wie der Morgen weiterläuft – das ist der Grund für die Skala statt der Uhr.</div>`;
  } else {
    const cur7  = rateAll.filter(d => dayDiff(d.date, date) >= 0 && dayDiff(d.date, date) < 7);
    const prev7 = rateAll.filter(d => dayDiff(d.date, date) >= 7 && dayDiff(d.date, date) < 14);
    const avg   = a => a.length ? a.reduce((s, d) => s + d.rate, 0) / a.length : null;
    const a1 = avg(cur7), a2 = avg(prev7);
    const delta = (a1 !== null && a2 !== null) ? a1 - a2 : null;

    let dCls = "", dStr = "–", verdict;
    if (delta === null) {
      verdict = `Ab zwei vollen Wochen wird der Vergleich tragfähig. Bis dahin sammeln.`;
    } else if (delta <= -0.5) {
      dCls = "good"; dStr = fmtNum(delta, 1);
      verdict = `<strong>Fallend.</strong> Die Last passt – 24-Stunden-Regel erfüllt. Bleibt der 7-Tage-Schnitt mehrere Tage unter 2, darf das Gewicht hoch.`;
    } else if (delta >= 0.5) {
      dCls = "warn"; dStr = "+" + fmtNum(delta, 1);
      verdict = `<strong>Steigend.</strong> Die letzte Einheit war zu viel – Gewicht oder Satzzahl beim nächsten Mal zurücknehmen.`;
    } else {
      dStr = (delta >= 0 ? "+" : "") + fmtNum(delta, 1);
      verdict = `<strong>Konstant.</strong> Last ist tragfähig, aber noch keine Verbesserung. Über 6–8 Wochen ohne Rückgang: erneut orthopädisch vorstellen, Frage nach Sonographie.`;
    }

    // ── Erfassungszeit-Kontrolle ──
    // Die Skala misst nur dann dasselbe, wenn sie im selben Fenster nach dem
    // Aufstehen erhoben wird. Median + Spannweite machen Drift sichtbar.
    const recent = rateAll.slice(-7).reverse();
    const mins = recent.map(d => stampMinutes(d.ratedAt)).filter(m => m !== null).sort((a, b) => a - b);
    let tHint = "";
    if (mins.length >= 3) {
      const med  = mins[Math.floor(mins.length / 2)];
      const span = mins[mins.length - 1] - mins[0];
      const late = mins.filter(m => m > 600).length;
      const hhmm = m => pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
      tHint = `<div class="dhint">Erfassung im Median um <strong>${hhmm(med)}</strong>, Spannweite ${hhmm(mins[0])}–${hhmm(mins[mins.length - 1])}.`;
      if (late >= 2) {
        tHint += ` <strong>${late} der letzten ${mins.length} Ratings entstanden nach 10 Uhr.</strong> So spät ist die Morgensteifigkeit meist abgeklungen – der 7-Tage-Schnitt liegt dann systematisch zu niedrig und der Δ-Vergleich wird unbrauchbar.`;
      } else if (span > 180) {
        tHint += ` Die Spannweite von über drei Stunden schwächt den Vergleich – gleiche Uhrzeit ist wichtiger als die exakte Zahl.`;
      } else {
        tHint += ` Enges Zeitfenster – die Werte sind untereinander vergleichbar.`;
      }
      tHint += `</div>`;
    }

    sHtml = `<div class="dkpi">
      <div class="dkc"><div class="dkn ${a1 !== null && a1 < 2 ? "good" : ""}">${a1 === null ? "–" : fmtNum(a1, 1)}</div><div class="dkl">Ø 7 Tage</div></div>
      <div class="dkc"><div class="dkn">${a2 === null ? "–" : fmtNum(a2, 1)}</div><div class="dkl">Ø Vorwoche</div></div>
      <div class="dkc"><div class="dkn ${dCls}">${dStr}</div><div class="dkl">Δ</div></div>
    </div>
    <div class="dhint">${verdict}</div>
    ${tHint}
    <div style="margin-top:12px">
      ${recent.map(d => {
        const m = all.find(x => x.date === d.date);
        const mins2 = m && typeof m.stiff === "number" ? ` · ${m.stiff} Min` : "";
        const clock = fmtClock(d.ratedAt);
        const cls   = (d.ratedAt === "manual" || !d.ratedAt) ? "dsrow-t dim" : "dsrow-t";
        return `<div class="dsrow"><div class="dsrow-d">${fmtDate(d.date)}</div><div class="dsrow-v">${d.rate}/10${mins2}</div><div class="${cls}">${clock || "–"}</div></div>`;
      }).join("")}
    </div>`;
  }

  const dsc = document.getElementById("ds-cont");
  if (dsc) dsc.innerHTML = sHtml;
};

// ─── CSS ───────────────────────────────────────
const CSS = `
.dsec { margin: 12px 20px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
.dsub { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; }
.dstates { display: flex; gap: 8px; }
.dsbtn { flex: 1; padding: 12px 0; border-radius: 10px; border: 2px solid var(--border); background: transparent; font-family: var(--fb); font-weight: 700; font-size: 12px; color: var(--muted); cursor: pointer; transition: all .15s; }
.dsbtn.on-under { border-color: #E8A33D; color: #B87A15; background: #FDF3E4; }
.dsbtn.on-hit   { border-color: #4FA34F; color: #2A7A2A; background: #E8F4E8; }
.dsbtn.on-over  { border-color: #D96A6A; color: #B33A3A; background: #FBE9E9; }
.drow2 { display: flex; gap: 8px; }
.drow2 input { flex: 1; margin-bottom: 0; }
.dsave { padding: 14px 22px; border-radius: 10px; border: none; background: var(--text); color: #FFF; font-family: var(--fb); font-weight: 700; font-size: 13px; cursor: pointer; flex-shrink: 0; }
.dkpi { display: flex; gap: 8px; margin-top: 12px; }
.dkc { flex: 1; text-align: center; padding: 10px 4px; background: var(--bg); border-radius: 8px; }
.dkn { font-family: var(--fd); font-size: 24px; line-height: 1; color: var(--text); }
.dkn.good { color: #2A7A2A; }
.dkn.warn { color: #B33A3A; }
.dkl { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 1px; margin-top: 4px; text-transform: uppercase; }
.ddots { display: flex; gap: 4px; margin-top: 12px; flex-wrap: wrap; }
.ddot { width: 20px; height: 20px; border-radius: 5px; background: var(--bg); border: 1px solid var(--border); }
.ddot.under { background: #E8A33D; border-color: #E8A33D; }
.ddot.hit   { background: #4FA34F; border-color: #4FA34F; }
.ddot.over  { background: #D96A6A; border-color: #D96A6A; }
.dhint { font-size: 12px; color: var(--muted); line-height: 1.6; margin-top: 12px; }
.dhint strong { color: var(--text); font-weight: 700; }
.dsrow { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.dsrow:last-child { border-bottom: none; }
.dsrow-d { font-size: 12px; color: var(--muted); width: 82px; flex-shrink: 0; font-weight: 600; }
.dsrow-v { font-size: 14px; font-weight: 700; flex: 1; }
.dsrow-t { font-size: 12px; color: var(--muted); font-weight: 600; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.dsrow-t.dim { color: var(--dim); font-weight: 500; font-size: 11px; }
.drscale { display: flex; gap: 3px; }
.drbtn { flex: 1; padding: 11px 0; border-radius: 7px; border: 1.5px solid var(--border); background: transparent; font-family: var(--fb); font-weight: 700; font-size: 12px; color: var(--muted); cursor: pointer; transition: all .12s; min-width: 0; }
.drbtn.on { border-color: var(--text); background: var(--text); color: #FFF; }
.drends { display: flex; justify-content: space-between; font-size: 10px; color: var(--dim); font-weight: 600; margin-top: 6px; }
.dmin { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.dminl { font-size: 10px; color: var(--muted); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
.dhead { display: flex; align-items: center; gap: 10px; margin: 30px 20px 12px; }
.dhead.first { margin-top: 22px; }
.dhl { font-family: var(--fd); font-size: 21px; letter-spacing: 2px; color: var(--text); }
.dhline { flex: 1; height: 1px; background: var(--border); }
.ddate { display: flex; align-items: center; gap: 12px; margin: 0 20px 12px; }
.ddate label { font-size: 10px; color: var(--muted); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; flex-shrink: 0; }
.ddate input { flex: 1; margin-bottom: 0; }
.dsec.flash { animation: dflash 1.4s ease-out; }
@keyframes dflash { 0%, 60% { box-shadow: 0 0 0 2px var(--text); } 100% { box-shadow: 0 0 0 0 transparent; } }
`;

const MARKUP = `
<div class="dhead first"><div class="dhl">TÄGLICH</div><div class="dhline"></div></div>
<div class="ddate">
  <label for="d-date">Datum</label>
  <input type="date" id="d-date" onchange="buildDaily()">
</div>
<div class="dsec">
  <div class="dsub">Kalorienziel</div>
  <div class="dstates">
    <button class="dsbtn" id="dc-under" onclick="setKcal('under')">darunter</button>
    <button class="dsbtn" id="dc-hit"   onclick="setKcal('hit')">Ziel</button>
    <button class="dsbtn" id="dc-over"  onclick="setKcal('over')">darüber</button>
  </div>
  <div id="dc-cont"></div>
</div>
<div class="dsec" id="d-stiffsec">
  <div class="dsub">Morgensteifigkeit Achillessehne</div>
  <div class="drscale">
    ${[0,1,2,3,4,5,6,7,8,9,10].map(v => `<button class="drbtn" id="dr-${v}" onclick="setRate(${v})">${v}</button>`).join("")}
  </div>
  <div class="drends"><span>0 = nichts</span><span>10 = maximal</span></div>
  <div id="ds-cont"></div>
  <div class="dmin">
    <div class="dminl">Optional: Dauer in Minuten (für den Arzttermin)</div>
    <div class="drow2">
      <input type="number" id="d-stiff" placeholder="Minuten" inputmode="numeric" step="1" min="0">
      <button class="dsave" onclick="saveStiff()">OK</button>
    </div>
  </div>
</div>
<div class="dhead"><div class="dhl">GEWICHT</div><div class="dhline"></div></div>
`;

// ─── INIT ──────────────────────────────────────
function init() {
  const view = document.getElementById("view-weight");
  if (!view || document.getElementById("d-date")) return;

  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  const wrap = document.createElement("div");
  wrap.innerHTML = MARKUP;
  view.insertBefore(wrap, view.firstChild);

  document.getElementById("d-date").value = todayStr();

  // Tab heißt nicht mehr nur "Gewicht"
  const nav = document.getElementById("nav-weight");
  if (nav) nav.textContent = "Werte";

  // Wiegen-Block sitzt jetzt unter dem GEWICHT-Kopf – oberen Abstand rausnehmen
  const wSec = view.querySelector(".sec");
  if (wSec) wSec.style.paddingTop = "0";

  // showView erweitern
  const origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      origShow(v);
      if (v === "weight") buildDaily();
    };
  }

  // exportCSV erweitern
  const origExport = window.exportCSV;
  if (typeof origExport === "function") {
    window.exportCSV = function () {
      const rows = loadDaily()
        .filter(d => d.kcal || typeof d.rate === "number" || typeof d.stiff === "number")
        .sort((a, b) => a.date < b.date ? -1 : 1);
      if (!rows.length) return origExport();

      const lbl = { under: "darunter", hit: "Ziel", over: "darüber" };
      const extra = "\n\n# TÄGLICH\n" + [
        ["Datum", "Kalorienziel", "Steifigkeit (0-10)", "Uhrzeit", "Steifigkeit (Min)"],
        ...rows.map(d => [
          fmtDate(d.date),
          d.kcal ? lbl[d.kcal] : "",
          typeof d.rate  === "number" ? d.rate  : "",
          fmtClock(d.ratedAt),
          typeof d.stiff === "number" ? d.stiff : ""
        ])
      ].map(r => r.join(",")).join("\n");

      // Original-Export abfangen und Täglich-Sektion anhängen
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        URL.createObjectURL = origCreate;
        return origCreate(new Blob([blob, extra], { type: "text/csv;charset=utf-8" }));
      };
      try { origExport(); } finally { URL.createObjectURL = origCreate; }
    };
  }

  buildDaily();

  // ── Deep-Link: ?v=weight ──
  // Ziel für eine per Wecker/Automations-App ausgelöste Notification:
  // ein Tap landet direkt auf der Skala, nicht auf der Startansicht.
  try {
    const p = new URLSearchParams(location.search);
    if (p.get("v") === "weight") {
      if (typeof window.showView === "function") window.showView("weight");
      const sec = document.getElementById("d-stiffsec");
      if (sec) setTimeout(function () {
        sec.scrollIntoView({ behavior: "smooth", block: "center" });
        sec.classList.add("flash");
        setTimeout(function () { sec.classList.remove("flash"); }, 1600);
      }, 150);
    }
  } catch (e) { /* URLSearchParams nicht verfügbar – unkritisch */ }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
