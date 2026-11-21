# training-log – Regeln für Claude

PWA für Training, Ernährung und Körperwerte, gehostet auf GitHub Pages
(r1bozyme.github.io/training-log). Ein Nutzer (Thomas), ein Gerät:
installierte App auf einem Android-Handy. Kein Build, kein Framework,
reines ES5-nahes JavaScript in Modulen.

Diese Datei enthält nur Regeln für den Code. Ziele, Nährwerte,
Trainingsplan und Entscheidungen stehen nicht hier (siehe „Quellen“).

## Aufbau

- `index.html`: Markup, Grund-Renderer (Log, Stats, Werte). ~60 KB:
  nur gezielt patchen, nie komplett neu schreiben.
- `plan.js`: Plan-Daten und Modul-Loader. Die Liste `MODS` legt die
  Ladereihenfolge fest: `view.js` zuerst, `back.js` zuletzt. Ein neues
  Modul kommt **immer** in `MODS`, sonst lädt es nicht.
- Ansichtswechsel nur über `showView(v)` aus `view.js`. Module hören auf
  das Ereignis `tl:view` (`e.detail.view`) und umschließen showView nie.
- `nav.js` zeichnet die untere Leiste (Training / Ernährung / Körper)
  und die Chips. `back.js` übernimmt die Android-Zurück-Geste.
- `diag.js` schreibt ungefangene Fehler nach `tl-err` (Karte „Diagnose“
  im Werte-Tab).
- `sync.js`: Backup (`backup.json`) und CSV-Export in das separate Repo
  `r1bozyme/training-log-data`. Der CSV-Export kommt nur aus sync.js.
- Kopfkommentar jeder Datei: Zweck, Datum, Zusammenspiel. Bei
  Änderungen mitpflegen.
- Farben nur über Variablen (`var(--…)`, ohne Fallback). Neue Farbe =
  Variable in `:root` **und** in `:root[data-theme="dark"]` (index.html).
  Kein Alpha-Suffix an Farben anhängen, dafür eigene Tint-Variable.
  `test/theme_test.py` prüft das statisch.

## Storage (harte Regeln)

- Die Herkunft r1bozyme.github.io teilt sich diese App mit dem
  Finanz-Cockpit (`r1bozyme/regel-cockpit`). Hier nur Keys mit `tl-`,
  nie `fc-…` schreiben oder löschen.
- Niemals „Websitedaten löschen“ oder `localStorage.clear()` empfehlen
  oder einbauen: Das löscht beide Apps inklusive Cockpit-Token.
- `tl-ak` (Anthropic-Schlüssel, label.js) bleibt nur auf dem Gerät und
  gehört nie ins Backup.
- Modul-Kopien liegen im Cache Storage (`tl-mods`), nicht in
  localStorage (das 5-MB-Kontingent gilt für beide Apps).

## Fachregeln im Code

- Tageswechsel um Mitternacht Ortszeit (Europe/Berlin). Kalendertage
  über `todayStr()` bzw. lokales JJJJ-MM-TT bilden, nie per
  `new Date().toISOString()` (UTC kippt nachts). Zeitstempel (`ts`)
  dürfen UTC sein.
- Freitext (Übungsname, Notiz, Studio, Produktnamen) vor `innerHTML`
  maskieren (`esc`).
- Nährwerte: etikettgeprüft oder `chk:1` (geschätzt). Geschätzte Werte
  nie stillschweigend als geprüft markieren.
- Das aktuelle Ziel (kcal/KH/F/P) steht nicht im Code, sondern in der
  App-Konfiguration (`c.goal`, Verlauf in `c.goalHist`, im Backup).
  Die Konstanten in tracker.js (`GOAL_ALT`, `GOAL_NEU`, `GOAL_NOV`) sind
  nur Startwerte und Migrationen. Nie aus ihnen auf das gültige Ziel
  schließen, und Tage immer gegen das Ziel rechnen, das an dem Tag galt.
- Fixbasis-Änderungen laufen über den Migrationszähler `BASIS_V`.

## Arbeitsablauf

1. Auf einem Branch arbeiten, nicht direkt auf main.
2. Ersetzungen gezielt: vorher sicherstellen, dass der alte Text genau
   einmal vorkommt (`assert s.count(old) == 1`).
3. Vor jedem Push: `python3 test/smoke.py` (Syntax, MODS-Liste,
   Storage-Keys, Headless-Start aller Ansichten). Muss „BESTANDEN“ melden.
   Bei Änderungen an Farben oder am Kopf zusätzlich `python3 test/theme_test.py`.
4. Thomas gibt sein Go, erst dann geht der Branch auf main.
5. Nach dem Push: Raw-Datei zum Commit abrufen und byte-genau
   vergleichen. GitHub Pages braucht danach bis zu 1–2 Minuten, der
   Loader holt neue Fassungen beim nächsten Start selbst.
6. Pro Push nur eine fachliche Änderung. Mehrere Wünsche als getrennte
   Commits.
7. Commit-Nachrichten auf Deutsch, Datei bzw. Modul vorn
   (z. B. `scan.js: …`).

## MUSTER.md

Wird ein übertragbares Muster neu gebaut oder geändert (Laden,
Speicher, Sync, Gesten, Dialoge, Scan …), wird MUSTER.md im selben
Commit aktualisiert. Sie ist der Wissenstransfer zum Finanz-Cockpit.

## Quellen (hier nicht doppelt pflegen)

- Aktuelles Ziel: App-Konfiguration bzw. `backup.json`, nicht der Code.
- Nährwerte, Rezepte: tracker.js; Pläne als monatlich versionierte
  Google Docs (Drive-Ordner Fitness).
- Trainingsdaten: `training-log-data/export.csv`, Auswertung
  `training-log-data/review/auswertung.js`.
- Entscheidungen, Vormerkungen, Gesundheitskontext: Projekt
  „Ernährung, Fitness & Beauty“ in Claude.
