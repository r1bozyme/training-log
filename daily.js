// ═══════════════════════════════════════════════════
// DAILY – Kalorien-Haken + Morgensteifigkeit
// Stand: 17. September 2026
//
// Eigenständiges Modul, wird von plan.js nachgeladen.
// Injiziert CSS + Markup selbst in den Werte-Tab und
// hört auf den Ansichtswechsel (tl:view) und erweitert exportCSV().
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
// ratedAt (10.08.): Jedes Rating bekommt einen vollen ISO-
// Zeitstempel. Die Skala ist nur über die Tage vergleichbar,
// wenn sie im selben Fenster nach dem Aufstehen erhoben wird.
// Ein abends nachgetragener Wert misst nicht dasselbe wie
// einer um 6:30 und zieht den 7-Tage-Schnitt nach unten.
//
// OFFEN-BAND (10.08.): Deep-Links allein tragen nicht – wenn
// die PWA noch im Hintergrund liegt, holt Android das alte
// Fenster nach vorn, ohne die URL zu laden, und der Parameter
// kommt nie an. Deshalb entscheidet die App selbst, was heute
// fehlt, und zeigt es oben an. Neu berechnet bei jedem
// Sichtbarwerden – inkl. Datumswechsel über Nacht.
//
// GESCHÄTZT (17.09.): Unabhängiger Haken neben dem Kalorien-
// ziel. Markiert Tage mit geschätzten Posten (Bäcker, Restaurant).
// Solche Tage zählen normal für die Ziel-Quote, werden aber im
// Monatsreview aus der Kalibrierung Kalorien vs. Waage genommen.
// Export läuft über sync.js (Spalte "Geschätzt").
//
// REISE (30.09.): Eigener Haken, unabhängig von "Geschätzt".
// Trennt schlechte Ernährung unterwegs von einzelnen Ausnahmen
// zu Hause (Bäcker, Einladung). Beides fällt aus der Kalibrierung
// Kalorien vs. Waage, wird aber getrennt ausgewertet. Regel für
// den Review: ab 2 Reise- oder geschätzten Tagen fällt die Woche
// aus der Wertung. Export: Spalte "Reise" in sync.js.
//
// EINNAHME (03.10.): Ein Haken "Supplements & Medikamente
// genommen" je Tag (Feld sup = ISO-Zeit bzw. "manual" beim
// Nachtragen). Die Erinnerung ~10:00 (remind.js im Daten-Repo,
// Slot "supps") kommt nur, wenn der Haken bis dahin fehlt.
// Export: Spalte "Einnahme" in sync.js.
//
// KARTEN (13.11.): einheitlicher Aufbau nach dem Mockup „Werte-Tab –
// vereinheitlicht“, Werkzeuge in werte.js. Datum mit ‹ ›, Heute-Box mit
// Einnahme-Haken, Reihenfolge Kalorienziel · Steifigkeit · Handgelenk.
// Daten, Keys und Export unverändert.
//
// Deep-Links (Abkürzung, nicht mehr tragende Schicht):
//   ?v=stiff | ?v=weight | ?v=kcal
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
  else arr.push(Object.assign({ date: date, kcal: null, est: false, trip: false, rate: null, ratedAt: null, stiff: null }, patch));
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

window.toggleEst = function () {
  const date = dailyDate();
  const cur  = getDay(date);
  const next = !(cur && cur.est);
  putDay(date, { est: next });
  buildDaily();
  showFlash(next ? "Als geschätzt markiert ✓" : "Markierung entfernt");
};

window.toggleTrip = function () {
  const date = dailyDate();
  const cur  = getDay(date);
  const next = !(cur && cur.trip);
  putDay(date, { trip: next });
  buildDaily();
  showFlash(next ? "Als Reisetag markiert ✓" : "Reise-Markierung entfernt");
};

window.setRate = function (v) {
  const date = dailyDate();
  const cur  = getDay(date);
  const next = (cur && cur.rate === v) ? null : v;   // nochmal tippen = zurücksetzen

  // Zeitstempel nur setzen, wenn der Eintrag heute für heute erfolgt.
  // Wird ein zurückliegendes Datum nachgepflegt, wäre die aktuelle Uhrzeit
  // irreführend – dann steht "nachgetragen" statt einer Zeit.
  let stamp = null;
  if (next !== null) stamp = (date === todayStr()) ? new Date().toISOString() : "manual";

  putDay(date, { rate: next, ratedAt: stamp });
  buildDaily();
  showFlash(next === null ? "Zurückgesetzt" : "Gespeichert ✓");
};

// Handgelenk Daumenseite (1. Strecksehnenfach): 0–10 je Seite, morgens.
// Felder hgL / hgR in tl-d; nochmal tippen = zurücksetzen.
window.setThumb = function (side, v) {
  const date = dailyDate();
  const cur  = getDay(date);
  const key  = side === "L" ? "hgL" : "hgR";
  const next = (cur && cur[key] === v) ? null : v;
  const patch = {}; patch[key] = next;
  putDay(date, patch);
  buildDaily();
  showFlash(next === null ? "Zurückgesetzt" : "Gespeichert ✓");
};

window.toggleSup = function () {
  const date = dailyDate();
  const cur  = getDay(date);
  // Uhrzeit nur, wenn heute fuer heute abgehakt wird (wie bei der Steifigkeit)
  const next = (cur && cur.sup) ? null : (date === todayStr() ? new Date().toISOString() : "manual");
  putDay(date, { sup: next });
  buildDaily();
  showFlash(next ? "Einnahme abgehakt ✓" : "Zurückgesetzt");
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

// ─── OFFEN-BAND ──────────────────────────────────
// Wiegen laut Plan Di + Fr (nuechtern, morgens). Gewichte liegen
// in tl-w – hier nur lesend, das Schreiben bleibt in index.html.
function weighDue(dateStr) {
  const dow = new Date(dateStr + "T12:00:00").getDay();   // 0 = So
  return dow === 2 || dow === 5;
}
function hasWeight(dateStr) {
  try {
    const w = JSON.parse(localStorage.getItem("tl-w") || "[]");
    return w.some(x => x.date === dateStr);
  } catch { return false; }
}

function openItems() {
  const t = todayStr();
  const d = getDay(t);
  const out = [];
  // Reihenfolge = Tagesablauf: morgens Steifigkeit, dann Wiegen, abends Kalorien
  if (!d || typeof d.rate !== "number") out.push({ label: "Steifigkeit", id: "d-stiffsec" });
  if (!d || typeof d.hgL !== "number" || typeof d.hgR !== "number") out.push({ label: "Handgelenk", id: "d-thumbsec" });
  if (weighDue(t) && !hasWeight(t))     out.push({ label: "Wiegen",      id: "d-weightsec" });
  if (!d || !d.sup)                     out.push({ label: "Einnahme",    id: "d-supsec" });
  if (!d || !d.kcal)                    out.push({ label: "Kalorien",    id: "d-kcalsec" });
  return out;
}

window.dailyOpenItems = openItems;   // header.js: Chip im Werte-Tab

// Sprung zu einem Abschnitt; eine zur Zeile geschrumpfte Karte wird dabei aufgeklappt.
const KARTE = { "d-kcalsec": "kcal", "d-weightsec": "weight", "wt-ibsec": "inbody", "d-stiffsec": "stiff", "d-thumbsec": "thumb" };
window.tlJump = function (id) {
  if (KARTE[id] && window.tlWerte && document.querySelector("#" + id + " .wt-mini")) tlWerte.show(KARTE[id]);
  const sec = document.getElementById(id);
  if (!sec) return;
  sec.scrollIntoView({ behavior: "smooth", block: "center" });
  sec.classList.add("dflash");
  setTimeout(function () { sec.classList.remove("dflash"); }, 1700);
};

window.jumpOpen = function () {
  const items = openItems();
  if (items.length) tlJump(items[0].id);
};

// ─── WERTE-KARTEN (13.11.: einheitlicher Aufbau, werte.js) ───
// Gruppen Energiebilanz (Kalorienziel · Gewicht [gewicht.js] · InBody
// [inbody.js]) und Sehnen (Steifigkeit · Handgelenk), Diagnose als Zeile.
// Jede Karte: Kennzahl Ø 7 Tage mit Vorwoche, Zeile „Heute“ mit ✎,
// Verlauf (Zeitraum oben), aufklappbare Einzelwerte & Erläuterung.
// Fehlt morgens Steifigkeit oder Handgelenk, steht die Skala direkt in
// der Karte und die übrigen Karten schrumpfen auf eine Zeile. Offene Karten
// zeigen morgens nur Kennzahl und Eingabe (kompakt), Graph und Einzelwerte
// kommen zurück, sobald alles erfasst ist.
const WTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
function longDate(s) { const d = new Date(s + "T12:00:00"); return WTAGE[d.getDay()] + ", " + d.getDate() + ". " + MONATE[d.getMonth()]; }

window.tlDailyShift = function (n) {
  const el = document.getElementById("d-date");
  if (!el) return;
  const t = todayStr();
  let v = window.tlWerte ? tlWerte.addDays(dailyDate(), n) : t;
  if (v > t) v = t;
  el.value = v;
  buildDaily();
};

function supLabel(day) {
  return "✓ Supplements " + (day.sup === "manual" ? "nachgetragen" : fmtClock(day.sup));
}

function buildTodo() {
  const el = document.getElementById("d-todo");
  if (!el) return;
  const t = todayStr(), date = dailyDate(), day = getDay(date);
  const supOn = !!(day && day.sup);
  const supOk  = `<button type="button" id="d-supsec" class="dsupok" onclick="event.stopPropagation();toggleSup()">${supOn ? supLabel(day) : ""}</button>`;
  const supBtn = `<button type="button" id="d-supsec" class="dsupbtn" onclick="event.stopPropagation();toggleSup()">Supplements &amp; Medikamente abhaken</button>`;

  if (date !== t) {
    el.className = "dtodo past";
    el.onclick = null;
    el.innerHTML = `<div class="dtrow"><span class="dtl">Nachtragen</span><span class="dtv">${fmtDate(date)}</span>`
      + `<button type="button" class="dtback" onclick="event.stopPropagation();tlDailyShift(9999)">Zu heute</button></div>`
      + (supOn ? `<div class="dtsup">${supOk}</div>` : supBtn);
    return;
  }
  const items = openItems().filter(i => i.label !== "Einnahme");
  if (!items.length && supOn) {
    el.className = "dtodo done";
    el.onclick = null;
    el.innerHTML = `<div class="dtrow"><span class="dtl">Heute vollständig</span><span class="dtv"></span>${supOk}</div>`;
    return;
  }
  el.className = "dtodo" + (items.length ? "" : " done");
  el.onclick = items.length ? window.jumpOpen : null;
  el.innerHTML = (items.length
      ? `<div class="dtrow"><span class="dtl">Heute offen</span><span class="dtv">${items.map(i => `<button type="button" class="dtj" onclick="event.stopPropagation();tlJump('${i.id}')">${i.label}</button>`).join(" · ")}</span><span class="dta">→</span></div>`
      : "")
    + (supOn ? `<div class="dtsup">${supOk}</div>` : supBtn);
}

function sign1(x) { return (x >= 0 ? "+" : "−") + fmtNum(Math.abs(x), 1); }
// Farbe nach dem angezeigten (gerundeten) Wert, sonst stünde „−0,5“ ungefärbt da
function deltaCls(dl) { if (dl === null) return ""; const r = Math.round(dl * 10) / 10; return r <= -0.5 ? "good" : r >= 0.5 ? "warn" : ""; }
function scale(prefix, cur, fn) {
  return `<div class="drscale">${[0,1,2,3,4,5,6,7,8,9,10].map(v =>
    `<button class="drbtn${cur === v ? " on" : ""}" id="${prefix}-${v}" onclick="${fn}(${v})">${v}</button>`).join("")}</div>`;
}
function moreBtn(key, label) {
  const on = tlWerte.isMore(key);
  return `<button type="button" class="wt-more${on ? " open" : ""}" onclick="tlWerte.more('${key}')">${label}<span>${on ? "▾" : "▸"}</span></button>`;
}
function todayRow(label, value, dim, edKey, edTitle) {
  return `<div class="wt-today"><div class="wt-tl">${label}</div><div class="wt-tv${dim ? " dim" : ""}">${value}</div>`
    + (edKey ? `<button type="button" class="wt-ed" aria-label="${edTitle}" onclick="tlWerte.edit('${edKey}')">${tlWerte.isEdit(edKey) ? "✕" : "✎"}</button>` : "")
    + `</div>`;
}
function mini(key, label, text, warn) {
  return `<div class="wt-mini" onclick="tlWerte.show('${key}')"><div class="wt-lbl">${label}</div><div class="wt-mv${warn ? " warn" : ""}">${text}</div><span>▸</span></div>`;
}
function avgWin(arr, key, date, lo, hi) {
  const v = arr.filter(d => typeof d[key] === "number" && dayDiff(d.date, date) >= lo && dayDiff(d.date, date) < hi).map(d => d[key]);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ─── RENDER ────────────────────────────────────
window.buildDaily = function () {
  const date = dailyDate();
  const day  = getDay(date);
  const all  = loadDaily();
  const t    = todayStr();
  const isToday = date === t;
  const W = window.tlWerte;

  // ── Datum ‹ › ──
  const dl = document.getElementById("wt-dtl");
  if (dl) dl.textContent = longDate(date);
  const dt = document.getElementById("wt-dt");
  if (dt) dt.className = "wt-dt" + (isToday ? "" : " past");
  const di = document.getElementById("d-date");
  if (di) di.max = t;
  const nx = document.getElementById("wt-next");
  if (nx) nx.disabled = isToday;
  const rg = document.getElementById("wt-range");
  if (rg && W) rg.innerHTML = W.rangeRow();

  buildTodo();
  if (!W) return;

  const stiffOpen = !(day && typeof day.rate === "number");
  const thumbOpen = !(day && typeof day.hgL === "number" && typeof day.hgR === "number");
  const weighOpen = isToday && weighDue(t) && !hasWeight(t);
  const focus = isToday && (stiffOpen || thumbOpen || weighOpen);
  // Zustand für die übrigen Karten (gewicht.js, inbody.js, diag.js)
  window.tlWerteState = function () { return { date: date, isToday: isToday, focus: focus, weighOpen: weighOpen, sehnenOpen: isToday && (stiffOpen || thumbOpen) }; };
  if (!focus) W.resetShown();
  const isMini = (k, open) => focus && !open && !W.isShown(k);
  const fold = (html, k, open) => focus && !open && W.isShown(k) ? W.foldable(html, k) : html;
  const lab = isToday ? "Heute" : fmtDate(date).slice(0, 6);

  // ══ Kalorienziel ══
  const KL = { under: "darunter", hit: "Ziel", over: "darüber" };
  const byDate = {}; all.forEach(d => { byDate[d.date] = d; });
  const dow = new Date(date + "T12:00:00").getDay();
  const mon0 = W.addDays(date, -((dow + 6) % 7));
  // Zeilen folgen dem Zeitraum oben: 1M = 5 Wochen, 3M = 13, Alles = ab der ersten Erfassung
  const firstK = all.filter(d => d.kcal).map(d => d.date).sort()[0];
  let nW = W.range() === 30 ? 5 : W.range() === 90 ? 13 : 4;
  if (W.range() === 0 && firstK) {
    const monF = W.addDays(firstK, -((new Date(firstK + "T12:00:00").getDay() + 6) % 7));   // Montag der ersten Woche
    nW = Math.max(1, Math.round(dayDiff(monF, mon0) / 7) + 1);
  }
  const weeks = []; for (let k = nW - 1; k >= 0; k--) weeks.push(W.addDays(mon0, -7 * k));
  const kw = s => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
                    const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); };
  let kHit = 0, kLog = 0;
  let grid = `<div></div>${"MDMDFSS".split("").map(c => `<div class="wt-wk c">${c}</div>`).join("")}<div></div>`;
  weeks.forEach((mo, wi) => {
    const cur = wi === weeks.length - 1;
    let hit = 0, mark = 0, cells = "";
    for (let i = 0; i < 7; i++) {
      const d = W.addDays(mo, i), e = byDate[d] || {};
      if (e.kcal) { if (!cur) { kLog++; if (e.kcal === "hit") kHit++; } if (e.kcal === "hit") hit++; }
      if (e.est || e.trip) mark++;
      const cls = d > t ? "fut" : [e.kcal || "", e.est ? "est" : "", e.trip ? "trip" : "", d === date ? "sel" : ""].join(" ");
      cells += `<div class="wt-c ${cls}"></div>`;
    }
    const tag = cur ? `<div class="wt-wk">läuft</div>`
      : `<div class="wt-wk${mark >= 2 ? " warn" : hit >= 5 ? " good" : ""}">${hit}/7 im Ziel</div>`;
    grid += `<div class="wt-wk">KW ${kw(mo)}</div>${cells}${tag}`;
  });
  const kState = day && day.kcal
    ? KL[day.kcal] + (day.est ? " · geschätzt" : "") + (day.trip ? " · Reise" : "")
    : (day && (day.est || day.trip) ? [day.est ? "geschätzt" : "", day.trip ? "Reise" : ""].filter(Boolean).join(" · ") + " · noch offen"
       : isToday ? "abends über „Tag abschließen“" : "nicht gesetzt");

  let kHint;
  {
    const win = lastNDays(14, date);
    const logged = win.filter(d => byDate[d] && byDate[d].kcal);
    const nHit = logged.filter(d => byDate[d].kcal === "hit").length;
    if (logged.length < 5) kHint = `Noch zu wenige Tage erfasst. Die Woche zählt, nicht der Einzeltag – ein Tag unter Ziel ist ohne Bedeutung, wenn die Wochensumme stimmt.`;
    else if (nHit / logged.length >= 0.7) kHint = `<strong>${nHit} von ${logged.length}</strong> erfassten Tagen der letzten zwei Wochen im Ziel. Das trägt – der Gewichtstrend ist der Gegencheck.`;
    else kHint = `Nur <strong>${nHit} von ${logged.length}</strong> erfassten Tagen der letzten zwei Wochen im Ziel. Wenn der Gewichtstrend gleichzeitig flach liegt, ist die Zufuhr die Ursache, nicht das Training.`;
  }
  const kEd = W.isEdit("kcal");
  const kcalHtml = isMini("kcal", false)
    ? mini("kcal", "Kalorienziel", kLog ? `${kHit} / ${kLog} im Ziel` : "–")
    : `<div class="wt-card">
        <div class="wt-hd"><div class="wt-lbl">Kalorienziel</div><div class="wt-k">
          <span class="wt-kv">${kLog ? kHit + " / " + kLog : "–"}</span>
          <div class="wt-sub">Tage im Ziel · ${weeks.length > 1 ? (W.range() === 0 ? "seit KW " + kw(weeks[0]) : "letzte " + (weeks.length - 1) + " Wochen") : "laufende Woche"}</div></div></div>
        ${todayRow(lab, kState, !(day && day.kcal), "kcal", "Kalorienziel setzen")}
        ${kEd ? `<div class="wt-in">
          <div class="dstates">${["under", "hit", "over"].map(k =>
            `<button class="dsbtn${day && day.kcal === k ? " on-" + k : ""}" id="dc-${k}" onclick="setKcal('${k}')">${KL[k]}</button>`).join("")}</div>
          <button class="destbtn${day && day.est ? " on" : ""}" id="dc-est" onclick="toggleEst()">Werte teilweise geschätzt</button>
          <button class="destbtn trip${day && day.trip ? " on" : ""}" id="dc-trip" onclick="toggleTrip()">Reisetag</button>
          <button type="button" class="wt-done" onclick="tlWerte.edit('kcal', false)">Fertig</button></div>` : ""}
        <div class="wt-grid">${grid}</div>
        ${W.legend([["Ziel", "#4FA34F"], ["darunter", "#E8A33D"], ["darüber", "#D96A6A"]])}
        ${moreBtn("kcal", "Legende &amp; Erläuterung")}
        ${W.isMore("kcal") ? `<div class="dhint">Gestrichelt = Werte teilweise geschätzt, blauer Rand = Reisetag. Ab 2 markierten Tagen fällt die Woche im Review aus der Kalibrierung Kalorien gegen Waage – ihre Zahl rechts steht dann in Orange statt Grün.</div><div class="dhint">${kHint}</div>` : ""}
      </div>`;
  const kc = document.getElementById("d-kcalsec");
  if (kc) kc.innerHTML = fold(kcalHtml, "kcal", false);

  // ══ Morgensteifigkeit ══
  const rateAll = all.filter(d => typeof d.rate === "number").sort((a, b) => a.date < b.date ? -1 : 1);
  const rv = {}; rateAll.forEach(d => { rv[d.date] = d.rate; });
  const a1 = avgWin(rateAll, "rate", date, 0, 7), a2 = avgWin(rateAll, "rate", date, 7, 14);
  const sDelta = a1 !== null && a2 !== null ? a1 - a2 : null;
  const sEd = stiffOpen || W.isEdit("stiff");
  let verdict;
  if (sDelta === null) verdict = `Ab zwei vollen Wochen wird der Vergleich tragfähig. Bis dahin sammeln.`;
  else if (sDelta <= -0.5) verdict = `<strong>Fallend.</strong> Die Last passt – 24-Stunden-Regel erfüllt. Bleibt der 7-Tage-Schnitt mehrere Tage unter 2, darf das Gewicht hoch.`;
  else if (sDelta >= 0.5) verdict = `<strong>Steigend.</strong> Die letzte Einheit war zu viel – Gewicht oder Satzzahl beim nächsten Mal zurücknehmen.`;
  else verdict = `<strong>Konstant.</strong> Last ist tragfähig, aber noch keine Verbesserung. Über 6–8 Wochen ohne Rückgang: erneut orthopädisch vorstellen, Frage nach Sonographie.`;

  const recent = rateAll.filter(d => d.date <= date).slice(-7).reverse();
  let tHint = "";
  {
    const mins = recent.map(d => stampMinutes(d.ratedAt)).filter(m => m !== null).sort((a, b) => a - b);
    if (mins.length >= 3) {
      const med = mins[Math.floor(mins.length / 2)], span = mins[mins.length - 1] - mins[0], late = mins.filter(m => m > 600).length;
      const hhmm = m => pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
      tHint = `<div class="dhint">Erfassung im Median um <strong>${hhmm(med)}</strong>, Spannweite ${hhmm(mins[0])}–${hhmm(mins[mins.length - 1])}.`;
      if (late >= 2) tHint += ` <strong>${late} der letzten ${mins.length} Ratings entstanden nach 10 Uhr.</strong> So spät ist die Morgensteifigkeit meist abgeklungen – der 7-Tage-Schnitt liegt dann systematisch zu niedrig und der Δ-Vergleich wird unbrauchbar.`;
      else if (span > 180) tHint += ` Die Spannweite von über drei Stunden schwächt den Vergleich – gleiche Uhrzeit ist wichtiger als die exakte Zahl.`;
      else tHint += ` Enges Zeitfenster – die Werte sind untereinander vergleichbar.`;
      tHint += `</div>`;
    }
  }
  const sNow = day && typeof day.rate === "number"
    ? `${day.rate} / 10 · ${fmtClock(day.ratedAt) || "–"}${typeof day.stiff === "number" ? " · " + day.stiff + " Min" : ""}`
    : "noch offen";
  const sChart = rateAll.length
    ? W.graph({ end: date, days: W.range(), label: "Verlauf Morgensteifigkeit",
        series: [{ vals: rv, kind: "raw", color: "#D8D8D8", width: 1.5, name: "Tag" }, { vals: rv, kind: "avg", color: "#1A1A1A", name: "Ø 7" }] })
      + W.legend([["Tageswert", "#D8D8D8"], ["Ø 7 Tage", "#1A1A1A"]])
    : `<div class="dhint">Direkt nach dem Aufstehen auf den ersten ~20 Schritten bewerten. 0 = nichts zu spüren, 10 = maximal steif. Immer dieselbe Belastung, unabhängig davon, wie der Morgen weiterläuft – das ist der Grund für die Skala statt der Uhr.</div>`;
  const stiffHtml = isMini("stiff", stiffOpen)
    ? mini("stiff", "Morgensteifigkeit", a1 === null ? "–" : "Ø " + fmtNum(a1, 1) + (sDelta === null ? "" : " · " + sign1(sDelta)))
    : `<div class="wt-card">
        <div class="wt-hd"><div class="wt-lbl">Morgensteifigkeit</div><div class="wt-k">
          <span class="wt-kv">${a1 === null ? "–" : fmtNum(a1, 1)}</span>${sDelta === null ? "" : `<span class="wt-kd ${deltaCls(sDelta)}">${sign1(sDelta)}</span>`}
          <div class="wt-sub">Ø 7 Tage · Vorwoche ${a2 === null ? "–" : fmtNum(a2, 1)}</div></div></div>
        ${sEd ? `<div class="wt-in">${scale("dr", day ? day.rate : null, "setRate")}
          <div class="drends"><span>0 = nichts</span><span>erste ~20 Schritte</span><span>10 = maximal</span></div>
          ${stiffOpen ? "" : `<button type="button" class="wt-done" onclick="tlWerte.edit('stiff', false)">Fertig</button>`}</div>`
          : todayRow(lab, sNow, false, "stiff", "Steifigkeit ändern")}
        ${focus && stiffOpen ? "" : sChart + moreBtn("stiff", "Einzelwerte &amp; Erläuterung")}
        ${!(focus && stiffOpen) && W.isMore("stiff") ? `<div class="dhint">${verdict}</div>${tHint}
          <div style="margin-top:12px">${recent.map(d => {
            const mins2 = typeof d.stiff === "number" ? ` · ${d.stiff} Min` : "";
            const clock = fmtClock(d.ratedAt);
            const cls = (d.ratedAt === "manual" || !d.ratedAt) ? "dsrow-t dim" : "dsrow-t";
            return `<div class="dsrow"><div class="dsrow-d">${fmtDate(d.date)}</div><div class="dsrow-v">${d.rate}/10${mins2}</div><div class="${cls}">${clock || "–"}</div></div>`;
          }).join("")}</div>
          <div class="dmin">
            <div class="dminl">Optional: Dauer in Minuten (für den Arzttermin)</div>
            <div class="drow2">
              <input type="number" id="d-stiff" placeholder="Minuten" inputmode="numeric" step="1" min="0" value="${day && typeof day.stiff === "number" ? day.stiff : ""}">
              <button class="dsave" onclick="saveStiff()">OK</button>
            </div>
          </div>` : ""}
      </div>`;
  const sc = document.getElementById("d-stiffsec");
  if (sc) sc.innerHTML = fold(stiffHtml, "stiff", stiffOpen);

  // ══ Handgelenk Daumenseite ══
  const hAll = all.filter(d => typeof d.hgL === "number" || typeof d.hgR === "number").sort((a, b) => a.date < b.date ? -1 : 1);
  const hvL = {}, hvR = {};
  hAll.forEach(d => { if (typeof d.hgL === "number") hvL[d.date] = d.hgL; if (typeof d.hgR === "number") hvR[d.date] = d.hgR; });
  const L1 = avgWin(hAll, "hgL", date, 0, 7), L2 = avgWin(hAll, "hgL", date, 7, 14);
  const R1 = avgWin(hAll, "hgR", date, 0, 7), R2 = avgWin(hAll, "hgR", date, 7, 14);
  const dL = L1 !== null && L2 !== null ? L1 - L2 : null, dR = R1 !== null && R2 !== null ? R1 - R2 : null;
  const f = x => x === null ? "–" : fmtNum(x, 1);
  const kSide = (s, v, dd) => `<span class="wt-ks">${s}</span><span class="wt-kv">${f(v)}</span>${dd === null ? "" : `<span class="wt-kd ${deltaCls(dd)}">${sign1(dd)}</span>`}`;
  const vv = x => typeof x === "number" ? x : "–";
  const hEd = thumbOpen || W.isEdit("thumb");
  const anyPrev = L2 !== null || R2 !== null;
  const hNow = day && (typeof day.hgL === "number" || typeof day.hgR === "number") ? `L ${vv(day.hgL)} · R ${vv(day.hgR)}` : "noch offen";
  const hChart = hAll.length
    ? W.graph({ end: date, days: W.range(), label: "Verlauf Handgelenk links und rechts, Ø 7 Tage",
        series: [{ vals: hvL, kind: "avg", color: "#1A1A1A", name: "L" }, { vals: hvR, kind: "avg", color: "#2F6FB0", dash: true, name: "R" }] })
      + W.legend([["Links Ø 7 Tage", "#1A1A1A"], ["Rechts Ø 7 Tage (gestrichelt)", "#2F6FB0"]])
    : `<div class="dhint">Morgens, gleiche Zeit wie die Steifigkeit: Daumen gegen leichten Widerstand der anderen Hand strecken und den Schmerz über dem Griffelfortsatz bewerten. Immer derselbe Test. Bewertet wird der 7-Tage-Trend, nicht der einzelne Tag.</div>`;
  const recentH = hAll.filter(d => d.date <= date).slice(-7).reverse();
  const thumbHtml = isMini("thumb", thumbOpen)
    ? mini("thumb", "Handgelenk", `L ${f(L1)} · R ${f(R1)}`)
    : `<div class="wt-card">
        <div class="wt-hd"><div class="wt-lbl">Handgelenk Daumenseite</div><div class="wt-k">
          ${kSide("L", L1, dL)}${kSide("R", R1, dR)}
          <div class="wt-sub">Ø 7 Tage · Vorwoche ${f(L2)} / ${f(R2)}</div></div></div>
        ${hEd ? `<div class="wt-in">
          <div class="dhside">Links</div>${scale("dhL", day ? day.hgL : null, "setThumb.bind(null,'L')")}
          <div class="dhside">Rechts</div>${scale("dhR", day ? day.hgR : null, "setThumb.bind(null,'R')")}
          <div class="drends"><span>0 = nichts</span><span>10 = maximal</span></div>
          ${thumbOpen ? "" : `<button type="button" class="wt-done" onclick="tlWerte.edit('thumb', false)">Fertig</button>`}</div>`
          : todayRow(lab, hNow, false, "thumb", "Handgelenk ändern")}
        ${focus && thumbOpen ? "" : hChart + moreBtn("thumb", "Einzelwerte &amp; Erläuterung")}
        ${!(focus && thumbOpen) && W.isMore("thumb") ? `<div class="dhint">${anyPrev
            ? `Steigt eine Seite um ≥ 0,5 gegenüber der Vorwoche, war die Belastung zu hoch. Dann die zuletzt geänderte Übung zurücknehmen – immer nur eine Variable pro Einheit.`
            : `Ab zwei vollen Wochen wird der Vergleich tragfähig. Bis dahin sammeln und keine Übung umstellen.`}</div>
          <div style="margin-top:12px">${recentH.map(d =>
            `<div class="dsrow"><div class="dsrow-d">${fmtDate(d.date)}</div><div class="dsrow-v">L ${vv(d.hgL)} · R ${vv(d.hgR)}</div></div>`).join("")}</div>` : ""}
      </div>`;
  const hc = document.getElementById("d-thumbsec");
  if (hc) hc.innerHTML = fold(thumbHtml, "thumb", thumbOpen);

  // Übrige Karten (Gewicht, InBody, Diagnose) mitzeichnen
  document.dispatchEvent(new CustomEvent("tl:werte"));
};

// ─── CSS ───────────────────────────────────────
const CSS = `
.dtodo { margin: 8px 20px 0; padding: 12px 16px; border-radius: 11px; border: 1.5px solid var(--text); background: var(--surface); cursor: pointer; }
.dtodo.done { border-color: var(--border); border-style: dashed; cursor: default; }
.dtodo.past { border-color: #2F5D8A; cursor: default; }
.dtrow { display: flex; align-items: center; gap: 10px; min-height: 22px; }
.dtodo .dtl { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); flex-shrink: 0; }
.dtodo .dtv { font-size: 13.5px; font-weight: 700; color: var(--text); flex: 1; }
.dtj { border: none; background: transparent; padding: 4px 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 3px; }
.dtodo .dta { font-size: 16px; color: var(--muted); flex-shrink: 0; }
.dtodo .dsupbtn { margin-top: 10px; padding: 12px 0; font-size: 13px; }
.dtodo .dtrow + .dsupbtn { margin-top: 10px; }
.dtodo > .dsupbtn:first-child { margin-top: 0; }
.dtsup { display: flex; justify-content: flex-end; margin-top: 4px; }
.dsupok { border: none; background: transparent; padding: 4px 0; font-family: var(--fb); font-weight: 700; font-size: 12px; color: #2A7A2A; cursor: pointer; }
.dtback { padding: 6px 12px; border-radius: 14px; border: 1.5px solid var(--border); background: transparent; font-family: var(--fb); font-weight: 700; font-size: 12px; color: var(--text); cursor: pointer; flex-shrink: 0; }
.wt-wrap.dflash { animation: none; }
.wt-wrap.dflash > * { animation: dflash 1.5s ease-out; }
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
.dkn-d { font-family: var(--fb); font-size: 12px; font-weight: 700; color: var(--muted); }
.dkn-d.good { color: #2A7A2A; }
.dkn-d.warn { color: #B33A3A; }
.dhside { font-size: 10px; color: var(--muted); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 10px 0 6px; }
.dhside:first-of-type { margin-top: 0; }
.dkl { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 1px; margin-top: 4px; text-transform: uppercase; }
.ddots { display: flex; gap: 4px; margin-top: 12px; flex-wrap: wrap; }
.ddot { width: 20px; height: 20px; border-radius: 5px; background: var(--bg); border: 1px solid var(--border); }
.ddot.under { background: #E8A33D; border-color: #E8A33D; }
.ddot.hit   { background: #4FA34F; border-color: #4FA34F; }
.ddot.over  { background: #D96A6A; border-color: #D96A6A; }
.ddot.est   { border: 2px dashed var(--text); }
.ddot.trip  { box-shadow: 0 0 0 2px #2F5D8A; }
.dleg { font-size: 10.5px; color: var(--muted); margin-top: 6px; }
.destbtn.trip.on { border-color: #2F5D8A; color: #2F5D8A; background: #EEF3F9; }
.destbtn { display: block; width: 100%; margin-top: 8px; padding: 9px 0; border-radius: 10px; border: 1.5px dashed var(--border); background: transparent; font-family: var(--fb); font-weight: 600; font-size: 12px; color: var(--muted); cursor: pointer; transition: all .15s; }
.destbtn.on { border-style: solid; border-color: var(--text); color: var(--text); background: var(--bg); }
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
.dsupbtn { display: block; width: 100%; padding: 14px 0; border-radius: 10px; border: 2px solid var(--border); background: transparent; font-family: var(--fb); font-weight: 700; font-size: 13px; color: var(--muted); cursor: pointer; transition: all .15s; }
.dsupbtn.on { border-color: #4FA34F; color: #2A7A2A; background: #E8F4E8; }
.dsupbtn span { font-weight: 600; font-size: 11px; opacity: .8; margin-left: 4px; }
.dflash { animation: dflash 1.5s ease-out; border-radius: 12px; }
@keyframes dflash { 0%, 55% { box-shadow: 0 0 0 2px var(--text); } 100% { box-shadow: 0 0 0 0 transparent; } }
`;

const MARKUP = `
<div class="wt-date">
  <button type="button" aria-label="Vortag" onclick="tlDailyShift(-1)">‹</button>
  <label class="wt-dt" id="wt-dt"><span id="wt-dtl"></span><input type="date" id="d-date" aria-label="Datum wählen" onchange="tlDailyShift(0)"></label>
  <button type="button" id="wt-next" aria-label="Folgetag" onclick="tlDailyShift(1)">›</button>
</div>
<div class="dtodo" id="d-todo"></div>
<div class="wt-range" id="wt-range"></div>
<div class="dhead"><div class="dhl">ENERGIEBILANZ</div><div class="dhline"></div></div>
<div class="wt-wrap" id="d-kcalsec"></div>
<div class="wt-wrap" id="d-weightsec"></div>
<div class="wt-wrap" id="wt-ibsec"></div>
<div class="dhead"><div class="dhl">SEHNEN</div><div class="dhline"></div></div>
<div class="wt-wrap" id="d-stiffsec"></div>
<div class="wt-wrap" id="d-thumbsec"></div>
`;

// ─── INIT ──────────────────────────────────────
function init() {
  // 13.11.: Kommt plan.js noch aus dem Browser-Cache, kennt es werte.js nicht
  // (Karten fehlten, Datum ungestaltet). Dann hier nachladen und neu zeichnen.
  ["werte.js", "gewicht.js"].forEach(function (src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    const ws = document.createElement("script");
    ws.src = src;
    ws.async = false;
    ws.onload = function () { buildDaily(); };
    document.head.appendChild(ws);
  });

  const view = document.getElementById("view-weight");
  if (!view || document.getElementById("d-date")) return;

  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  const wrap = document.createElement("div");
  wrap.innerHTML = MARKUP;
  view.insertBefore(wrap, view.firstChild);

  document.getElementById("d-date").value = todayStr();

  // Gemerkten Zeitraum (werte.js) auch auf den Gewichtsgraphen übertragen
  try {
    if (window.tlWerte && typeof setWRange === "function" && typeof wRange !== "undefined" && wRange !== tlWerte.range()) setWRange(tlWerte.range());
  } catch (e) { /* Gewichtsteil fehlt – unkritisch */ }

  // Gewicht: Kartenplatz d-weightsec im Markup, die Karte zeichnet gewicht.js

  // Ansichtswechsel (view.js)
  document.addEventListener("tl:view", function (e) { if (e.detail.view === "weight") buildDaily(); });

  // saveWeight erweitern – nach dem Wiegen muss das Band nachziehen
  const origSaveW = window.saveWeight;
  if (typeof origSaveW === "function") {
    window.saveWeight = function () { origSaveW.apply(this, arguments); buildDaily(); };
  }

  // exportCSV erweitern
  const origExport = window.exportCSV;
  if (typeof origExport === "function") {
    window.exportCSV = function () {
      const rows = loadDaily()
        .filter(d => d.kcal || typeof d.rate === "number" || typeof d.stiff === "number" || typeof d.hgL === "number" || typeof d.hgR === "number")
        .sort((a, b) => a.date < b.date ? -1 : 1);
      if (!rows.length) return origExport();

      const lbl = { under: "darunter", hit: "Ziel", over: "darüber" };
      const extra = "\n\n# TÄGLICH\n" + [
        ["Datum", "Kalorienziel", "Steifigkeit (0-10)", "Uhrzeit", "Steifigkeit (Min)", "Daumen L (0-10)", "Daumen R (0-10)"],
        ...rows.map(d => [
          fmtDate(d.date),
          d.kcal ? lbl[d.kcal] : "",
          typeof d.rate  === "number" ? d.rate  : "",
          fmtClock(d.ratedAt),
          typeof d.stiff === "number" ? d.stiff : "",
          typeof d.hgL === "number" ? d.hgL : "",
          typeof d.hgR === "number" ? d.hgR : ""
        ])
      ].map(r => r.join(",")).join("\n");

      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        URL.createObjectURL = origCreate;
        return origCreate(new Blob([blob, extra], { type: "text/csv;charset=utf-8" }));
      };
      try { origExport(); } finally { URL.createObjectURL = origCreate; }
    };
  }

  buildDaily();

  // ── Rueckkehr aus dem Hintergrund ──
  // Der eigentliche Fix: liegt die PWA über Nacht im Hintergrund, zeigt das
  // Datumsfeld noch gestern – ein Eintrag landete dann am falschen Tag.
  // Nur weiterstellen, wenn das Feld unverändert auf dem alten Tag stand;
  // eine bewusste manuelle Auswahl bleibt erhalten.
  let lastToday = todayStr();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    const now = todayStr();
    if (now !== lastToday) {
      const el = document.getElementById("d-date");
      if (el && el.value === lastToday) el.value = now;
      lastToday = now;
    }
    buildDaily();
  });

  // ── Deep-Links ──
  // Nur wirksam bei echtem Seitenaufruf. Holt Android ein bestehendes Fenster
  // nach vorn, kommt der Parameter nicht an – dafür ist das Band oben da.
  try {
    const TARGETS = { stiff: "d-stiffsec", thumb: "d-thumbsec", weight: "d-weightsec", kcal: "d-kcalsec", supps: "d-supsec" };
    const id = TARGETS[new URLSearchParams(location.search).get("v")];
    if (id) {
      if (typeof window.showView === "function") window.showView("weight");
      const sec = document.getElementById(id);
      if (sec) setTimeout(function () {
        sec.scrollIntoView({ behavior: "smooth", block: "center" });
        sec.classList.add("dflash");
        setTimeout(function () { sec.classList.remove("dflash"); }, 1700);
      }, 150);
    }
  } catch (e) { /* URLSearchParams nicht verfügbar – unkritisch */ }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
