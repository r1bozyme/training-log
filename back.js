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

(function () {
  var a = document.querySelector('.view.active[id^="view-"]');
  if (a) cur = a.id.slice(5);
})();
history.replaceState({ tlView: ROOT, i: 0 }, "");

function st() { return history.state || {}; }

/* Verlauf an die angezeigte Ansicht cur anpassen */
function follow() {
  if (!armed) return;
  if (wait || st().tlAsk) { wait = true; return; }   // nach dem nächsten popstate
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
  if (!fromPop) follow();
});

function first() {
  ["touchend", "click", "keydown"].forEach(function (t) { document.removeEventListener(t, first, true); });
  armed = true;
  follow();
}
["touchend", "click", "keydown"].forEach(function (t) { document.addEventListener(t, first, true); });
})();
