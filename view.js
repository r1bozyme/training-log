/* ═══════════════════════════════════════════════════
   view.js – Ansichtswechsel als Ereignis (10.11.2026)

   Ersetzt showView() aus index.html vollständig:
     1. schaltet alle Ansichten (.view mit id="view-…") generisch um,
        auch die von Modulen angelegten (food, vorrat, einkauf, health),
     2. ruft die drei Grund-Renderer aus index.html (Log, Stats, Werte),
     3. meldet den Wechsel als Ereignis "tl:view" am document,
        detail.view = Name der Ansicht.

   Module hören zu, statt showView zu umschließen:
     document.addEventListener("tl:view", function (e) {
       if (e.detail.view === "food") render();
     });
   Die Zuhörer laufen in der Reihenfolge ihrer Anmeldung, also in
   Ladereihenfolge. Ein Fehler in einem Zuhörer hält die anderen nicht
   auf (früher brach er alle äußeren Schichten mit ab) und landet im
   Fehlerprotokoll (diag.js).

   Lädt als erstes Modul. Hängt nicht davon ab, ob index.html die alten
   Knöpfe der unteren Leiste (nav-…) noch enthält.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";
if (window.tlViewCore) return;
window.tlViewCore = 1;

function call(name) {
  if (typeof window[name] === "function") window[name]();
}

function showView(v) {
  var i;
  var views = document.querySelectorAll('.view[id^="view-"]');
  for (i = 0; i < views.length; i++) views[i].classList.toggle("active", views[i].id === "view-" + v);
  var btns = document.querySelectorAll('.bnav .nbtn[id^="nav-"]');
  for (i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].id === "nav-" + v);
  try {
    if (v === "log")    call("renderLog");
    if (v === "stats")  call("buildStats");
    if (v === "weight") call("buildWeight");
  } finally {
    document.dispatchEvent(new CustomEvent("tl:view", { detail: { view: v } }));
  }
}

window.showView = showView;
})();
