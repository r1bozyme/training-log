/* ═══════════════════════════════════════════════════
   back.js – Android-Zurück zwischen allen Ansichten (11.11.2026)

   Jede Ansicht bekommt einen eigenen Verlaufseintrag {tlView, i}.
   Android-Zurück (Wischen vom Rand) führt so zur vorherigen Ansicht,
   egal ob man über Bereichsknöpfe, Chips, Wischen oder „＋ Eintrag“
   dorthin gekommen ist. Unterste Ebene ist immer der Log: von dort
   verlässt Zurück die App.

   - Kein Endlos-Stapel: Wechselt man zu einer Ansicht, die schon
     weiter unten im Verlauf liegt, springt der Verlauf dorthin zurück
     (Log → Stats → Plan → Stats: Zurück führt zum Log).
   - Bearbeiten-Modus im Eintrag: Zurück verwirft die Bearbeitung
     (resetForm), wie „Abbrechen“.
   - Verträgt sich mit dialog.js: dessen {tlAsk:1} liegt obenauf;
     Zurück bei offenem Dialog schließt nur den Dialog. Wechselt die
     Ansicht, während ein Dialog-Eintrag noch abgebaut wird, wird der
     Verlauf danach nachgezogen.
   - Ebenen über einer Ansicht (Scanner, Speisekarte, Tag-Menü) melden
     sich mit window.tlBackLayer(beiZurueck) an und bekommen einen
     eigenen Eintrag {tlLayer:id}; Zurück schließt dann nur die Ebene.
     Die Rückgabe release() rufen sie beim normalen Schließen auf.
     Bleibt ein Ebenen-Eintrag verwaist (z. B. weil direkt danach ein
     Dialog aufging), wird er beim Erreichen still übersprungen.
   - Die App startet in „＋ Eintrag“; dessen Eintrag wird erst bei der
     ersten Berührung angelegt – Chrome überspringt Verlaufseinträge,
     die ohne Nutzeraktion angelegt wurden.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";
if (window.tlBackCore) return;
window.tlBackCore = 1;

var ROOT = "log";
var cur = "add", stack = [ROOT], idx = 0;
var armed = false, fromPop = false, wait = false;
var layers = [], lid = 0, leaving = {};   // leaving: freigegeben, eigenes history.back steht aus

(function () {
  var a = document.querySelector('.view.active[id^="view-"]');
  if (a) cur = a.id.slice(5);
})();
history.replaceState({ tlView: ROOT, i: 0 }, "");

function st() { return history.state || {}; }

/* Verlauf an die angezeigte Ansicht cur anpassen */
function follow() {
  if (!armed) return;
  var s = st();
  if (s.tlLayer && !wait && !leaving[s.tlLayer] && !layers.some(function (l) { return l.id === s.tlLayer; })) {
    wait = true; history.back(); return;     // verwaiste Ebene obenauf
  }
  if (wait || s.tlAsk || s.tlLayer) { wait = true; return; }   // nach dem nächsten popstate
  if (stack[idx] === cur) return;
  var k = stack.slice(0, idx).lastIndexOf(cur);
  if (k >= 0) {
    var d = k - idx;
    idx = k; stack.length = k + 1;
    wait = true;
    history.go(d);
  } else {
    stack.length = idx + 1;
    stack.push(cur); idx++;
    history.pushState({ tlView: cur, i: idx }, "");
  }
}

window.addEventListener("popstate", function () {
  var s = st();
  /* Oberste offene Ebene verlassen → schließen */
  if (layers.length && !s.tlAsk) {
    var top = layers[layers.length - 1];
    if (s.tlLayer !== top.id) {
      layers.pop();
      try { top.fn(); } catch (e) { if (window.console) console.error(e); }
    }
  }
  /* Verwaister Ebenen-Eintrag → überspringen */
  if (s.tlLayer) {
    var id = s.tlLayer;
    if (!leaving[id] && !layers.some(function (l) { return l.id === id; })) {
      setTimeout(function () { if (st().tlLayer === id) history.back(); }, 0);
    }
    return;
  }
  if (s.tlAsk) return;
  if (typeof s.i === "number") idx = s.i;
  if (wait) { wait = false; follow(); return; }
  if (!s.tlView || s.tlView === cur) return;       // z. B. Dialog geschlossen
  if (cur === "add") {
    var b = document.getElementById("edit-banner");
    if (b && b.classList.contains("show") && typeof window.resetForm === "function") window.resetForm();
  }
  fromPop = true;
  try { window.showView(s.tlView); } finally { fromPop = false; }
  window.scrollTo(0, 0);
});

document.addEventListener("tl:view", function (e) {
  cur = e.detail.view;
  if (fromPop) return;
  /* Ansichtswechsel bei offener Ebene: Ebenen gelten als geschlossen */
  while (layers.length) {
    var l = layers.pop();
    try { l.fn(); } catch (x) { if (window.console) console.error(x); }
  }
  follow();
});

window.tlBackLayer = function (fn) {
  var id = ++lid;
  layers.push({ id: id, fn: fn });
  history.pushState({ tlLayer: id }, "");
  return function release() {
    var i = -1;
    layers.forEach(function (l, j) { if (l.id === id) i = j; });
    if (i < 0) return;                       // schon per Zurück geschlossen
    layers.splice(i, 1);
    leaving[id] = 1;
    setTimeout(function () {
      delete leaving[id];
      if (st().tlLayer === id) history.back();
    }, 0);
  };
};

function first() {
  ["touchend", "click", "keydown"].forEach(function (t) { document.removeEventListener(t, first, true); });
  armed = true;
  follow();
}
["touchend", "click", "keydown"].forEach(function (t) { document.addEventListener(t, first, true); });
})();
