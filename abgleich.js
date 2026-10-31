/* ═══════════════════════════════════════════════════
   abgleich.js – Essen-Tab absichern (31.10.2026, Review)

   1. ABGLEICH BEIM START
      Anlass 04.10.: Die Posten vom 03.10. waren lokal verschwunden, obwohl
      kein Sync lief. Zurück kamen sie nur per Komplett-Restore.
      Jetzt: ~6 s nach dem Start (und höchstens alle 6 h) wird backup.json
      geholt und mit den letzten 7 Tagen verglichen. Ist ein Tag lokal leer,
      im Backup aber mit ≥ 3 Posten belegt, bietet die App an, genau diese
      Tage einzeln zurückzuholen – alles andere bleibt unangetastet.
      Bewusst nur "lokal leer": Ein Tag mit weniger Posten kann eine gewollte
      Löschung sein, die nur noch nicht gesichert ist.
      Nicht bei ungesicherten Änderungen (dirty) – dann ist das Backup älter.

   2. HINWEIS "GESTERN NICHT ABGESCHLOSSEN"
      Oben im Essen-Tab, solange gestern Posten hat, aber nicht abgeschlossen
      ist (tl-d kcal leer). Tipp springt auf den Vortag.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var KEY_CHECK = "tl-abg";   // Zeitpunkt der letzten Prüfung (lokal, nicht im Backup)

function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; } }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function vor(n) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return iso(d); }
function dm(s) { var d = new Date(s + "T12:00:00"); return ["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()] + " " + s.slice(8, 10) + "." + s.slice(5, 7) + "."; }

/* ─── 1. Abgleich ─────────────────────────────── */
function syncCfg() { return readJSON("tl-sync", {}) || {}; }

function pruefen(force) {
  var S = window.tlSync;
  if (!S || !S.ready || !S.ready() || !S.get) return;
  if (!force) {
    if (syncCfg().dirty) return;
    var last = +localStorage.getItem(KEY_CHECK) || 0;
    if (Date.now() - last < 6 * 3600e3) return;
  }
  S.get("backup.json", { cache: "no-store", headers: { "Accept": "application/vnd.github.raw+json" } })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (dump) {
      try { localStorage.setItem(KEY_CHECK, String(Date.now())); } catch (e) {}
      var bf = {}; try { bf = JSON.parse((dump.keys || {})["tl-f"] || "{}") || {}; } catch (e) {}
      var lf = readJSON("tl-f", {});
      var fehlt = [];
      for (var i = 0; i <= 7; i++) {
        var d = vor(i);
        var b = bf[d] || [], l = lf[d] || [];
        if (!l.length && b.length >= 3) fehlt.push({ date: d, n: b.length });
      }
      if (!fehlt.length) return;
      return window.tlAsk.confirm({
        title: "Einträge fehlen",
        text: "Im Backup stehen Essen-Posten, die auf diesem Gerät fehlen:\n" +
          fehlt.map(function (x) { return "• " + dm(x.date) + ": " + x.n + " Posten"; }).join("\n") +
          "\n\nNur diese Tage zurückholen? Alles andere bleibt, wie es ist.",
        ok: "Zurückholen"
      }).then(function (yes) {
        if (!yes) return;
        var cur = readJSON("tl-f", {});
        fehlt.forEach(function (x) { if (!(cur[x.date] || []).length) cur[x.date] = bf[x.date]; });
        localStorage.setItem("tl-f", JSON.stringify(cur));   // über sync.js-Hülle → Backup
        if (typeof window.buildFood === "function") window.buildFood();
        render();
        if (window.showFlash) showFlash(fehlt.length + (fehlt.length === 1 ? " Tag" : " Tage") + " zurückgeholt ✓");
      });
    })
    .catch(function () { /* still – nächster Start versucht es erneut */ });
}
window.tlAbgleich = function () { pruefen(true); };

/* ─── 2. Gestern nicht abgeschlossen ──────────── */
function render() {
  var box = document.getElementById("abg-yday"); if (!box) return;
  var y = vor(1), f = readJSON("tl-f", {}), d = readJSON("tl-d", []);
  var dy = d.find(function (x) { return x.date === y; }) || {};
  var offen = (f[y] || []).length && !dy.kcal;
  var el = document.getElementById("f-day");
  if (!offen || (el && el.value === y)) { box.innerHTML = ""; return; }
  box.innerHTML = '<div class="fphint abg-y" onclick="abgYday()"><strong>Gestern (' + dm(y) + ') nicht abgeschlossen</strong> – antippen zum Öffnen.</div>';
}
window.abgYday = function () {
  var el = document.getElementById("f-day");
  if (el) { el.value = vor(1); if (typeof window.buildFood === "function") window.buildFood(); }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function init() {
  var fv = document.getElementById("view-food");
  if (!fv || document.getElementById("abg-yday")) return;
  var st = document.createElement("style");
  st.textContent = ".abg-y { cursor:pointer; border-style:solid; border-color:#E8A33D; background:#FDF3E4; color:#7A5310; }";
  document.head.appendChild(st);
  var box = document.createElement("div"); box.id = "abg-yday";
  fv.insertBefore(box, fv.firstChild);
  var day = document.getElementById("f-day");
  if (day) day.addEventListener("change", render);
  var orig = window.showView;
  if (typeof orig === "function") {
    window.showView = function (v) { var r = orig.apply(this, arguments); if (v === "food") render(); return r; };
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { render(); setTimeout(function () { pruefen(false); }, 3000); }
  });
  render();
  setTimeout(function () { pruefen(false); }, 6000);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
