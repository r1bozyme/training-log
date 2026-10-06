/* ═══════════════════════════════════════════════════
   push.js – Erinnerungen per System-Benachrichtigung (02.10.2026)

   Ablauf:
   1. "Aktivieren" im Log-Tab fragt die Benachrichtigungs-Erlaubnis ab,
      registriert sw.js und legt ein Push-Abo an.
   2. Das Abo landet als push/subscription.json im privaten Daten-Repo
      (ueber denselben Token wie das Backup, sync.js).
   3. Der Workflow "reminders" dort liest backup.json und schickt nur,
      was noch offen ist:
        ~05:50 still  – Steifigkeit, Wiegen (Di/Fr), Gestern offen
        ~08:30 Ton    – Nachfass, nur wenn noch offen
        ~10:00 Ton    – Supplements & Medikamente, wenn nicht abgehakt (03.10.)
        ~21:30        – Tag abschliessen, Backup veraltet (> 3 Tage)
   4. Tippen auf die Meldung springt per ?go= bzw. Nachricht des
      Service Workers an die passende Stelle.

   localStorage "tl-push" ist bewusst KEIN Daten-Key (kein Sync).
   CSS-Klassen mit Praefix .tlr- (vorher auf Kollisionen geprueft).
   ═══════════════════════════════════════════════════ */

(function () {

var VAPID_PUBLIC = "BDHjTILs5t3Z50ClZFNEeq1MToPeeE6Xqt4HNggTB_rqtrVTl5K5b05ECf9KkBUcs7pJigro5ZeR5CegMHEpI8Q";
var KEY  = "tl-push";
var PATH = "push/subscription.json";

var supported = ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);

function st() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
function saveSt(o) { localStorage.setItem(KEY, JSON.stringify(o)); }
function flash(m) { if (typeof window.showFlash === "function") window.showFlash(m); }
function syncReady() { return !!(window.tlSync && window.tlSync.ready && window.tlSync.ready()); }

function keyBytes(b64) {
  var pad = "=".repeat((4 - b64.length % 4) % 4);
  var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function localDate(offsetDays) {
  var d = new Date(); d.setDate(d.getDate() + (offsetDays || 0));
  var p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* ─── Abo ───────────────────────────────────────────────── */
function registerSW() {
  return navigator.serviceWorker.register("sw.js", { scope: "./" })
    .then(function () { return navigator.serviceWorker.ready; });
}

function upload(sub, why) {
  var body = sub
    ? { v: 1, on: true, ts: new Date().toISOString(), why: why || "manuell", sub: sub.toJSON() }
    : { v: 1, on: false, ts: new Date().toISOString() };
  return window.tlSync.put(PATH, JSON.stringify(body, null, 1),
                           sub ? "push: Abo aktiviert" : "push: Abo beendet");
}

function enable() {
  if (!supported) { flash("Nicht unterstützt"); return; }
  if (!syncReady()) { flash("Erst das Backup einrichten (⚙︎)"); return; }
  Notification.requestPermission().then(function (perm) {
    if (perm !== "granted") { flash("Benachrichtigungen nicht erlaubt"); render(); throw null; }
    return registerSW();
  }).then(function (reg) {
    return reg.pushManager.getSubscription().then(function (old) {
      return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
    });
  }).then(function (sub) {
    return upload(sub, "manuell").then(function () {
      saveSt({ on: true, ep: sub.endpoint, since: localDate(0), chk: Date.now() });
      flash("Erinnerungen aktiv – Bestätigung kommt gleich");
      render();
    });
  }).catch(function (e) {
    if (e === null) return;
    console.error("push:", e);
    flash("Fehler – siehe Status");
    var s = st(); s.err = String(e && e.message || e); saveSt(s); render();
  });
}

function disable() {
  var unsub = navigator.serviceWorker.getRegistration("./").then(function (reg) {
    return reg ? reg.pushManager.getSubscription() : null;
  }).then(function (sub) { return sub ? sub.unsubscribe() : true; });
  unsub.then(function () { return syncReady() ? upload(null) : true; })
    .then(function () { saveSt({ on: false }); flash("Erinnerungen aus"); render(); })
    .catch(function (e) { console.error("push:", e); flash("Fehler beim Ausschalten"); });
}

function test() {
  navigator.serviceWorker.getRegistration("./").then(function (reg) {
    if (!reg) { flash("Erst aktivieren"); return; }
    return reg.showNotification("Test: Morgensteifigkeit", {
      body: "So sehen die Erinnerungen aus. Tippen springt zur Steifigkeit.",
      tag: "tl-test", data: { go: "stiff" }, lang: "de",
      icon: "n-stiff.png", badge: "badge-96.png"
    });
  });
}

/* Selbstheilung (06.10.): Chrome tauscht das Abo auf diesem Handy immer wieder
   aus, ohne den Service Worker zu benachrichtigen – Pushes an das alte gehen dann
   mit 410 ins Leere. Deshalb bei jedem Oeffnen und Zurueckkehren in die App:
   - lokales Abo gegen das im Daten-Repo pruefen (push/subscription.json),
   - gegen die Tot-Meldung des Erinnerungsdienstes (push/health.json),
   und bei Abweichung sofort ein gueltiges Abo hochladen. "why" landet in
   subscription.json: geaendert = Chrome hat getauscht, fehlte = kein lokales Abo,
   tot = vom Push-Dienst abgemeldet, repo = Repo hatte ein anderes/keins. */
function repoJSON(p) {
  return window.tlSync.get(p, { headers: { "Accept": "application/vnd.github.raw+json" } })
    .then(function (r) { return r.status === 404 ? null : (r.ok ? r.json() : Promise.reject(new Error("GET " + p + ": " + r.status))); });
}

function freshSub(reg) {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
}

var healing = false, lastHeal = 0;
function heal() {
  var s = st();
  if (!supported || !s.on || healing) return;
  if (Notification.permission !== "granted") { render(); return; }
  if (!syncReady()) return;
  healing = true; lastHeal = Date.now();
  var why = "";
  registerSW().then(function (reg) {
    return Promise.all([reg.pushManager.getSubscription(), repoJSON(PATH), repoJSON("push/health.json")])
      .then(function (r) {
        var sub = r[0], repo = r[1] || {}, health = r[2] || {};
        if (sub && health.dead === sub.endpoint) {
          why = "tot";
          return sub.unsubscribe().catch(function () {}).then(function () { return freshSub(reg); });
        }
        if (!sub) { why = "fehlte"; return freshSub(reg); }
        if (sub.endpoint !== s.ep) why = "geaendert";
        else if (!repo.on || !repo.sub || repo.sub.endpoint !== sub.endpoint) why = "repo";
        return sub;
      });
  }).then(function (sub) {
    s = st(); s.chk = Date.now(); delete s.healErr;
    if (!why) { saveSt(s); render(); return; }
    return upload(sub, why).then(function () {
      s.ep = sub.endpoint; delete s.err; s.fix = Date.now(); s.fixWhy = why; saveSt(s); render();
    });
  }).catch(function (e) {
    console.warn("push heal:", e);
    var t = st(); t.healErr = hm(Date.now()) + " " + (why ? "[" + why + "] " : "") + String((e && (e.name + ": " + e.message)) || e).slice(0, 160);
    saveSt(t); render();
  }).then(function () { healing = false; });
}

/* Beim Zurueckkehren in die App erneut pruefen, hoechstens alle 10 Min. */
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && Date.now() - lastHeal > 10 * 60 * 1000) heal();
});

/* ─── Sprungziele ───────────────────────────────────────── */
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
  if (where === "stiff" || where === "weight" || where === "yday" || where === "supps") {
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
    setTimeout(function () { pulse({ stiff: "d-stiffsec", supps: "d-supsec" }[where] || "d-weightsec"); }, 150);
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
  if (!supported) return "Erinnerungen: auf diesem Gerät nicht unterstützt.";
  if (s.on && Notification.permission === "denied")
    return "Erinnerungen: <b style='color:#B3261E'>blockiert</b> – in den App-Einstellungen von Android wieder erlauben.";
  if (s.err) return "Erinnerungen: <b style='color:#B3261E'>Fehler</b> – " + s.err;
  if (s.on) return "Erinnerungen: <b style='color:var(--text)'>an</b>" + (s.since ? " seit " + s.since.split("-").reverse().join(".") : "") +
                   "<br>Morgens ~05:50 still, Nachfass ~08:30, Einnahme ~10:10, abends ~21:30 – nur wenn etwas offen ist." +
                   (s.chk ? "<br><span style='opacity:.7'>Abo geprüft " + hm(s.chk) +
                     (s.fix ? " · zuletzt erneuert " + dm(s.fix) + " " + hm(s.fix) + " (" + s.fixWhy + ")" : "") + "</span>" : "") +
                   (s.healErr ? "<br><b style='color:#B3261E'>Prüfung fehlgeschlagen</b> " + s.healErr : "");
  if (!syncReady()) return "Erinnerungen: aus. Brauchen das Backup – erst oben ⚙︎ Einstellungen.";
  return "Erinnerungen: aus.";
}

function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function dm(t) { var d = new Date(t); return d.getDate() + "." + (d.getMonth() + 1) + "."; }

function render() {
  var box = document.getElementById("tlr-box");
  if (!box) return;
  var on = st().on;
  document.getElementById("tlr-status").innerHTML = statusHTML();
  document.getElementById("tlr-toggle").textContent = on ? "Ausschalten" : "🔔 Aktivieren";
  document.getElementById("tlr-test").style.display = on ? "" : "none";
  document.getElementById("tlr-toggle").style.display = supported ? "" : "none";
}

function mount() {
  var view = document.getElementById("view-log");
  if (!view || document.getElementById("tlr-box")) return;
  var box = document.createElement("div");
  box.className = "wnote";
  box.id = "tlr-box";
  box.innerHTML =
    '<div id="tlr-status" style="margin-bottom:10px"></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="tlr-toggle" class="fbtn"></button>' +
      '<button id="tlr-test" class="fbtn">Test</button>' +
    "</div>";
  var sb = document.getElementById("sync-box");
  if (sb && sb.parentNode === view) view.insertBefore(box, sb.nextSibling); else view.appendChild(box);
  document.getElementById("tlr-toggle").onclick = function () {
    var s = st(); delete s.err; saveSt(s);
    if (s.on) disable(); else enable();
  };
  document.getElementById("tlr-test").onclick = test;
  render();
}

/* ─── Init ──────────────────────────────────────────────── */
function init() {
  mount();
  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) { origShow(v); if (v === "log") { mount(); render(); } };
  }

  if (supported) {
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

  setTimeout(heal, 2000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.tlPush = { enable: enable, disable: disable, test: test, go: go };

})();
