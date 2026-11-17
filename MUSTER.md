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
Zuletzt aktualisiert: 17.11.2026.

---

## Laden & Aktualisieren

### Sofort-Updates beim Start
- **Problem:** GitHub Pages hält Dateien bis zu 10 Minuten im Browser-Cache.
  Nach einem Push läuft deshalb noch die alte Fassung.
- **Lösung:** Ein Modul-Loader (Liste `MODS`) gleicht jedes Modul vorher mit
  `fetch(src, { cache: "no-cache" })` ab. Ist nichts geändert, kommt eine kurze
  304-Antwort. Erst danach hängt er die Skripte mit `async = false` an, damit die
  Reihenfolge erhalten bleibt. Offline-Rückfall: Nach 2,5 s wird ohne Abgleich
  geladen, und ein Flag sorgt dafür, dass nur einmal geladen wird. `./`,
  `index.html` und der Loader selbst werden ebenfalls mit `no-cache` geholt und
  gelten ab dem übernächsten Start.
- **Stolperfalle:** Der Loader ist selbst erst einen Start später aktuell. Er
  kennt ein neues Modul also eventuell noch nicht. In diesem Fall lädt ein
  bereits bekanntes Modul es nach (daily.js → werte.js, gewicht.js; diag.js →
  view.js).
- **Code:** Ende von `plan.js` · Commits a81fc40, c057943

### Kein Service Worker
- Ein Service Worker ist eine zweite Cache-Ebene, die Sofort-Updates
  zuverlässig ausbremst. Er diente hier nur den Chrome-Push-Meldungen und ist
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
  - PUT bei 409/422 einmal mit frischer `sha` wiederholen (38a0605).
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
