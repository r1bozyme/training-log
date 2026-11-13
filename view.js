/* ═══════════════════════════════════════════════════
   view.js – Ansichtswechsel als Ereignis (10.11.2026)

   Einzige showView() der App (die alte in index.html ist seit dem 12.11. entfernt):
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

   Lädt als erstes Modul. Die untere Leiste und die Chips zeichnet nav.js;
   die alten fünf Knöpfe (nav-…) sind seit dem 12.11. aus index.html entfernt.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";
if (window.tlViewCore) return;
window.tlViewCore = 1;

function call(name) {
  if (typeof window[name] === "function") window[name]();
}

var vorherY = null;   // Scrollposition vor dem letzten Wechsel (tlScrollTop)

function showView(v) {
  var i;
  /* vor dem Umschalten merken: eine kürzere Ansicht setzt die Position sonst
     schon zurück, bevor tlScrollTop sie lesen kann */
  vorherY = window.scrollY;
  var views = document.querySelectorAll('.view[id^="view-"]');
  for (i = 0; i < views.length; i++) views[i].classList.toggle("active", views[i].id === "view-" + v);
  try {
    if (v === "log")    call("renderLog");
    if (v === "stats")  call("buildStats");
    if (v === "weight") call("buildWeight");
  } finally {
    document.dispatchEvent(new CustomEvent("tl:view", { detail: { view: v } }));
  }
}

window.showView = showView;

/* 13.11.: Nach einem Ansichtswechsel nach oben – aber war der Kopf
   („Training Log“) schon weggescrollt, bleibt er weg: die neue Ansicht
   beginnt direkt unter den Chips. */
window.tlScrollTop = function () {
  var hdr = document.querySelector("#app .hdr");
  var chips = document.getElementById("chipnav");
  var keep = hdr ? hdr.offsetTop + hdr.offsetHeight + (chips ? parseFloat(getComputedStyle(chips).marginTop) || 0 : 0) : 0;
  var y = vorherY !== null ? vorherY : window.scrollY;
  vorherY = null;
  /* Kopf gilt als weg, sobald er zur Hälfte hinausgescrollt ist */
  var weg = !!hdr && y >= hdr.offsetTop + hdr.offsetHeight / 2;
  /* Kurze Ansichten (Einkauf, Tracker …) lassen sich sonst nicht so weit
     scrollen – dann unten so viel Platz geben, dass der Kopf weg bleiben kann. */
  document.body.style.minHeight = weg ? (keep + window.innerHeight) + "px" : "";
  window.scrollTo(0, weg ? keep : 0);
};
})();
