# Muster aus training-log

Bewährte Lösungen aus dieser App, die sich auf andere Apps übertragen lassen
(vor allem auf das Finanz-Cockpit, r1bozyme/finance-cockpit). Jeder Eintrag
nennt das Problem, die Lösung, die Stolperfallen und wo es im Code steht.
Details stehen im Kopfkommentar der jeweiligen Datei und in den
Commit-Nachrichten (`git show <commit>`).

**So nutzen:** Im anderen Projekt reicht ein Satz wie: „Lies MUSTER.md in
r1bozyme/training-log, Abschnitt *Sofort-Updates*, und übertrage das
sinngemäß.“ Schau dir aber zuerst an, wie die Ziel-App aufgebaut ist, und
kopiere den Code nicht blind.

**Pflege:** Wird hier ein Muster neu gebaut oder geändert, das sich übertragen
lässt, kommt es im selben Arbeitsgang hier rein bzw. wird hier aktualisiert.
Zuletzt aktualisiert: 21.11.2026 (Nachtmodus, aus dem Finanz-Cockpit, in training-log umgesetzt).

---

## Laden & Aktualisieren

### Sofort-Updates beim Start
- **Problem:** GitHub Pages hält Dateien bis zu 10 Minuten im Browser-Cache
  (`max-age=600`). Nach einem Push läuft deshalb noch die alte Fassung.
- **Lösung (Stand 17.11., überarbeitet nach dem Finanz-Cockpit):**
  1. Ein Modul-Loader (Liste `MODS`) gleicht jedes Modul mit
     `fetch(src, { cache: "no-cache" })` ab. Ist nichts geändert, kommt eine
     kurze 304-Antwort. Ausgeführt wird **genau dieser Text**
     (`script.text` + `//# sourceURL=`) in fester Reihenfolge, nicht per
     `<script src>`. Eine Kopie landet im Cache Storage (`caches`, hier
     `tl-mods`).
  2. **Rückfall:** Hängt das Netz, startet die App nach 2,5 s mit den Kopien,
     offline sofort. Nur ohne Kopie (allererster Start) bleibt `<script src>`
     der Rückfall.
  3. **Neue index.html und neuer Loader:** Beide laufen schon, wenn der
     Abgleich fertig ist. Weicht die frische Fassung ab, wird einmal neu
     geladen. Ein Flag in sessionStorage verhindert Schleifen. Damit sind neues
     Markup, neue Plan-Daten und neue Einträge in `MODS` schon beim ersten
     Start nach dem Push da, ohne Nachlade-Umwege in einzelnen Modulen.
- **Stolperfallen:**
  - **Rückfall per `<script src>` hängt.** Läuft der `no-cache`-Abgleich
    noch, sperrt Chrome den Cache-Eintrag, und das Skript-Tag wartet darauf.
    Gemessen: 160 s statt 2,5 s. Abbrechen per AbortController hilft nicht,
    Chrome verwirft dabei den Eintrag. *(Erkannt im Cockpit.)*
  - **Abweichung erkennen:** Im Cockpit über eine Build-Kennung
    `<meta name="app-build">`, die bei jeder Änderung an index.html
    hochgezählt wird *(Idee aus dem Cockpit)*. In training-log automatisch:
    Der zwischengespeicherte Text (`cache: "force-cache"`, also das, was
    gerade läuft) wird mit dem frisch abgeglichenen verglichen, für
    index.html und plan.js. Damit kann man nichts vergessen. Die Reihenfolge
    zählt: erst force-cache lesen, dann no-cache.
  - **Kopien nicht in localStorage,** wenn die App sich die Herkunft
    r1bozyme.github.io mit einer anderen App teilt. Das 5-MB-Kontingent gilt
    für beide Apps zusammen, und volle Daten-Keys wären schlimmer als eine
    fehlende Kopie. Das Cockpit (kleine Module) nutzt localStorage,
    training-log (~550 KB Module) den Cache Storage.
  - Nachlade-Umwege in Modulen (`script[src=…]` prüfen und nachladen)
    vertragen sich nicht mit Ausführung per `script.text` und laden doppelt.
    Sie sind mit der Neulade-Logik überflüssig und in training-log entfernt
    (daily.js).
- **Code:** Ende von `plan.js` · Commits a81fc40, c057943, Überarbeitung
  17.11. · Cockpit: `app/index.html` (regel-cockpit 3a43038)

### Testen von Cache-Verhalten
- **Testserver** wie GitHub Pages: HTTP/1.1, `ETag`, `Cache-Control:
  max-age=600`. Pythons `BaseHTTPRequestHandler` braucht dafür
  `protocol_version = "HTTP/1.1"` und `Content-Length`, sonst gleicht Chrome
  per ETag nicht ab. *(Erkannt im Cockpit.)*
- **Persistentes Profil** (`launch_persistent_context`). Inkognito-Kontexte
  von Playwright cachen nicht *(erkannt im Cockpit)*. Außerdem kein
  `page.route()`, das schaltet den HTTP-Cache ab. Externe Adressen stattdessen
  per `--host-resolver-rules` ins Leere schicken.
- **Kaltstart** = Browser schließen und mit demselben Profil neu öffnen.
- **Hängendes Netz** im Server simulieren (Antwort verzögern), **offline** per
  `context.set_offline(True)`.
- **Neuladen zählen** über `page.on("domcontentloaded")`. `framenavigated`
  zählt auch `pushState`/`replaceState` mit (back.js).
- **Fälle:** geändertes Modul, hängendes Netz (20 s), offline, neue
  index.html, neues Modul in `MODS`, nur Plan-Daten geändert, unverändert
  (kein Neuladen), echte Daten aus backup.json ohne Fehler.

### Smoke-Test vor jedem Push
- **Problem:** Ein Fehler in einem Modul fällt sonst erst auf dem Handy auf,
  `node --check` findet nur Syntaxfehler.
- **Lösung:** `test/smoke.py` (Python + Playwright, ohne Abhängigkeiten im
  Repo): `node --check` aller Module, `MODS` gegen die Dateien im Repo,
  statische Suche nach fremden Storage-Keys, dann Headless-Start im
  Handy-Viewport. Jede Ansicht wird per `showView` geöffnet, danach
  müssen alle localStorage-Keys das eigene Präfix haben und das
  Fehlerprotokoll (`tl-err`) leer sein. Externe Anfragen werden blockiert,
  Fehler daraus zählen nicht. Exit-Code 0/1, steht als Pflichtschritt in
  CLAUDE.md.
- **Stolperfallen:**
  - Keys über `localStorage.key(i)` lesen, nicht `Object.keys(localStorage)`.
    Überschreibt ein Modul `localStorage.setItem` (sync.js), erscheinen
    sonst `setItem`/`removeItem` als Keys.
  - Statische Suche nur nach vollständigen fremden Keys (`fc-…`). Das
    reine Präfix `"fc-"` zum Messen der Belegung (diag.js) ist erlaubt.
  - `page.route()` ist hier in Ordnung (Cache egal). Für Cache-Tests gilt
    der Abschnitt oben.
  - Gegenprobe gemacht: eingebauter Laufzeitfehler und fremder Key werden
    erkannt.
- **Wo:** `test/smoke.py`, `CLAUDE.md` (Arbeitsablauf).

### Kein Service Worker
- Ein Service Worker ist eine zweite Cache-Ebene, die Sofort-Updates
  zuverlässig ausbremst. (Den Cache Storage für die Modul-Kopien gibt es auch
  ohne Service Worker.) Er diente hier nur den Chrome-Push-Meldungen und ist
  seit dem 16.11. entfernt. Eine alte Registrierung wird beim Start einmal
  still abgemeldet (`push.js`).
- **Commit:** dce2ad9

### Installierbare PWA
- Web-Manifest mit eigener `id` und `start_url`. Ändert sich eines davon,
  verwechselt Chrome die App sonst mit der alten Verknüpfung. Icons gibt es als
  PNG und als maskable.
- **Commits:** c854351, 3f2ac79

---

## Navigation & Scrollen

### Ansichtswechsel als Ereignis
- **Problem:** Module, die `showView` umschließen, bilden eine fragile
  Kette. Ein Fehler in einer Schicht bricht alle anderen mit ab.
- **Lösung:** Eine einzige `showView` (view.js) schaltet um und meldet den
  Wechsel als Ereignis `tl:view` (`detail.view`). Module hören nur zu. Ein
  Fehler in einem Zuhörer hält die anderen nicht auf.
- **Code:** `view.js` · Commits be6c39f, fe43ba5, 1bc42af

### Weggescrollter Kopf bleibt weg
- **Problem:** Nach einem Ansichtswechsel ging es immer ganz nach oben, und der
  App-Titel war wieder da.
- **Lösung:** Statt `scrollTo(0, 0)` wird `tlScrollTop()` aufgerufen. War der
  Kopf beim Wechsel zur Hälfte oder mehr weggescrollt, beginnt die neue Ansicht
  direkt unter dem Kopf bzw. den Chips.
- **Stolperfallen:** (1) Die Scrollposition muss gemerkt werden, *bevor*
  umgeschaltet wird, sonst kappt eine kürzere Ansicht sie vorher. (2) Ist die
  Ansicht zu kurz, bekommt der body eine `min-height` von Kopfhöhe +
  Fensterhöhe. (3) `history.scrollRestoration = "manual"`, sonst stellt der
  Browser bei Zurück die alte Position wieder her.
- **Code:** `view.js`, `back.js` · Commits 479b0d0, 9375a19, 51deb10

### Bereiche unten, Chips oben, schwebender Knopf
- Unten nur wenige Bereiche, darüber Chips für die Unteransichten. Die
  Hauptaktion liegt als schwebender Knopf darüber („＋ Eintrag“, „Tag ▴“ mit
  Menü) statt in einer Aktionsleiste. Ein Tipp auf einen Bereich öffnet die
  Ansicht, die dort zuletzt offen war.
- **Code:** `nav.js` · Commits 8bf583b, 6b8762c · *Chips-Stil stammt aus dem
  Finanz-Cockpit.*

### Wischen zwischen Unteransichten
- Die Seite folgt dem Finger. Sie rastet ab 22 % der Breite oder ab
  0,5 px/ms in der Nachbaransicht ein, sonst federt sie zurück. Die Richtung
  wird nach 10 px entschieden: waagerecht nur innerhalb der ersten 200 ms und
  bei |dx| > 1,2·|dy|. Eingabefelder, Leisten, Dialoge und seitlich scrollende
  Elemente sind ausgenommen.
- **Code:** `swipe.js` · Commit 65439a7 · *Ursprünglich aus dem Finanz-Cockpit
  (regel-cockpit, 7c4af5f).*

### Android-Zurück
- Jede Ansicht bekommt einen eigenen Verlaufseintrag, die unterste Ebene
  verlässt die App. Wird eine Ansicht erneut besucht, springt der Verlauf
  dorthin zurück, sodass kein Endlos-Stapel entsteht. Überlagerungen (Scanner,
  Menüs) melden sich mit `tlBackLayer(beiZurueck)` an. Zurück schließt dann nur
  diese Ebene.
- **Stolperfalle:** Chrome überspringt Verlaufseinträge, die ohne
  Nutzeraktion angelegt wurden. Den ersten Eintrag deshalb erst bei der ersten
  Berührung anlegen.
- **Code:** `back.js` · Commits 601ca56, 0b97442, a7fe0d2

### Sprung zu einer Karte
- Ist eine Karte höher als der Bildschirm, wird das Eingabefeld angefahren
  statt der Kartenmitte. Sprungziele lassen sich von außen über `?go=…` öffnen,
  zum Beispiel aus ntfy-Erinnerungen.
- **Code:** `daily.js` (tlScrollTo), `push.js` (go) · Commit 5d0bb06

---

## Daten & Sicherheit

### Backup in ein privates GitHub-Repo
- Die localStorage-Keys werden nach jeder Änderung als `backup.json` (und
  `export.csv`) über die Contents-API in ein privates Repo geschrieben. Der
  Token liegt nur im localStorage des Geräts.
- **Stolperfallen:**
  - **Sperre gegen leeres Gerät:** Hat das Gerät weniger als die Hälfte der
    Datensätze des Backups, wird nicht gesichert (Commit 1d91e04).
  - PUT bei 409/422 einmal mit frischer `sha` wiederholen (38a0605). Das
    reicht, solange die App die **einzige** Schreiberin der Datei ist (hier
    backup.json, export.csv und push/subscription.json, ihr Inhalt ist der
    volle Gerätestand). Schreiben auch andere in dieselbe Datei (im Cockpit
    state.json, z. B. beim Monatsreview), dann den frischen Inhalt holen und
    nur die eigene Änderung darauf setzen, statt blind zu überschreiben.
    *(Variante aus dem Cockpit, 67e1217.)*
  - Änderungen während eines laufenden Syncs dürfen nicht verloren gehen, und
    beim Verlassen der App wird der Rest gesichert (37fa017).
  - `backup.json` **roh** lesen (`Accept: application/vnd.github.raw+json`).
    Die JSON-Antwort der Contents-API ist ab 1 MB leer (72d5e89).
  - Bei GitHub-Abrufen immer `cache: "no-store"` setzen.
  - CSV: Dezimalkomma und Freitext richtig maskieren, sonst zerfallen die
    Spalten.
- **Code:** `sync.js`

### Abgleich beim Start
- Etwa 6 s nach dem Start (höchstens alle 6 h) werden die letzten 7 Tage mit
  dem Backup verglichen. Ist ein Tag lokal leer, im Backup aber gefüllt, bietet
  die App an, genau diesen Tag zurückzuholen. Das passiert nie, solange
  ungesicherte Änderungen vorliegen.
- **Anlass:** Lokale Daten waren ohne Zutun der App verschwunden (04.10.).
- **Code:** `abgleich.js` · Commit 475d3ee

### Eingang aus dem Chat
- Claude schreibt Einträge (z. B. geschätzte Posten) als `eingang.json` ins
  Daten-Repo. Die App holt die Datei beim Start und beim Zurückkehren
  (höchstens 1×/min), zeigt eine Rückfrage mit Summe je Tag und übernimmt erst
  nach Bestätigung. Jeder Eintrag trägt eine ID, die am übernommenen Datensatz
  gespeichert wird – so gibt es keine Doppelten, auch wenn das Leeren der Datei
  fehlschlägt. Geleert werden nur die übernommenen IDs (Datei vorher frisch
  lesen). Kein eigener Storage-Key.
- **Anlass:** Restaurant-Schätzungen aus dem Chat mussten abgetippt werden
  (18.11.).
- **Code:** `eingang.js`

### Diagnose & dauerhafter Speicher
- `navigator.storage.persist()` beim Start. Das gilt für die ganze Herkunft
  r1bozyme.github.io, also auch für das Finanz-Cockpit. Ein Fehlerprotokoll
  (`error`, `unhandledrejection`, nicht geladene Dateien) läuft als Ringpuffer
  mit 25 Einträgen nur auf dem Gerät. Eine Diagnose-Karte zeigt Speicherstatus
  und Belegung je App und hat einen Knopf „Kopieren“ für den Chat.
- **Code:** `diag.js` (lädt als erstes Modul) · Commit 6193d9b

### Rückgängig statt Rückfrage
- Löschen per × zeigt 6 s lang „Rückgängig“, statt vorher nachzufragen.
- **Commit:** 6193d9b

### Töne auf der Audio-Uhr vormerken
- **Problem:** Chrome drosselt `setInterval` im Hintergrund bzw. bei
  ausgeschaltetem Bildschirm – Signaltöne aus JavaScript kommen zu spät.
- **Lösung:** Alle Töne beim Start (Nutzergeste) als Oszillatoren auf
  `ctx.currentTime + n` vormerken; die Anzeige rechnet gegen einen
  Startzeitstempel. Wake Lock, solange etwas läuft. Nach
  `visibilitychange` den Rest ab der verstrichenen Zeit neu vormerken.
  Gilt für Einzelton (Pausentimer) wie für ganze Sequenzen
  (Tempo-Coach: Einzählen, Phasen-Töne, Klicks, Abschluss).
- **Code:** `progress.js` (Pausentimer), `tempo.js` (Tempo-Coach)

### Datum in Ortszeit
- „Heute“ wird aus der Ortszeit gebildet, nicht über `toISOString()` (UTC).
  Sonst wechselt der Tag in Deutschland erst um 1 bzw. 2 Uhr.
- **Commit:** 72d5e89

---

## Oberfläche

### Eigene Dialoge statt confirm/prompt/alert
- Bottom-Sheet mit Promises: `tlAsk.confirm`, `.alert`, `.form`, `.typed`
  (Bestätigen erst nach Eintippen eines Worts). Android-Zurück schließt den
  Dialog.
- **Stolperfalle:** Höhe des Sheets über der Tastatur über `visualViewport`
  begrenzen, sonst ragt es oben aus dem Bild (f424c51).
- **Code:** `dialog.js` · Commit 43245e8

### Bis an den Bildschirmrand
- `viewport-fit=cover`, Kopfzeile mit Safe-Area-Abstand, milchiger Schleier
  hinter der Statusleiste.
- **Commit:** eafdb1e

### Graphen per Gedrückthalten abtasten
- Nach etwa 0,2 s Halten zeigen Graphen Datum und Wert, seitliches Wischen
  fährt den Verlauf ab. Neue Graphen brauchen nur das Attribut `data-scrub`
  am SVG, die Gesten hängen per Delegation am Dokument.
- **Code:** `scrub.js` · Commit 53ff4d8

### Geglättete Verläufe und Kennzahl je Kontext
- Verlaufslinien als monotone kubische Kurve (Fritsch–Carlson): weich,
  aber ohne Überschwingen über echte Werte; ab 8 Punkten zusätzlich EMA.
  Rohpunkte bleiben als kleine Punkte sichtbar.
- Eine Kennzahl über viele Reihen als Kettenindex (Start 100): je Stichtag
  das Mittel der log-Veränderungen der Reihen mit Vorwert, Sprung je Reihe
  gedeckelt. Neue Reihen verzerren nicht, Lücken kosten nichts.
- Kontext (hier: Studio) als Chips oben, Farbe je Kontext aus einer
  zentralen Funktion – überall dieselbe Zuordnung.
- Kennzeichen in den Stammdaten statt Sonderfälle im Code: `optional`
  (nie als fehlend/Stillstand werten), `ersetzt` (nur Hinweiszeile),
  Basislinie je Kontext (`abStudio`).
- **Code:** `kraft.js`

### Nachtmodus: Auto, Hell, Dunkel
- **Herkunft:** zuerst im Finanz-Cockpit gebaut (regel-cockpit 0ccf931,
  21.11.2026), Vorbild demter.com/kontraindikatoren. In training-log seit
  21.11.2026 (Branch nachtmodus).
- **Lösung:**
  - Alle Farben als CSS-Variablen in `:root` (hell), die Dunkel-Palette genau
    einmal unter `:root[data-theme="dark"]`.
  - Kleines Skript im `<head>` direkt nach `<style>` setzt `data-theme`
    **vor dem ersten Zeichnen** (kein heller Blitz). Wahl in localStorage
    (`auto` = kein Eintrag, sonst `light`/`dark`).
  - **Auto** folgt `matchMedia("(prefers-color-scheme: dark)")` und hört auf
    dessen `change`-Ereignis. Android schaltet das System im
    Energiesparmodus auf dunkel, die App zieht live mit.
  - Ein rundes Icon im Kopf wechselt Auto → Hell → Dunkel (halber Kreis,
    Sonne, Mond) mit `aria-label`. Manuelle Wahl schlägt das System.
  - `<meta name="theme-color">` per Skript mitziehen (Attribut `media`
    entfernen, `content` setzen), sonst bleibt die Statusleiste hell.
- **Stolperfallen:**
  - Fest eingetragene Farben (`#fff`, `rgba(…)`, Fallbacks wie
    `var(--bg, #F4F4F2)`) bleiben im Dunkelmodus hell. Vorher alle auf
    Variablen umstellen, **als eigenen Schritt ohne optische Änderung**
    (helle Werte = alte Werte). In training-log waren es rund 310.
    Prüfen: Ganzseiten-Screenshots aller Ansichten mit Testdaten vorher/
    nachher pixelgleich, dazu jede CSS-Regel auf ein Probe-Element legen
    und die aufgelösten Farben vergleichen (erfasst auch Zustände, die
    gerade nicht sichtbar sind).
  - **Alpha-Suffix an Hexwerten** (`farbe + "1F"`) geht mit `var()` nicht
    und fällt still auf transparent. Eigene Tint-Variable je Farbe
    (`--st-1-tint`). Nur der Screenshot-Vergleich hat das gefunden.
  - `var()` in SVG-Attributen (`fill="var(--x)"`, `stop-color`) funktioniert
    in Chrome, Diagramme brauchen keinen Umbau.
  - Bewusst fest bleiben dürfen: Overlays, die immer dunkel sind (Scanner),
    App-Icon (Canvas), Schatten und Abdunkler auf Schwarzbasis.
  - **Kein `</style>` in CSS-Kommentaren:** Der Parser beendet den
    Style-Block dort, der Rest der Seite zerfällt.
  - Neutrale Knöpfe (dunkel mit weißer Schrift) einfach umkehren:
    `--neutral` wird hell, `--on-neutral` dunkel.
  - Knopf neben dem Titel kostet Breite. Lange Kopf-Chips dürfen dann
    schrumpfen (`flex-shrink: 1` + Auslassungspunkte), sonst wird die
    Seite breiter als der Bildschirm.
  - Storage-Key mit Präfix der App (`tl-theme`, im Cockpit `fc-theme`): Beide
    Apps teilen sich die Herkunft.
  - Tests über HTTP, nicht `file://`: Dort gingen localStorage-Schreibvorgänge
    bei schnellem Neuladen gelegentlich verloren.
- **Code:** training-log `index.html` (`:root[data-theme="dark"]`, Skript
  direkt nach `</style>`, `#theme-btn`), Test `test/theme_test.py` (auch
  statisch: keine neuen festen Farben) · regel-cockpit `app/index.html`
  (Abschnitt „Nachtmodus“), Test `tests/theme_test.py`

### Kontext-Chip im Kopf
- Oben rechts zeigt ein Chip je Ansicht passende Infos (fällige Erhöhungen,
  Countdown, kcal). Jeder Chip reagiert auf Tap, damit die Bedienung
  einheitlich bleibt.
- **Code:** `header.js` · Commits dcd8818, 88df047

---

## Lehrgeld – bewusst nicht mehr so

- **Chrome-Web-Push:** Chrome hat das Abo auf dem Handy immer wieder verworfen.
  Erinnerungen laufen stattdessen über **ntfy** (geheimer Kanal, Klick-URL mit
  `?go=…`), ein Dienst im Daten-Repo verschickt sie. Commit 475d3ee, `push.js`.
- **Service Worker:** siehe oben. Er wird nur für Push gebraucht und bremst
  Updates aus.
- **Module um showView wickeln:** ersetzt durch das Ereignis `tl:view`.
- **Google Health:** wieder ausgebaut (dce2ad9). Gesundheitsdaten kommen jetzt
  von Oura.
