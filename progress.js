// ═══════════════════════════════════════════════════
// PROGRESS – Erhöhungs-Signal + Pausentimer + Übungsverlauf
// Stand: 30. September 2026
//
// NEU 30.09. (Oktober-Review):
//   · ZEITFENSTER: Nur Einträge der letzten 8 Wochen zählen für das
//     Signal. Ein Treffer von vor drei Monaten sagt nichts mehr über
//     den heutigen Stand.
//   · WIEDEREINSTIEG: progression.ab = "JJJJ-MM-TT" in plan.js blendet
//     alles davor aus (Latzug/Ruderzug nach der Pause).
//   · MANUELLE MARKIERUNGEN: "↑ Erhöhen" steht jetzt mit im grünen
//     Kasten, gekennzeichnet als auto / manuell / auto + manuell.
//     Maßgeblich ist der neueste Eintrag der Übung nach DATUM – die
//     alte Liste nahm den zuletzt gespeicherten.
//   · ÜBUNGSVERLAUF im Log-Tab: Auswahl oben, Gewichtskurve und
//     alle Einheiten der Übung.
//   · TIMER: Screen Wake Lock, solange die Pause läuft. Bei
//     ausgeschaltetem Bildschirm setzt Android den Audio-Kontext aus –
//     der vorgemerkte Ton kam dann nicht. Jetzt bleibt der Bildschirm
//     an, und nach der Rückkehr in den Tab wird der Ton neu vorgemerkt.
//
// Eigenständiges Modul, wird von plan.js nachgeladen.
// Übernimmt zwei Aufgaben:
//   1. Automatisches Erhöhungs-Signal (Summenkriterium)
//   2. Pausentimer – eigene Pausenzeiten und Signalton
//
// ── 1. ERHÖHUNGS-SIGNAL ────────────────────────────
// Die bisherige Regel "alle Sätze an der Obergrenze"
// ist ein hartes Tor. Chest Press, Pectoral Fly, Rear
// Delt Fly und Beinbeuger standen dadurch 6–9 Wochen
// still, obwohl Satz 1 messbar besser wurde – der
// Einbruch in Satz 2/3 hat das Signal blockiert.
//
// NEUE REGEL: Summe aller Sätze gegen eine Schwelle.
// Ein schwacher letzter Satz lässt sich durch einen
// starken ersten ausgleichen. Die Schwelle steht pro
// Übung in plan.js und wird beim Review angepasst.
//
// Default-Schwelle = Sätze × Obergrenze − (Sätze − 1).
//
// GERÄTEFILTER: Nur Einträge mit exakt dem Plan-Gewicht
// zählen. Das filtert Fremdgeräte automatisch heraus –
// Latzug 50 kg an der LifeFitness, Bizepscurl 55 kg am
// 21.08. – ohne dass Notizen ausgewertet werden müssen.
//
// ERLEDIGT-ERKENNUNG (NEU 04.09.): Der Gerätefilter allein liest
// eine bereits ausgeführte Erhöhung als Fremdgerät und verwirft sie.
// Die Übung blieb dadurch dauerhaft im Signal stehen – Oblique Crunch
// stand am 04.09. auf "→ 17,5 kg", obwohl am 03.09. schon 3×15 bei
// 17,5 kg geloggt waren. Liegt die neueste Einheit auf dem Zielgewicht
// oder darüber, gilt die Erhöhung als umgesetzt und die Übung fällt
// aus der Box. Das Band im Eintrag-Tab weist dann auf plan.js hin.
//
// SORTIERUNG (NEU 04.09.): Ausgewertet wird die neueste Einheit nach
// DATUM, nicht die zuletzt gespeicherte. Ein nachgetragener alter
// Eintrag stand vorher am Ende des Arrays und wurde als aktuell
// gelesen.
//
// UNVOLLSTÄNDIGE EINHEITEN: Weniger geloggte Sätze als
// geplant = zählt nicht. 14/7 aus zwei Sätzen ist keine
// Vergleichsgröße zu 14/13/11 aus drei.
//
// ── 2. TIMER ───────────────────────────────────────
// setTimerDefaults und startTimer werden ersetzt, damit
// Übungen eigene Pausenzeiten mitbringen können (Rear
// Delt Fly und Beinbeuger: 120 Sek).
//
// SIGNALTON (NEU 03.09.): Der Ton wird NICHT aus dem
// Intervall heraus abgespielt. Chrome drosselt Timer in
// nicht sichtbaren Tabs auf ~1×/Minute – ein Ton von dort
// käme zu spät oder gar nicht. Stattdessen werden die
// Oszillatoren beim Start des Timers auf der Web-Audio-Uhr
// vorgemerkt (osc.start(ctx.currentTime + n)). Diese Uhr
// läuft in der Audio-Hardware und wird nicht gedrosselt.
//
// Der Countdown selbst rechnet jetzt gegen einen Endzeit-
// stempel statt zu dekrementieren. Ein gedrosselter Tab
// zeigt nach der Rückkehr sofort den richtigen Wert, statt
// die verlorenen Sekunden mitzuschleppen.
//
// GRENZEN: Verwirft Chrome den Tab komplett (Android bei
// Speicherdruck), ist auch die Audio-Uhr weg. Dagegen hilft
// nur ein Service Worker mit Notification – dafür bräuchte
// die App eine Registrierung, die sie nicht hat.
// ═══════════════════════════════════════════════════

(function () {

const DEF_SCHRITT = 2.5;
const FENSTER_TAGE = 56;   // 8 Wochen

// Lokales ISO-Datum vor n Tagen (nicht toISOString – das ist UTC
// und kippt nach Mitternacht um einen Tag).
function isoVor(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ─── ZUGRIFF AUF PLAN ────────────────────────────
function findEx(name) {
  const einheiten = ["Push", "Pull", "Legs"];
  for (let i = 0; i < einheiten.length; i++) {
    const x = PLAN[einheiten[i]].find(function (e) { return e.name === name; });
    if (x) return x;
  }
  return null;
}

function num(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isNaN(n) ? null : n;
}

// "8–12" → 12 · "15" → 15 · "20–24" → 24
function obergrenze(zone) {
  const m = String(zone || "").match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

function prog(ex) { return ex.progression || {}; }

function schwelleVon(ex) {
  const p = prog(ex);
  if (typeof p.schwelle === "number") return p.schwelle;
  const og = obergrenze(ex.repzone);
  if (!og || !ex.saetze) return null;
  return ex.saetze * og - (ex.saetze - 1);
}

function schrittVon(ex) {
  const p = prog(ex);
  return typeof p.schritt === "number" ? p.schritt : DEF_SCHRITT;
}

function satzListe(e) {
  return [e.s1, e.s2, e.s3, e.s4]
    .map(function (x) { return parseInt(x, 10); })
    .filter(function (n) { return !isNaN(n) && n > 0; });
}

function kg(n) { return String(n).replace(".", ",") + " kg"; }

// ISO-Datum, lexikografisch vergleichbar. Sort ist stabil, bei
// gleichem Datum bleibt die Eingabereihenfolge erhalten.
function nachDatum(a, b) {
  const x = String(a.date || ""), y = String(b.date || "");
  return x < y ? -1 : x > y ? 1 : 0;
}

// ─── STATUS ──────────────────────────────────────
function status(ex) {
  const p = prog(ex);
  if (p.gesperrt) return { state: "gesperrt", grund: p.grund || "" };
  if (typeof ex.zielgewicht !== "number")
    return { state: "gesperrt", grund: "Kein Zielgewicht hinterlegt – Progression läuft hier nicht über die Last." };

  const sw = schwelleVon(ex);
  if (sw === null) return { state: "gesperrt", grund: "Keine auswertbare Repzone hinterlegt." };

  const alle = (typeof loadEntries === "function" ? loadEntries() : []);
  const ziel = Math.round((ex.zielgewicht + schrittVon(ex)) * 100) / 100;
  const ab   = p.ab ? String(p.ab) : "";

  // Alle Einheiten dieser Uebung, chronologisch. Die Sortierung nach
  // Datum ist noetig, weil das Array in Speicherreihenfolge liegt:
  // ein nachgetragener alter Eintrag stuende sonst am Ende und wuerde
  // als "letzte Einheit" gelesen.
  const eigene = alle.filter(function (e) {
    return e.uebung === ex.name && num(e.gewicht) !== null &&
           (!ab || String(e.date || "") >= ab);
  }).sort(nachDatum);

  // ERLEDIGT-ERKENNUNG: Liegt die neueste Einheit bereits auf dem
  // Zielgewicht oder darueber, ist die Erhoehung ausgefuehrt und nur
  // der Plan noch nicht nachgezogen. Ohne diese Pruefung bliebe die
  // Uebung dauerhaft im Erhoehungs-Signal stehen, weil der Geraete-
  // filter die neue, schwerere Einheit verwirft und damit fuer immer
  // die alte Treffer-Einheit als "letzte" liest.
  // Die Pruefung ist bewusst einseitig: Fremdgeraete liegen unter dem
  // Plangewicht, eine umgesetzte Erhoehung darueber.
  const neueste = eigene.length ? eigene[eigene.length - 1] : null;
  if (neueste && num(neueste.gewicht) >= ziel - 0.01)
    return { state: "erledigt", ist: num(neueste.gewicht), ziel: ziel, date: neueste.date };

  const trefferAlle = eigene.filter(function (e) {
    return Math.abs(num(e.gewicht) - ex.zielgewicht) < 0.01;
  });
  const grenze  = isoVor(FENSTER_TAGE);
  const treffer = trefferAlle.filter(function (e) { return String(e.date || "") >= grenze; });

  if (!treffer.length) {
    if (trefferAlle.length)
      return { state: "alt", schwelle: sw, ziel: ziel, date: trefferAlle[trefferAlle.length - 1].date };
    return { state: "leer", schwelle: sw, ziel: ziel, ab: ab };
  }

  const letzte = treffer[treffer.length - 1];
  const s      = satzListe(letzte);
  const summe  = s.reduce(function (a, b) { return a + b; }, 0);

  const base = { schwelle: sw, summe: summe, ziel: ziel, date: letzte.date, saetze: s.length };
  if (s.length < ex.saetze) { base.state = "teil"; return base; }

  base.state = summe >= sw ? "treffer" : "offen";
  base.fehlt = Math.max(sw - summe, 0);
  return base;
}

// ─── BAND IM EINTRAG-TAB ─────────────────────────
function bandHTML(ex) {
  const st = status(ex);

  if (st.state === "gesperrt") {
    return `<div class="pgb lock">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">Ausgesetzt</div>
      ${st.grund ? `<div class="pgb-h">${st.grund}</div>` : ""}
    </div>`;
  }

  if (st.state === "erledigt") {
    return `<div class="pgb done">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">Erhöhung umgesetzt → Plan nachziehen</div>
      <div class="pgb-h">Am ${fmtDate(st.date)} bereits mit <strong>${kg(st.ist)}</strong> trainiert, im Plan steht noch ${kg(ex.zielgewicht)}. Beim nächsten Review <strong>zielgewicht</strong> in plan.js auf ${kg(st.ist)} setzen – bis dahin zählt hier nichts weiter.</div>
    </div>`;
  }

  if (st.state === "leer") {
    return `<div class="pgb">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">Schwelle ${st.schwelle} Wdh</div>
      <div class="pgb-h">${st.ab ? `Wiedereinstieg ab ${fmtDate(st.ab)} – ältere Einträge zählen bewusst nicht. ` : ""}Noch kein Eintrag bei ${kg(ex.zielgewicht)}. Ab dem ersten vollständigen Satzblock läuft der Zähler.</div>
    </div>`;
  }

  if (st.state === "alt") {
    return `<div class="pgb">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">Schwelle ${st.schwelle} Wdh</div>
      <div class="pgb-h">Der letzte Eintrag bei ${kg(ex.zielgewicht)} (${fmtDate(st.date)}) liegt über 8 Wochen zurück und zählt nicht mehr. Die nächste vollständige Einheit setzt den Zähler neu.</div>
    </div>`;
  }

  if (st.state === "teil") {
    return `<div class="pgb warn">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">${st.saetze} von ${ex.saetze} Sätzen</div>
      <div class="pgb-h">Die Einheit am ${fmtDate(st.date)} war unvollständig und zählt nicht. Erst ein voller Satzblock ist vergleichbar – sonst liest sich ein Abbruch als Rückschritt.</div>
    </div>`;
  }

  if (st.state === "treffer") {
    return `<div class="pgb hit">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">Schwelle erreicht → ${kg(st.ziel)}</div>
      <div class="pgb-bar"><i style="width:100%"></i></div>
      <div class="pgb-h"><strong>${st.summe} / ${st.schwelle} Wdh</strong> am ${fmtDate(st.date)}. Heute mit ${kg(st.ziel)} beginnen – die Wiederholungen fallen anfangs, das ist eingeplant.</div>
    </div>`;
  }

  const pct = Math.max(0, Math.min(100, Math.round(st.summe / st.schwelle * 100)));
  return `<div class="pgb">
    <div class="pgb-l">Progression</div>
    <div class="pgb-v">${st.summe} / ${st.schwelle} Wdh · noch ${st.fehlt}</div>
    <div class="pgb-bar"><i style="width:${pct}%"></i></div>
    <div class="pgb-h">Summe aller Sätze am ${fmtDate(st.date)}. Ein schwacher letzter Satz lässt sich durch einen starken ersten ausgleichen.</div>
  </div>`;
}

function renderBand() {
  const el  = document.getElementById("pg-band");
  const sel = document.getElementById("f-uebung");
  if (!el || !sel) return;
  const ex = findEx(sel.value);
  el.innerHTML = ex ? bandHTML(ex) : "";
}

// ─── MANUELLE MARKIERUNGEN ───────────────────────
// Pro Übung der neueste Eintrag nach DATUM (bei gleichem Datum der
// zuletzt gespeicherte). Zählt nur, wenn er "↑ Erhöhen" trägt, im
// 8-Wochen-Fenster liegt und nicht vor einem Wiedereinstiegsdatum.
function manuell() {
  const alle = (typeof loadEntries === "function" ? loadEntries() : []);
  const latest = {};
  alle.slice().sort(nachDatum).forEach(function (e) { latest[e.uebung] = e; });
  const grenze = isoVor(FENSTER_TAGE);
  return Object.keys(latest).map(function (k) { return latest[k]; }).filter(function (e) {
    if (!e.erhoehen) return false;
    if (String(e.date || "") < grenze) return false;
    const ex = findEx(e.uebung);
    const ab = ex && prog(ex).ab;
    return !(ab && String(e.date || "") < String(ab));
  });
}

// ─── ÜBERSICHT IM LOG-TAB ────────────────────────
function faellig() {
  const out = [];
  ["Push", "Pull", "Legs"].forEach(function (ein) {
    PLAN[ein].forEach(function (ex) {
      if (out.some(function (o) { return o.name === ex.name; })) return;
      const st = status(ex);
      if (st.state === "treffer")
        out.push({ name: ex.name, ein: ein, ziel: st.ziel,
                   meta: st.summe + " / " + st.schwelle + " Wdh", auto: true, man: false });
    });
  });
  manuell().forEach(function (e) {
    const o = out.find(function (x) { return x.name === e.uebung; });
    if (o) { o.man = true; return; }
    const ex = findEx(e.uebung);
    const g  = num(e.gewicht);
    const ziel = (ex && g !== null) ? Math.round((g + schrittVon(ex)) * 100) / 100 : null;
    const sets = satzListe(e).join("/");
    out.push({ name: e.uebung, ein: e.einheit, ziel: ziel,
               meta: (g !== null ? kg(g) : "") + (sets ? " · " + sets : "") + " · " + fmtDate(e.date),
               auto: false, man: true });
  });
  return out;
}

function injectOverview() {
  const cont = document.getElementById("entries");
  if (!cont) return;
  const alt = document.getElementById("pg-ov");
  if (alt) alt.remove();
  const list = faellig();
  if (!list.length) return;

  const rows = list.map(function (o) {
    const tag = o.auto && o.man ? "auto + manuell" : (o.auto ? "auto" : "manuell");
    return `<div class="pgo-row">
      <span class="ebdg badge-${o.ein}">${String(o.ein || "").toUpperCase()}</span>
      <div class="pgo-i"><div class="pgo-n">${o.name}</div><div class="pgo-m">${o.meta} <span class="pgo-t${o.man ? " m" : ""}">${tag}</span></div></div>
      <span class="pgo-z">${o.ziel !== null ? "→ " + kg(o.ziel) : "↑"}</span>
    </div>`;
  }).join("");

  cont.insertAdjacentHTML("afterbegin", `<div class="pgo" id="pg-ov">
    <div class="pgo-h">Erhöhung fällig · ${list.length}</div>
    ${rows}
    <div class="pgo-f"><strong>auto</strong> = Summenkriterium erreicht · <strong>manuell</strong> = selbst mit ↑ markiert. Gezählt werden nur die letzten 8 Wochen. Fremdgeräte, unvollständige Einheiten und bereits umgesetzte Erhöhungen sind ausgeschlossen.</div>
  </div>`);
}

// ─── SIGNALTON ───────────────────────────────────
// Wird beim Start des Timers auf der Web-Audio-Uhr vorgemerkt,
// nicht beim Ablauf aus JavaScript ausgelöst. Deshalb funktioniert
// er auch, wenn Chrome den Tab in den Hintergrund schiebt und die
// Timer drosselt.
let audioCtx  = null;
let beepNodes = [];

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    // Muss aus einer Nutzergeste heraus passieren – der Tap auf
    // "Start" ist genau das.
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

function cancelBeep() {
  beepNodes.forEach(function (n) { try { n.stop(0); } catch (e) {} });
  beepNodes = [];
}

function scheduleBeep(secs) {
  cancelBeep();
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + Math.max(0, secs);

  // Drei kurze Töne, der letzte höher – im Studio auch neben
  // Musik erkennbar, ohne aufdringlich zu sein.
  [[0, 880], [0.30, 880], [0.60, 1320]].forEach(function (p) {
    const off  = p[0];
    const freq = p[1];
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0 + off);
    gain.gain.setValueAtTime(0.0001, t0 + off);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + off + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + off);
    osc.stop(t0 + off + 0.24);
    beepNodes.push(osc);
  });
}

// ─── ÜBUNGSVERLAUF IM LOG-TAB ────────────────────
let histEx = "";

function escA(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Reihenfolge wie im Plan, danach Übungen, die nur im Log stehen
function uebungsNamen() {
  const imLog = {};
  loadEntries().forEach(function (e) { if (e.uebung) imLog[e.uebung] = true; });
  const out = [];
  ["Push", "Pull", "Legs"].forEach(function (ein) {
    PLAN[ein].forEach(function (ex) {
      if (imLog[ex.name] && out.indexOf(ex.name) === -1) out.push(ex.name);
    });
  });
  Object.keys(imLog).sort().forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); });
  return out;
}

function injectHistPicker() {
  const view = document.getElementById("view-log");
  const frow = view && view.querySelector(".frow");
  if (!frow) return;
  let wrap = document.getElementById("pg-hs");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "pg-hs";
    wrap.className = "pgh-sel";
    frow.parentNode.insertBefore(wrap, frow.nextSibling);
  }
  const opts = uebungsNamen().map(function (n) {
    return `<option value="${escA(n)}"${n === histEx ? " selected" : ""}>${escA(n)}</option>`;
  }).join("");
  wrap.innerHTML = `<select id="pg-hs-s" onchange="pgHist(this.value)">
      <option value="">Übung: Verlauf anzeigen …</option>${opts}
    </select>${histEx ? '<button class="pgh-x" onclick="pgHist(\'\')">×</button>' : ""}`;
}

function kurve(pts) {
  // pts: [{date, w}] chronologisch
  if (pts.length < 2) return "";
  const W = 320, H = 96, L = 34, R = 8, T = 10, B = 18;
  const ws = pts.map(function (p) { return p.w; });
  let lo = Math.min.apply(null, ws), hi = Math.max.apply(null, ws);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const x = function (i) { return L + (W - L - R) * i / (pts.length - 1); };
  const y = function (w) { return T + (H - T - B) * (1 - (w - lo) / (hi - lo)); };
  const line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.w).toFixed(1); }).join(" ");
  const dots = pts.map(function (p, i) { return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.w).toFixed(1)}" r="2.6"/>`; }).join("");
  const d0 = fmtDate(pts[0].date).slice(0, 6), d1 = fmtDate(pts[pts.length - 1].date).slice(0, 6);
  return `<svg class="pgh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gewichtsverlauf">
    <line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>
    <line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
    <text x="${L - 4}" y="${y(hi) + 4}" text-anchor="end">${String(hi).replace(".", ",")}</text>
    <text x="${L - 4}" y="${y(lo) + 4}" text-anchor="end">${String(lo).replace(".", ",")}</text>
    <text x="${L}" y="${H - 4}">${d0}</text>
    <text x="${W - R}" y="${H - 4}" text-anchor="end">${d1}</text>
    <path class="ln" d="${line}"/><g class="dt">${dots}</g>
  </svg>`;
}

function renderHist() {
  const cont = document.getElementById("entries");
  if (!cont) return;
  const es = loadEntries().filter(function (e) { return e.uebung === histEx; }).sort(nachDatum);
  if (!es.length) { histEx = ""; return; }
  const mitGew = es.filter(function (e) { return num(e.gewicht) !== null && num(e.gewicht) > 0; });
  const pts = mitGew.map(function (e) { return { date: e.date, w: num(e.gewicht) }; });
  const ex = findEx(histEx);
  const erst = mitGew[0], letzt = mitGew[mitGew.length - 1];
  let kopf = es.length + " Einheiten";
  if (erst && letzt) {
    const dW = Math.round((num(letzt.gewicht) - num(erst.gewicht)) * 100) / 100;
    kopf += ` · ${kg(num(erst.gewicht))} → ${kg(num(letzt.gewicht))} (${dW >= 0 ? "+" : ""}${String(dW).replace(".", ",")}) seit ${fmtDate(erst.date)}`;
  }
  const rows = es.slice().reverse().map(function (e) {
    const s = satzListe(e);
    const sum = s.reduce(function (a, b) { return a + b; }, 0);
    return `<div class="pgh-row">
      <div class="pgh-d">${fmtDate(e.date).slice(0, 6)}</div>
      <div class="pgh-w">${e.gewicht ? String(e.gewicht).replace(".", ",") + " kg" : "–"}</div>
      <div class="pgh-s">${s.join(" / ") || "–"}${s.length ? ` <span>Σ ${sum}</span>` : ""}${e.notiz ? `<div class="pgh-n">${escA(e.notiz)}</div>` : ""}</div>
      ${e.erhoehen ? '<span class="ubdg">↑</span>' : ""}
      <button class="dbtn" onclick="startEdit(${e.id})" style="font-size:15px">✎</button>
    </div>`;
  }).join("");
  cont.innerHTML = `<div class="pgh">
    <div class="pgh-h">${escA(histEx)}</div>
    <div class="pgh-m">${kopf}</div>
    ${ex && ex.ziel ? `<div class="pgh-m">Plan: ${escA(ex.ziel)}</div>` : ""}
    ${kurve(pts)}
    <div class="pgh-list">${rows}</div>
  </div>`;
}

window.pgHist = function (name) {
  histEx = name || "";
  if (typeof renderLog === "function") renderLog();
};

// ─── WAKE LOCK ───────────────────────────────────
// Hält den Bildschirm an, solange die Pause läuft. Ohne das setzt
// Android bei ausgeschaltetem Bildschirm den Audio-Kontext aus, und
// der vorgemerkte Ton fällt aus.
let wakeLock = null;

function lockOn() {
  try {
    if (!("wakeLock" in navigator) || wakeLock) return;
    navigator.wakeLock.request("screen").then(function (l) {
      wakeLock = l;
      l.addEventListener("release", function () { wakeLock = null; });
    }).catch(function () {});
  } catch (e) {}
}

function lockOff() {
  try { if (wakeLock) wakeLock.release(); } catch (e) {}
  wakeLock = null;
}

// ─── PAUSE-ÜBERSTEUERUNG ─────────────────────────
// Rear Delt Fly und Beinbeuger brauchen 120 Sek statt der
// 60–90 Sek für Isolation. Der Einbruch in Satz 2/3 ist dort
// ein Erholungs-, kein Kraftproblem.
function pauseVon(name, typ) {
  const ex = findEx(name);
  if (ex && ex.pause && typeof ex.pause.secs === "number") return ex.pause;
  return PAUSE[typ] || PAUSE.isolation;
}

// ─── INIT ────────────────────────────────────────
const CSS = `
.pgb { border-radius: 10px; padding: 11px 14px; margin-bottom: 12px; border: 1px solid var(--border); background: var(--surface); }
.pgb.hit  { border-color: #B8DCB8; background: var(--go-bg); }
.pgb.warn { border-color: #E8C84A; background: #FFF6DC; }
.pgb.lock { border-style: dashed; }
.pgb.done { border-color: #B8C8DC; background: #EEF3F9; }
.pgb-l { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }
.pgb-v { font-size: 14px; font-weight: 700; color: var(--text); margin-top: 3px; }
.pgb.hit .pgb-v  { color: var(--go); }
.pgb.warn .pgb-v { color: #8A6D00; }
.pgb.lock .pgb-v { color: var(--muted); }
.pgb.done .pgb-v { color: #2F5D8A; }
.pgb-bar { height: 5px; border-radius: 3px; background: var(--border); margin-top: 9px; overflow: hidden; }
.pgb-bar i { display: block; height: 100%; background: var(--text); border-radius: 3px; transition: width .25s; }
.pgb.hit .pgb-bar i { background: var(--go); }
.pgb-h { font-size: 11.5px; color: var(--muted); line-height: 1.55; margin-top: 8px; }
.pgb-h strong { color: var(--text); font-weight: 700; }
.pgo { margin: 16px 20px 0; padding: 14px; background: var(--go-bg); border: 1px solid #B8DCB8; border-radius: 10px; }
.pgo-h { font-family: var(--fd); font-size: 15px; letter-spacing: 2px; color: var(--go); margin-bottom: 10px; }
.pgo-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #C8E4C8; }
.pgo-row:last-of-type { border-bottom: none; }
.pgo-i { flex: 1; min-width: 0; }
.pgo-n { font-size: 13.5px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pgo-m { font-size: 11px; color: #4A7A4A; margin-top: 1px; }
.pgo-z { font-size: 13px; font-weight: 700; color: var(--go); flex-shrink: 0; }
.pgo-f { font-size: 11px; color: #4A7A4A; line-height: 1.5; margin-top: 10px; padding-top: 9px; border-top: 1px solid #C8E4C8; }
.pgo-f strong { color: var(--go); }
.pgo-t { display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 1px 6px; border-radius: 8px; border: 1px solid #B8DCB8; color: var(--go); margin-left: 4px; }
.pgo-t.m { border-color: var(--text); color: var(--text); }
.pgh-sel { display: flex; gap: 8px; align-items: center; margin: 10px 20px 0; }
.pgh-sel select { flex: 1; margin-bottom: 0 !important; font-size: 13px !important; padding: 11px 12px !important; }
.pgh-x { flex: 0 0 40px; height: 40px; border-radius: 8px; border: 1.5px solid var(--border); background: transparent; font-size: 18px; color: var(--muted); cursor: pointer; }
.pgh { margin: 14px 20px 0; padding: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.pgh-h { font-family: var(--fd); font-size: 17px; letter-spacing: 1.5px; color: var(--text); }
.pgh-m { font-size: 11.5px; color: var(--muted); margin-top: 3px; line-height: 1.5; }
.pgh-svg { width: 100%; height: auto; margin-top: 10px; display: block; }
.pgh-svg .ax { stroke: var(--border); stroke-width: 1; }
.pgh-svg .ln { fill: none; stroke: var(--text); stroke-width: 2; stroke-linejoin: round; }
.pgh-svg .dt circle { fill: var(--text); }
.pgh-svg text { font-size: 9px; fill: var(--muted); font-family: var(--fb); }
.pgh-list { margin-top: 10px; }
.pgh-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
.pgh-d { flex: 0 0 44px; font-size: 12px; font-weight: 700; color: var(--muted); padding-top: 2px; }
.pgh-w { flex: 0 0 64px; font-size: 13px; font-weight: 700; color: var(--text); padding-top: 1px; }
.pgh-s { flex: 1; min-width: 0; font-size: 13px; color: var(--text); }
.pgh-s span { font-size: 11px; color: var(--muted); font-weight: 700; margin-left: 4px; }
.pgh-n { font-size: 11px; color: var(--muted); margin-top: 2px; }
`;

let timerEndAt = 0;

function init() {
  const hint = document.getElementById("hint");
  if (!hint || document.getElementById("pg-band")) return;

  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  const band = document.createElement("div");
  band.id = "pg-band";
  hint.parentNode.insertBefore(band, hint.nextSibling);

  // refreshHint erweitern – Band folgt der Übungsauswahl
  const origHint = window.refreshHint;
  if (typeof origHint === "function") {
    window.refreshHint = function () { origHint.apply(this, arguments); renderBand(); };
  }

  // saveEntry erweitern – nach dem Speichern muss der Zähler nachziehen
  const origSave = window.saveEntry;
  if (typeof origSave === "function") {
    window.saveEntry = function () { origSave.apply(this, arguments); renderBand(); };
  }

  // "↑ Erhöhen"-Liste (Zähler + Filter im Log): neuester Eintrag nach
  // DATUM statt nach Speicherreihenfolge, gleiche Regeln wie der Kasten.
  window.erhoehenList = function () { return manuell(); };

  // "Letzter Eintrag" im Eintrag-Tab: ebenfalls nach Datum.
  const origLast = window.showLastEntry;
  if (typeof origLast === "function") {
    window.showLastEntry = function (uebung) {
      const all = loadEntries().filter(function (e) { return e.uebung === uebung; }).sort(nachDatum);
      const el = document.getElementById("last-entry");
      if (!el) return;
      const last = all.length ? all[all.length - 1] : null;
      if (!last) { el.classList.remove("show"); return; }
      el.classList.add("show");
      const sets = [last.s1, last.s2, last.s3, last.s4].filter(Boolean).join(" / ");
      document.getElementById("last-date").textContent = fmtDate(last.date);
      const dataEl = document.getElementById("last-data");
      dataEl.textContent = (last.gewicht ? last.gewicht + " kg" : "") + (sets ? "  ·  " + sets + " Wdh" : "");
      if (last.erhoehen) dataEl.innerHTML += ' <span class="last-up">↑ erhöhen!</span>';
    };
  }

  // renderLog erweitern – Übersicht bzw. Übungsverlauf oben im Log
  const origLog = window.renderLog;
  if (typeof origLog === "function") {
    window.renderLog = function () {
      origLog.apply(this, arguments);
      if (histEx) renderHist();   // setzt histEx zurück, wenn die Übung leer ist
      if (!histEx) injectOverview();
      injectHistPicker();
    };
  }

  // Ein Filter-Tap (Alle/Push/Pull/Legs/↑) verlässt den Übungsverlauf
  const origFilter = window.setFilter;
  if (typeof origFilter === "function") {
    window.setFilter = function () { histEx = ""; return origFilter.apply(this, arguments); };
  }

  // Jede Unterbrechung verwirft den vorgemerkten Ton.
  // Ein anschließender Start merkt ihn neu vor.
  ["resetTimer", "toggleTimer", "stopTimer"].forEach(function (fn) {
    const orig = window[fn];
    if (typeof orig === "function") {
      window[fn] = function () { cancelBeep(); lockOff(); return orig.apply(this, arguments); };
    }
  });

  // Timer: pause-Feld der Übung schlägt PAUSE[typ]
  window.setTimerDefaults = function (typ) {
    if (timerState !== "idle") return;
    const sel = document.getElementById("f-uebung");
    const p   = pauseVon(sel ? sel.value : "", typ);
    timerTotal = p.secs;
    timerLeft  = p.secs;
    document.getElementById("timer-disp").textContent = fmtTime(p.secs);
    document.getElementById("timer-hint").textContent = p.label;
  };

  window.startTimer = function () {
    const sel  = document.getElementById("f-uebung");
    const name = sel ? sel.value : "";
    const ex   = findEx(name);
    const p    = pauseVon(name, (ex && ex.typ) || "isolation");

    timerTotal = p.secs;
    timerLeft  = p.secs;
    timerState = "running";
    timerEndAt = Date.now() + p.secs * 1000;

    // Ton jetzt vormerken, solange die Nutzergeste noch zählt
    scheduleBeep(p.secs);
    lockOn();

    renderTimer();
    clearInterval(timerIv);

    // Gegen den Endzeitstempel rechnen statt zu dekrementieren:
    // Ein gedrosselter Tab zeigt nach der Rückkehr sofort den
    // richtigen Wert, statt verlorene Sekunden mitzuschleppen.
    timerIv = setInterval(function () {
      const left = Math.max(0, Math.round((timerEndAt - Date.now()) / 1000));
      timerLeft = left;
      const disp = document.getElementById("timer-disp");
      if (disp) disp.textContent = fmtTime(left);
      if (left <= 0) {
        clearInterval(timerIv);
        timerState = "done";
        lockOff();
        renderTimer();
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        showFlash("Pause vorbei – nächster Satz! 💪");
      }
    }, 250);
  };

  // Rückkehr in den Tab: Audio fortsetzen, Wake Lock erneuern (wird
  // beim Verstecken automatisch freigegeben) und den Ton auf die
  // Restzeit neu vormerken – die Audio-Uhr stand eventuell still.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (timerState !== "running") return;
    const left = (timerEndAt - Date.now()) / 1000;
    if (left > 0.3) { scheduleBeep(left); lockOn(); }
  });

  renderBand();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
