/* ═══════════════════════════════════════════════════
   sw.js – Service Worker NUR fuer Erinnerungen (02.10.2026)

   Bewusst ohne fetch-Handler und ohne Cache: Die App laedt weiter
   ganz normal vom Netz, ein Update auf GitHub Pages ist sofort da.
   Scope ist /training-log/ – das Finanz-Cockpit unter derselben
   Herkunft bleibt unberuehrt.

   Die Pushes schickt der Workflow "reminders" im privaten Repo
   training-log-data. Er prueft vorher im Backup, ob noch etwas
   offen ist – hier wird nur angezeigt.

   Payload: { title, body, tag, silent, go }
     go = stiff | weight | food | yday | sync   (Sprungziel)
   ═══════════════════════════════════════════════════ */

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

/* Grosses Bild rechts in der Meldung zeigt, worum es geht. Links setzt
   Android ohnehin das App-Icon – ohne eigenes Bild fuellt Chrome den
   Platz mit dem Anfangsbuchstaben der Adresse ("R"). */
var ICONS = { stiff: "n-stiff.png", weight: "n-weight.png", food: "n-close.png",
              yfood: "n-yday.png", yday: "n-yday.png", sync: "n-sync.png" };

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  var opts = {
    body: d.body || "",
    tag: d.tag || "tl",
    renotify: !d.silent,          // Nachfass-Meldung ersetzt die stille und klingelt
    silent: !!d.silent,
    data: { go: d.go || "" },
    icon: ICONS[d.go] || "n-bell.png",
    badge: "badge-96.png",   // Statusleiste, nur Alphakanal
    lang: "de"
  };
  e.waitUntil(self.registration.showNotification(d.title || "Training Log", opts));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var go = (e.notification.data && e.notification.data.go) || "";
  var url = new URL("./" + (go ? "?go=" + encodeURIComponent(go) : ""), self.registration.scope).href;

  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    /* Android holt das offene App-Fenster nach vorn, ohne die URL neu zu
       laden – deshalb das Ziel zusaetzlich per Nachricht schicken. */
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) {
        c.postMessage({ type: "tl-go", go: go });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
