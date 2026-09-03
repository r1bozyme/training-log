// ═══════════════════════════════════════════════════
// PROGRESS – Automatisches Erhöhungs-Signal
// Stand: 3. September 2026
//
// Eigenständiges Modul, wird von plan.js nachgeladen.
//
// WARUM:
// Die bisherige Regel "alle Sätze an der Obergrenze"
// ist ein hartes Tor. Chest Press, Pectoral Fly, Rear
// Delt Fly und Beinbeuger standen dadurch 6–9 Wochen
// still, obwohl Satz 1 messbar besser wurde – der
// Einbruch in Satz 2/3 hat das Signal blockiert.
//
// NEUE REGEL:
// Summe aller Sätze gegen eine Schwelle. Ein schwacher
// letzter Satz lässt sich durch einen starken ersten
// ausgleichen. Die Schwelle steht pro Übung in plan.js
// und wird beim Review angepasst.
//
// Default-Schwelle = Sätze × Obergrenze − (Sätze − 1),
// also ein Puffer von einer Wiederholung je Zusatzsatz.
//
// GERÄTEFILTER:
// Nur Einträge mit exakt dem Plan-Gewicht zählen. Das
// filtert Fremdgeräte automatisch heraus – Latzug 50 kg
// an der LifeFitness, Bizepscurl 55 kg am 21.08. – ohne
// dass Notizen ausgewertet werden müssen.
//
// UNVOLLSTÄNDIGE EINHEITEN:
// Weniger geloggte Sätze als geplant = zählt nicht.
// 14/7 aus zwei Sätzen ist keine Vergleichsgröße zu
// 14/13/11 aus drei. Sonst würde ein Abbruch als
// Rückschritt gelesen.
// ═══════════════════════════════════════════════════

(function () {

const DEF_SCHRITT = 2.5;

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

// ─── STATUS ──────────────────────────────────────
function status(ex) {
  const p = prog(ex);
  if (p.gesperrt) return { state: "gesperrt", grund: p.grund || "" };
  if (typeof ex.zielgewicht !== "number")
    return { state: "gesperrt", grund: "Kein Zielgewicht hinterlegt – Progression läuft hier nicht über die Last." };

  const sw = schwelleVon(ex);
  if (sw === null) return { state: "gesperrt", grund: "Keine auswertbare Repzone hinterlegt." };

  const alle = (typeof loadEntries === "function" ? loadEntries() : []);
  const treffer = alle.filter(function (e) {
    const g = num(e.gewicht);
    return e.uebung === ex.name && g !== null && Math.abs(g - ex.zielgewicht) < 0.01;
  });

  const ziel = Math.round((ex.zielgewicht + schrittVon(ex)) * 100) / 100;
  if (!treffer.length) return { state: "leer", schwelle: sw, ziel: ziel };

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

  if (st.state === "leer") {
    return `<div class="pgb">
      <div class="pgb-l">Progression</div>
      <div class="pgb-v">Schwelle ${st.schwelle} Wdh</div>
      <div class="pgb-h">Noch kein Eintrag bei ${kg(ex.zielgewicht)}. Ab dem ersten vollständigen Satzblock läuft der Zähler.</div>
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

// ─── ÜBERSICHT IM LOG-TAB ────────────────────────
function faellig() {
  const out = [];
  ["Push", "Pull", "Legs"].forEach(function (ein) {
    PLAN[ein].forEach(function (ex) {
      if (out.some(function (o) { return o.name === ex.name; })) return;
      const st = status(ex);
      if (st.state === "treffer")
        out.push({ name: ex.name, ein: ein, ziel: st.ziel, summe: st.summe, schwelle: st.schwelle });
    });
  });
  return out;
}

function injectOverview() {
  const cont = document.getElementById("entries");
  if (!cont || document.getElementById("pg-ov")) return;
  const list = faellig();
  if (!list.length) return;

  const rows = list.map(function (o) {
    return `<div class="pgo-row">
      <span class="ebdg badge-${o.ein}">${o.ein.toUpperCase()}</span>
      <div class="pgo-i"><div class="pgo-n">${o.name}</div><div class="pgo-m">${o.summe} / ${o.schwelle} Wdh</div></div>
      <span class="pgo-z">→ ${kg(o.ziel)}</span>
    </div>`;
  }).join("");

  cont.insertAdjacentHTML("afterbegin", `<div class="pgo" id="pg-ov">
    <div class="pgo-h">Erhöhung fällig · ${list.length}</div>
    ${rows}
    <div class="pgo-f">Automatisch aus dem Summenkriterium. Fremdgeräte und unvollständige Einheiten sind ausgeschlossen.</div>
  </div>`);
}

// ─── PAUSE-ÜBERSTEUERUNG ─────────────────────────
// Rear Delt Fly und Beinbeuger brauchen 120 Sek statt der
// 60–90 Sek für Isolation. Der Einbruch in Satz 2/3 ist dort
// ein Erholungs-, kein Kraftproblem. Übersteuert PAUSE[typ],
// wenn die Übung ein eigenes pause-Feld mitbringt.
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
.pgb-l { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }
.pgb-v { font-size: 14px; font-weight: 700; color: var(--text); margin-top: 3px; }
.pgb.hit .pgb-v  { color: var(--go); }
.pgb.warn .pgb-v { color: #8A6D00; }
.pgb.lock .pgb-v { color: var(--muted); }
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
`;

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

  // renderLog erweitern – Übersicht oben im Log
  const origLog = window.renderLog;
  if (typeof origLog === "function") {
    window.renderLog = function () { origLog.apply(this, arguments); injectOverview(); };
  }

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
    renderTimer();
    clearInterval(timerIv);
    timerIv = setInterval(function () {
      timerLeft--;
      document.getElementById("timer-disp").textContent = fmtTime(timerLeft);
      if (timerLeft <= 0) {
        clearInterval(timerIv);
        timerState = "done";
        renderTimer();
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        showFlash("Pause vorbei – nächster Satz! 💪");
      }
    }, 1000);
  };

  renderBand();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
