// ═══════════════════════════════════════════════════
// TEMPO – Tempo-Coach für HSR (23.11.2026)
//
// Zweck: Bei Heavy Slow Resistance ist das Tempo die eigentliche
// Dosis (3 Sek runter, 3 Sek hoch, unten nicht halten). Gerade bei
// schweren Lasten driftet es am leichtesten. Der Coach gibt den Takt
// akustisch vor und zählt die Wiederholungen mit.
//
// WANN SICHTBAR: im Eintrag-Tab unter dem Pausentimer, sobald eine
//   Übung mit Tempo gewählt ist. Tempo kommt aus plan.js
//   (ex.tempo = { runter, hoch, unten, oben } in Sekunden), sonst
//   gilt jede Übung mit „HSR“ im Namen als 3/3 ohne Halten.
//   Ziel-Wiederholungen = Obergrenze der repzone (z. B. „6–8“ → 8),
//   per − / + änderbar (nur für die laufende Sitzung).
//
// ABLAUF: Start → 3 Sek Einzählen → je Wiederholung ein tiefer Ton
//   zu Beginn von „runter“, ein hoher zu Beginn von „hoch“, leise
//   Klicks dazwischen jede Sekunde. Nach der letzten Wiederholung der
//   Abschluss-Dreiklang. Die Wiederholungszahl wandert ins nächste
//   leere Satzfeld (S1–S4); bei „Stopp“ zählen nur volle
//   Wiederholungen. Speichern bleibt wie immer von Hand.
//
// TECHNIK (Muster wie Pausentimer in progress.js):
//   · Alle Töne des Satzes werden beim Start auf der Web-Audio-Uhr
//     vorgemerkt, nicht aus einem Intervall ausgelöst – Chrome
//     drosselt Timer, die Audio-Uhr nicht.
//   · Anzeige rechnet gegen den Startzeitstempel.
//   · Wake Lock hält den Bildschirm an, solange der Satz läuft.
//     Nach Rückkehr in den Tab werden die restlichen Töne neu
//     vorgemerkt.
//   · Eigener AudioContext; der Pausentimer bleibt unberührt.
//
// Zusammenspiel: liest PLAN (plan.js) und #f-uebung / #f-s1..4
//   (index.html), setzt sich hinter #timer-wrap. Keine Storage-Keys.
// ═══════════════════════════════════════════════════

(function () {

const EINZAEHLEN = 3;

let st = null;        // laufender Satz
let zielOverride = null;
let lastName = "";
let ctx = null;
let nodes = [];
let iv = null;
let wl = null;

// ─── PLAN ────────────────────────────────────────
function findEx(name) {
  if (typeof PLAN === "undefined") return null;
  const e = ["Push", "Pull", "Legs"];
  for (let i = 0; i < e.length; i++) {
    const x = (PLAN[e[i]] || []).find(function (o) { return o.name === name; });
    if (x) return x;
  }
  return null;
}

function tempoVon(name) {
  const ex = findEx(name);
  let t = ex && ex.tempo;
  if (!t && /HSR/.test(name || "")) t = { runter: 3, hoch: 3 };
  if (!t) return null;
  return { runter: t.runter || 3, hoch: t.hoch || 3, unten: t.unten || 0, oben: t.oben || 0 };
}

function zielVon(name) {
  const ex = findEx(name);
  const m = ex && String(ex.repzone || "").match(/(\d+)\D*$/);
  return m ? parseInt(m[1], 10) : 8;
}

function aktName() {
  const s = document.getElementById("f-uebung");
  return s ? s.value : "";
}

// ─── AUDIO ───────────────────────────────────────
function audio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch (e) { return null; }
}

function ton(t, freq, dauer, laut) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(laut, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dauer + 0.02);
  nodes.push(o);
}

function stille() {
  nodes.forEach(function (n) { try { n.stop(0); } catch (e) {} });
  nodes = [];
}

// Zeitplan des Satzes in Sekunden ab Start (inkl. Einzählen)
function plan(s) {
  const ev = [];
  for (let i = 0; i < EINZAEHLEN; i++) ev.push([i, 660, 0.12, 0.35]);
  const rep = s.t.runter + s.t.unten + s.t.hoch + s.t.oben;
  for (let r = 0; r < s.ziel; r++) {
    let t = EINZAEHLEN + r * rep;
    const phasen = [[s.t.runter, 440, true], [s.t.unten, 0, false], [s.t.hoch, 990, true], [s.t.oben, 0, false]];
    phasen.forEach(function (p) {
      for (let k = 0; k < p[0]; k++) {
        if (k === 0 && p[2]) ev.push([t + k, p[1], 0.28, 0.5]);
        else ev.push([t + k, 1500, 0.04, 0.12]);
      }
      t += p[0];
    });
  }
  const ende = EINZAEHLEN + s.ziel * rep;
  ev.push([ende, 880, 0.22, 0.4], [ende + 0.3, 880, 0.22, 0.4], [ende + 0.6, 1320, 0.22, 0.4]);
  return ev;
}

function vormerken(abSek) {
  stille();
  if (!audio()) return;
  const jetzt = ctx.currentTime;
  plan(st).forEach(function (e) {
    if (e[0] >= abSek - 0.05) ton(jetzt + (e[0] - abSek), e[1], e[2], e[3]);
  });
}

// ─── WAKE LOCK ───────────────────────────────────
function lockOn() {
  try {
    if (!("wakeLock" in navigator) || wl) return;
    navigator.wakeLock.request("screen").then(function (l) {
      wl = l;
      l.addEventListener("release", function () { wl = null; });
    }).catch(function () {});
  } catch (e) {}
}
function lockOff() { try { if (wl) wl.release(); } catch (e) {} wl = null; }

// ─── ABLAUF ──────────────────────────────────────
function repDauer() { return st.t.runter + st.t.unten + st.t.hoch + st.t.oben; }

function zustand() {
  const el = (Date.now() - st.start) / 1000;
  if (el < EINZAEHLEN) return { phase: "ein", rest: Math.ceil(EINZAEHLEN - el), rep: 0 };
  const x = el - EINZAEHLEN;
  const rd = repDauer();
  const rep = Math.floor(x / rd);
  if (rep >= st.ziel) return { phase: "fertig", rep: st.ziel };
  let im = x - rep * rd;
  const ph = [["runter", st.t.runter], ["unten", st.t.unten], ["hoch", st.t.hoch], ["oben", st.t.oben]];
  for (let i = 0; i < ph.length; i++) {
    if (im < ph[i][1]) return { phase: ph[i][0], rest: Math.ceil(ph[i][1] - im), rep: rep };
    im -= ph[i][1];
  }
  return { phase: "hoch", rest: 0, rep: rep };
}

function start() {
  const name = aktName();
  const t = tempoVon(name);
  if (!t) return;
  st = { name: name, t: t, ziel: zielOverride || zielVon(name), start: Date.now(), letzte: "" };
  vormerken(0);
  lockOn();
  clearInterval(iv);
  iv = setInterval(tick, 100);
  render();
}

function ende(volleReps, abgebrochen) {
  clearInterval(iv);
  iv = null;
  stille();
  lockOff();
  const n = volleReps;
  st = null;
  let feld = null;
  if (n > 0) {
    for (let i = 1; i <= 4; i++) {
      const f = document.getElementById("f-s" + i);
      if (f && String(f.value).trim() === "") { f.value = n; feld = "S" + i; break; }
    }
  }
  render();
  if (typeof showFlash === "function") {
    if (n === 0) showFlash("Tempo-Satz abgebrochen");
    else showFlash((abgebrochen ? "Gestoppt: " : "Satz fertig: ") + n + " Wdh" + (feld ? " → " + feld : " (alle Satzfelder voll)"));
  }
}

function stopp() {
  if (!st) return;
  const z = zustand();
  ende(z.phase === "fertig" ? st.ziel : z.rep, true);
}

function tick() {
  if (!st) return;
  const z = zustand();
  if (z.phase === "fertig") { ende(st.ziel, false); return; }
  if (z.phase !== st.letzte) {
    if (st.letzte && (z.phase === "runter" || z.phase === "hoch") && navigator.vibrate && document.visibilityState === "visible") {
      try { navigator.vibrate(60); } catch (e) {}
    }
    st.letzte = z.phase;
  }
  anzeige(z);
}

// ─── OBERFLÄCHE ──────────────────────────────────
const CSS = `
.tc { background: var(--surface); border: 2px solid var(--border); border-radius: 12px; padding: 12px 16px; margin: -6px 0 16px; }
.tc.lauf { border-color: var(--neutral); }
.tc-k { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tc-l { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }
.tc-t { font-size: 13px; color: var(--text); margin-top: 3px; }
.tc-z { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 13px; color: var(--muted); }
.tc-z button { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 16px; cursor: pointer; }
.tc-z b { color: var(--text); min-width: 18px; text-align: center; }
.tc-ph { font-family: var(--fd); font-size: 34px; letter-spacing: 2px; color: var(--text); line-height: 1.05; }
.tc-ph.hoch { color: var(--go); }
.tc-rep { font-size: 13px; color: var(--muted); margin-top: 2px; }
.tc-bar { height: 6px; border-radius: 3px; background: var(--border); margin-top: 10px; overflow: hidden; }
.tc-bar i { display: block; height: 100%; background: var(--neutral); width: 0; }
`;

function box() {
  let b = document.getElementById("tc-box");
  if (b) return b;
  const tw = document.getElementById("timer-wrap");
  if (!tw) return null;
  b = document.createElement("div");
  b.id = "tc-box";
  b.className = "tc";
  tw.insertAdjacentElement("afterend", b);
  return b;
}

function tempoText(t) {
  let s = t.runter + " Sek ↓ · ";
  if (t.unten) s += t.unten + " halten · ";
  s += t.hoch + " Sek ↑";
  if (t.oben) s += " · " + t.oben + " oben";
  if (!t.unten) s += " · unten nicht halten";
  return s;
}

function render() {
  const b = box();
  if (!b) return;
  if (st) {
    b.style.display = "";
    b.className = "tc lauf";
    b.innerHTML =
      '<div class="tc-k"><div><div class="tc-l">Tempo-Coach</div>' +
      '<div class="tc-ph" id="tc-ph">–</div><div class="tc-rep" id="tc-rep"></div></div>' +
      '<button class="timer-btn running" onclick="tcStopp()">■ STOPP</button></div>' +
      '<div class="tc-bar"><i id="tc-bar"></i></div>';
    anzeige(zustand());
    return;
  }
  const name = aktName();
  const t = tempoVon(name);
  if (!t) { b.style.display = "none"; b.innerHTML = ""; return; }
  if (name !== lastName) { zielOverride = null; lastName = name; }
  const ziel = zielOverride || zielVon(name);
  b.style.display = "";
  b.className = "tc";
  b.innerHTML =
    '<div class="tc-k"><div><div class="tc-l">Tempo-Coach</div>' +
    '<div class="tc-t">' + tempoText(t) + '</div>' +
    '<div class="tc-z"><button onclick="tcZiel(-1)">−</button><b>' + ziel + '</b><button onclick="tcZiel(1)">+</button> Wdh</div></div>' +
    '<button class="timer-btn" onclick="tcStart()">▶ SATZ</button></div>';
}

function anzeige(z) {
  const ph = document.getElementById("tc-ph");
  const rp = document.getElementById("tc-rep");
  const br = document.getElementById("tc-bar");
  if (!ph || !st) return;
  const txt = { ein: "Bereit … " + z.rest, runter: "↓ Runter " + z.rest, unten: "Halten " + z.rest, hoch: "↑ Hoch " + z.rest, oben: "Oben " + z.rest };
  ph.textContent = txt[z.phase] || "";
  ph.className = "tc-ph" + (z.phase === "hoch" ? " hoch" : "");
  rp.textContent = z.phase === "ein" ? "Ziel " + st.ziel + " Wdh" : "Wdh " + (z.rep + 1) + " / " + st.ziel;
  const el = Math.max(0, (Date.now() - st.start) / 1000 - EINZAEHLEN);
  br.style.width = Math.min(100, el / (st.ziel * repDauer()) * 100) + "%";
}

window.tcStart = start;
window.tcStopp = stopp;
window.tcZiel = function (d) {
  const name = aktName();
  zielOverride = Math.max(1, Math.min(20, (zielOverride || zielVon(name)) + d));
  render();
};

function init() {
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);

  const sel = document.getElementById("f-uebung");
  if (sel) {
    sel.addEventListener("change", function () { if (!st) render(); });
    // Einheitwechsel und Bearbeiten setzen Optionen bzw. Wert ohne
    // change-Ereignis – deshalb zusätzlich die Liste beobachten.
    try { new MutationObserver(function () { if (!st) render(); }).observe(sel, { childList: true }); } catch (e) {}
  }
  document.addEventListener("tl:view", function () { if (!st) render(); });

  // Rückkehr in den Tab: Audio-Uhr stand evtl. still → Rest neu vormerken
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !st) return;
    const el = (Date.now() - st.start) / 1000;
    vormerken(el);
    lockOn();
    tick();
  });

  render();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
