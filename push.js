/* ═══════════════════════════════════════════════════
   push.js – Erinnerungen (02.10.2026, umgebaut 31.10.2026)

   Seit 09.10. laufen die Erinnerungen nur noch über ntfy (eigene App,
   geheimer Kanal); Chrome hat das Web-Push-Abo auf dem Handy immer
   wieder verworfen. 31.10. (Review): Der Chrome-Push-Teil ist entfernt –
   kein Abo, keine Selbstheilung, keine Abo-Uploads mehr. Ein noch
   vorhandenes Browser-Abo wird beim Start einmal still beendet.

   Geblieben:
   · go(): Sprungziele für ?go=… (ntfy-Klick-URL) und Nachrichten des
     Service Workers (stiff, thumb, weight, yday, supps, food, yfood,
     sync, einkauf, vorrat).
   · Kasten im Log-Tab: Status und An/Aus. Der Schalter schreibt
     push/subscription.json mit on:true/false – der Erinnerungsdienst
     (training-log-data/push/remind.js) schweigt bei on:false.

   localStorage "tl-push" ist bewusst KEIN Daten-Key (kein Sync).
   ═══════════════════════════════════════════════════ */

(function () {

var KEY  = "tl-push";
var PATH = "push/subscription.json";

function st() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
function saveSt(o) { localStorage.setItem(KEY, JSON.stringify(o)); }
function flash(m) { if (typeof window.showFlash === "function") window.showFlash(m); }
function syncReady() { return !!(window.tlSync && window.tlSync.ready && window.tlSync.ready()); }

function localDate(offsetDays) {
  var d = new Date(); d.setDate(d.getDate() + (offsetDays || 0));
  var p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* Altes Chrome-Abo einmal still beenden (Service Worker bleibt für Klicks registriert) */
function dropBrowserSub() {
  if (!("serviceWorker" in navigator)) return;
  var s = st(); if (s.dropped) return;
  navigator.serviceWorker.getRegistration("./").then(function (reg) {
    if (!reg || !reg.pushManager) return null;
    return reg.pushManager.getSubscription().then(function (sub) { return sub ? sub.unsubscribe() : null; });
  }).then(function () { var t = st(); t.dropped = new Date().toISOString(); saveSt(t); }).catch(function () {});
}

function setOn(on) {
  if (!syncReady()) { flash("Erst das Backup einrichten (⚙︎)"); return; }
  var body = { v: 2, on: !!on, ts: new Date().toISOString(), why: "manuell", channel: "ntfy" };
  window.tlSync.put(PATH, JSON.stringify(body, null, 1), on ? "push: Erinnerungen an (ntfy)" : "push: Erinnerungen aus")
    .then(function () { var s = st(); s.on = !!on; s.off = !on; saveSt(s); render(); flash(on ? "Erinnerungen an ✓" : "Erinnerungen aus"); })
    .catch(function (e) { flash("Fehler: " + (e && e.message || e)); });
}

function pulse(id) {
  var sec = document.getElementById(id);
  if (!sec) return;
  sec.scrollIntoView({ behavior: "smooth", block: "center" });
  sec.classList.add("dflash");
  setTimeout(function () { sec.classList.remove("dflash"); }, 1700);
}

function go(where) {
  if (typeof window.showView !== "function") return;
  var today = typeof window.todayStr === "function" ? window.todayStr() : localDate(0);
  if (where === "stiff" || where === "thumb" || where === "weight" || where === "yday" || where === "supps") {
    window.showView("weight");
    var dd = document.getElementById("d-date");
    if (dd && where !== "yday" && dd.value !== today) {
      dd.value = today; if (typeof window.buildDaily === "function") window.buildDaily();
    }
    if (where === "yday") {
      var el = document.getElementById("d-date");
      if (el) { el.value = localDate(-1); if (typeof window.buildDaily === "function") window.buildDaily(); }
      flash("Gestern: " + localDate(-1).split("-").reverse().join("."));
      setTimeout(function () { window.scrollTo({ top: 0, behavior: "smooth" }); }, 150);
      return;
    }
    setTimeout(function () { pulse({ stiff: "d-stiffsec", thumb: "d-thumbsec", supps: "d-supsec" }[where] || "d-weightsec"); }, 150);
  } else if (where === "einkauf" || where === "vorrat") {
    window.showView(where);
    setTimeout(function () { window.scrollTo({ top: 0, behavior: "smooth" }); }, 100);
  } else if (where === "food" || where === "yfood") {
    window.showView("food");
    var fd = document.getElementById("f-day");
    if (fd && where === "food" && fd.value !== today) {
      fd.value = today; if (typeof window.buildFood === "function") window.buildFood();
    }
    if (where === "yfood") {
      var f = document.getElementById("f-day");
      if (f) { f.value = localDate(-1); if (typeof window.buildFood === "function") window.buildFood(); }
      flash("Gestern: " + localDate(-1).split("-").reverse().join("."));
    }
  } else if (where === "sync") {
    window.showView("log");
    setTimeout(function () { pulse("sync-box"); }, 150);
  }
}

/* ─── Oberflaeche (Log-Tab, unter dem Backup-Kasten) ─────── */
function statusHTML() {
  var s = st();
  if (s.off) return "Erinnerungen: <b style='color:var(--text)'>aus</b>.";
  return "Erinnerungen: <b style='color:var(--text)'>an</b> über die App <b>ntfy</b>." +
    "<br>Morgens ~05:50 still, Nachfass ~08:30, Einnahme ~10:10, abends ~21:30 – nur wenn etwas offen ist." +
    "<br>Freitag ab 20 Uhr: Einkaufsliste; Online-Bestellungen mit ~10 Tagen Vorlauf.";
}

function render() {
  var box = document.getElementById("tlr-status");
  if (!box) return;
  box.innerHTML = statusHTML();
  var b = document.getElementById("tlr-toggle");
  if (b) b.textContent = st().off ? "🔔 Einschalten" : "Ausschalten";
}

function mount() {
  var view = document.getElementById("view-log");
  if (!view || document.getElementById("tlr-box")) return;
  var box = document.createElement("div");
  box.className = "wnote";
  box.id = "tlr-box";
  box.innerHTML =
    '<div id="tlr-status" style="margin-bottom:10px"></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button id="tlr-toggle" class="fbtn"></button></div>';
  var sb = document.getElementById("sync-box");
  if (sb && sb.parentNode === view) view.insertBefore(box, sb.nextSibling); else view.appendChild(box);
  document.getElementById("tlr-toggle").onclick = function () { setOn(!!st().off); };
  render();
}

/* ─── Init ──────────────────────────────────────────────── */
function init() {
  mount();
  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) { origShow(v); if (v === "log") { mount(); render(); } };
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "tl-go") go(e.data.go);
    });
  }
  try {
    var p = new URLSearchParams(location.search);
    var target = p.get("go");
    if (target) {
      setTimeout(function () { go(target); }, 250);
      p.delete("go");
      var q = p.toString();
      history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
    }
  } catch (e) { /* unkritisch */ }
  setTimeout(dropBrowserSub, 3000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.tlPush = { go: go, on: function () { setOn(true); }, off: function () { setOn(false); } };
})();
