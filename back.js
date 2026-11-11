/* ═══════════════════════════════════════════════════
   back.js – Zurück-Geste in der Eintrag-Ansicht (11.11.2026)

   Android-Zurück (Wischen vom Rand) schloss in „＋ Eintrag“ die ganze
   App, weil die Ansicht keinen eigenen Verlaufseintrag hatte. Jetzt
   bekommt „add“ einen Verlaufseintrag {tlBack:1}; Zurück führt dann zur
   vorherigen Ansicht (ohne Vorgänger, z. B. direkt nach dem Start: Log).
   Im Bearbeiten-Modus wirkt Zurück wie „Abbrechen“ (cancelEdit).

   - Eintrag wird beim Öffnen von „add“ angelegt, beim Start (App öffnet
     in „add“) erst bei der ersten Berührung – Chrome überspringt
     Verlaufseinträge, die ohne Nutzeraktion angelegt wurden.
   - Wer „add“ anders verlässt (Speichern im Bearbeiten-Modus, Leiste,
     Chips), räumt den Eintrag still wieder ab.
   - Verträgt sich mit dialog.js: dessen {tlAsk:1} liegt obenauf; Zurück
     bei offenem Dialog schließt nur den Dialog.
   Andere Ansichten bleiben unverändert (Zurück verlässt die App).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";
if (window.tlBackCore) return;
window.tlBackCore = 1;

var cur = "add", prev = null, armed = false;
(function () {
  var a = document.querySelector('.view.active[id^="view-"]');
  if (a) cur = a.id.slice(5);
})();

function st() { return history.state || {}; }

function arm() {
  if (cur !== "add" || armed) return;
  armed = true;
  if (!st().tlBack) history.pushState({ tlBack: 1 }, "");
}

/* Eintrag abräumen, wenn „add“ ohne Zurück verlassen wurde. Liegt noch
   ein Dialog-Eintrag obenauf (dessen history.back läuft gerade), nach
   dessen popstate erneut prüfen. */
function disarm(tries) {
  var s = st();
  if (s.tlBack) { history.back(); return; }
  if (s.tlAsk && tries > 0) {
    var t = null;
    var again = function () {
      window.removeEventListener("popstate", again); clearTimeout(t);
      setTimeout(function () { if (cur !== "add") disarm(tries - 1); }, 0);
    };
    window.addEventListener("popstate", again);
    t = setTimeout(again, 600);
  }
}

window.addEventListener("popstate", function () {
  if (!armed || st().tlBack) return;      // Dialog geschlossen o. Ä.
  armed = false;
  if (cur !== "add") return;
  var banner = document.getElementById("edit-banner");
  if (banner && banner.classList.contains("show") && typeof window.cancelEdit === "function") {
    window.cancelEdit();
  } else {
    window.showView(prev && prev !== "add" ? prev : "log");
  }
  window.scrollTo(0, 0);
});

document.addEventListener("tl:view", function (e) {
  var v = e.detail.view;
  if (v === cur) return;
  prev = cur; cur = v;
  if (v === "add") arm();
  else if (prev === "add" && armed) { armed = false; disarm(2); }
});

/* Start in „add“: Eintrag bei der ersten Berührung anlegen */
function first() {
  ["touchend", "click", "keydown"].forEach(function (t) { document.removeEventListener(t, first, true); });
  arm();
}
["touchend", "click", "keydown"].forEach(function (t) { document.addEventListener(t, first, true); });
})();
