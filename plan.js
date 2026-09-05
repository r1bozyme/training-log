// ═══════════════════════════════════════════════════
// PLAN DATA – Letzte Aktualisierung: 5. September 2026
// typ: compound | isolation | core  → bestimmt Pausenzeit
// Beim Review: aktuell/ziel/zielgewicht von Claude angepasst
//
// NEU 03.09. – progression:
//   {}                          → Default-Schwelle
//   { schwelle:n, schritt:n }   → eigene Schwelle/Schrittweite
//   { gesperrt:true, grund:"" } → kein Signal, mit Begründung
// Default-Schwelle = Sätze × Obergrenze − (Sätze − 1).
// Auswertung: Summe aller Sätze, nicht "jeder Satz an der
// Obergrenze". Siehe Kopf von progress.js.
//
// NEU 03.09. – pause:
//   { secs:n, label:"" } übersteuert PAUSE[typ].
//
// SCHRITTWEITEN entsprechen der tatsächlichen Granularität
// des jeweiligen Geräts. eGym erlaubt 1-kg-Schritte; dort
// steht bewusst 2 kg, um die Zahl der Mikroanpassungen zu
// begrenzen. Auf 1 setzen, wenn es feiner laufen soll.
//
// REVIEW 04.09.: Elf Zielgewichte nachgezogen – alle offenen
// Treffer aus dem Erhöhungs-Signal, gegen export.csv geprüft.
// Beinpresse, Beinstrecker und Oblique Crunch waren am 03.09.
// bereits auf dem neuen Gewicht gefahren, dort steht jetzt der
// tatsächliche Stand statt des veralteten Plangewichts.
//
// 05.09.: Nur der Modul-Loader unten wurde erweitert (tracker.js).
// An den Plandaten ist nichts geändert.
// ═══════════════════════════════════════════════════
const PLAN = {
  version: "September 2026 (Rev. 04.09.)",
  Push: [
    { name:"Chest Press", muskel:"Brust · Schulter · Trizeps", typ:"compound",
      saetze:4, repzone:"8–12", aktuell:"4×10 @ 55 kg", zielgewicht:55, ziel:"Summe ≥44 Wdh → 57,5 kg",
      progression:{ schwelle:44, schritt:2.5 },
      schritte:["Rücken fest ans Polster – nicht abheben","3 Sek runter, explosiv hoch","Ellenbogen nicht ganz durchstrecken","Brust am engsten Punkt 1 Sek zusammendrücken","Ausgangsposition immer Stufe 2 – Stufe 1 verkürzt den Weg"],
      tipp:"Seit 25.07. auf 55 kg, Summe bewegt sich nicht: 42 Wdh am 25.07., 42 Wdh am 02.09. Das alte Kriterium 4×12 war für einen Sprung von 4,8 % zu hart. Neue Schwelle 44 – zwei Wiederholungen entfernt. Wenn die Maschine 1,25er kennt, diesen Schritt nehmen und schritt hier auf 1.25 setzen." },
    { name:"Pectoral Fly", muskel:"Brust (Isolation)", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"3×10–13 @ 57,5 kg", zielgewicht:57.5, ziel:"Summe ≥40 Wdh → 60 kg",
      progression:{ schwelle:40, schritt:2.5 },
      schritte:["Arme immer leicht gebeugt – Ellenbogenschutz!","Langsam zur Mitte, 1–2 Sek halten","Brust aktiv zusammenquetschen","Kontrolliert öffnen bis zur vollen Dehnung","Einstellung Stufe 2 für mehr Dehnung"],
      tipp:"Seit 02.07. auf 57,5 kg – neun Wochen, 17 Einheiten, Reps pendeln 9–13. 3×15 wurde nie erreicht und wird es auch nicht: das Tor war zu hoch angesetzt. Schwelle jetzt 40." },
    { name:"Shoulder Press", muskel:"Schulter vorne/mitte · Trizeps", typ:"compound",
      saetze:3, repzone:"8–12", aktuell:"3×8–10 @ 32,5 kg", zielgewicht:32.5, ziel:"Summe ≥34 Wdh → 35 kg",
      progression:{ schritt:2.5 },
      schritte:["Core anspannen, kein Hohlkreuz","Griffe auf Ohrhöhe – drücken bis kurz vor Streckung","Langsam runter, Schultern nicht hochziehen","Backoff: 4. Satz @ 30 kg bis zum Versagen"],
      tipp:"30 → 32,5 kg am 21.08. nach 3×12–14. Zuletzt 8/10/8 = 26 Wdh – normale Anpassungsphase nach einem Sprung. In jeder zweiten Push-Einheit an erste Position, sonst ist die vordere Schulter durch Chest Press und Fly vorermüdet." },
    { name:"Triceps Press", muskel:"Trizeps (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 97,5 kg – zuletzt 3×12 @ 95 kg (02.09.)", zielgewicht:97.5, ziel:"Summe ≥34 Wdh → 100 kg",
      progression:{ schritt:2.5 },
      schritte:["Aufrecht sitzen, Rücken fest ans Polster","Sitzhöhe Stufe 3 – seit 21.08. fest dokumentiert","Griffe auf Schulterhöhe, Ellenbogen nah am Körper","Explosiv drücken bis zur vollen Streckung – Trizeps anspannen","3 Sek zurück – kontrolliert, nicht fallen lassen"],
      tipp:"Die Einstellungsfrage aus dem Juli ist geklärt: Sitzhöhe Stufe 3 steht seit 21.08. in der Notiz, damit ist die Zahl wieder eine Vergleichsgröße. 3×12 @ 95 kg standen seit 29.07. in sechs Einheiten – überfällig, jetzt nachgezogen." },
    { name:"Rear Delt Fly", muskel:"Hintere Schulter · Rhomboiden", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"3×11–14 @ 55 kg", zielgewicht:55, ziel:"Summe ≥40 Wdh → 57,5 kg",
      progression:{ schwelle:40, schritt:2.5 }, pause:{ secs:120, label:"120 Sek" },
      schritte:["Sitz umdrehen oder Reverse-Modus","Arme leicht gebeugt, Schulterblätter zusammenziehen","Langsam und kontrolliert – kein Schwung","Pause 120 Sek – bewusst länger als sonst bei Isolation"],
      tipp:"Seit 10.07. auf 55 kg, aber Satz 1 ist von 11 auf 14 Wdh gestiegen. Der Einbruch sitzt in Satz 2 und 3 (auf 9–11) – das ist ein Erholungs-, kein Kraftproblem. Deshalb 120 Sek Pause statt 60–90." },
    { name:"Lateral Raise", muskel:"Mittlere Schulter", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"3×8 @ 7,5–8 kg (links schmerzhaft)", zielgewicht:null, ziel:"Nicht forcieren – erst 3×12 schmerzfrei",
      progression:{ gesperrt:true, grund:"Links weiter gereizt. Erst 3×12 schmerzfrei, dann wieder Progression." },
      schritte:["Arme seitlich bis Schulterhöhe heben","Leicht gebeugte Ellenbogen, Daumen leicht nach unten"],
      tipp:"Links weiter gereizt trotz Manschette – nicht forcieren. Erst wenn 3×12 schmerzfrei laufen, wieder aufbauen." },
    { name:"Wadenheben (HSR-Block)", muskel:"Gastrocnemius · Soleus · Achillessehne", typ:"compound",
      saetze:3, repzone:"6–8", aktuell:"3×7 @ 80 kg", zielgewicht:80, ziel:"Frequenzblock – kein eigenes Progressionsziel",
      progression:{ gesperrt:true, grund:"Steuerung läuft über die Morgensteifigkeit im Werte-Tab, nicht über Wiederholungen." },
      schritte:["3 Sek runter, am tiefsten Punkt direkt umkehren","3 Sek hoch, volle Streckung","Kein Halten unten, kein Abfedern"],
      tipp:"Kurzer Zusatzblock am Ende der Einheit. Zweck ist Frequenz (3×/Woche), nicht Volumen – Sehnenadaptation braucht wiederholte Reize. Steigerung nur am Legs-Tag entscheiden." }
  ],
  Pull: [
    { name:"Latzug", muskel:"Latissimus · Bizeps", typ:"compound",
      saetze:3, repzone:"8–12", aktuell:"Neu ab 85 kg – zuletzt 3×12 @ 80 kg (02.09., mit Zughilfen)", zielgewicht:85, ziel:"Summe ≥34 Wdh → 90 kg",
      progression:{ schritt:5 },
      schritte:["Griff breiter als Schultern (Obergriff)","Zughilfen verwenden – Griffkraft ist nicht der Zielmuskel","Stange zur oberen Brust – Ellenbogen nach unten/hinten","Brust nach vorne öffnen – nicht zurückschaukeln!","Latissimus am Ende 1 Sek zusammenziehen"],
      tipp:"FREIGESCHALTET 03.09., Plangewicht nachgezogen 04.09.: Die Einheit vom 02.09. mit Zughilfen lief ohne 24-Stunden-Reaktion, beide Handgelenke unauffällig. 3×12 @ 80 kg standen seit 25.07. in sieben Einheiten – die Lat-Kraft war längst da, der Griff war der Begrenzer. 85 kg mit Zughilfen ist jetzt der nächste Test: eine Variable, die Last. Steuerung weiter über die 24-Stunden-Reaktion, nicht über das Gefühl während der Einheit. Daumen NICHT einschlagen (Vier-Finger-Griff, links De Quervain)." },
    { name:"Ruderzug", muskel:"Mittlerer Rücken · Trapezius · Bizeps", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 50 kg – zuletzt 3×12–13 @ 45 kg (15.08.)", zielgewicht:50, ziel:"Summe ≥34 Wdh → 55 kg",
      progression:{ schritt:5 },
      schritte:["Aufrecht sitzen – nicht nach hinten lehnen!","Griff zur Brust-/Bauchmitte – Ellenbogen nah am Körper","Schulterblätter am Ende 1–2 Sek zusammendrücken","Kontrolliert zurück"],
      tipp:"Wiedereinstieg am 15.08. direkt mit 12/12/13 @ 45 kg – deutlich über dem konservativen Plan von 35 kg. Seitdem nicht mehr geloggt. Zurück in die feste Rotation, Vier-Finger-Griff. Die 50 kg sind bisher nur gerechnet, nicht gefahren – erste Einheit entsprechend vorsichtig angehen." },
    { name:"Straight Arm Pulldown", muskel:"Latissimus (kein Grip)", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 30 kg – zuletzt 3×11–12 @ 28,75 kg (02.09.)", zielgewicht:30, ziel:"Summe ≥34 Wdh → 31,25 kg",
      progression:{ schritt:1.25 },
      schritte:["Kabelzug, Seil oder gerade Stange auf Augenhöhe","Arme gestreckt – Stange/Seil mit gestreckten Armen nach unten/hinten drücken","Latissimus am Ende zusammenziehen","Keine Ellenbogenbeugung – das ist der Trick"],
      tipp:"32,5 kg am 23.07. war zu schwer (8/5/5). Der Weg führt über 30 kg, nicht über 32,5. Kein Grip nötig – Open-Hand oder Seil." },
    { name:"Dual Pulley Roll", muskel:"Latissimus · Rumpfstabilität", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"3×8–10 @ 35 kg", zielgewicht:35, ziel:"Summe ≥34 Wdh → 37,5 kg",
      progression:{ schritt:2.5 },
      schritte:["Zwei Kabelzüge auf Schulterhöhe, je eine Umlenkrolle","Einen nach dem anderen nach unten ziehen – alternierend","Rumpf stabil halten, nicht schaukeln","Kontrollierte Bewegung, Lat aktiviert halten"],
      tipp:"Am 29.07. auf 8/8/10 gefallen, seitdem nur noch bei 30 kg geloggt. Wieder bei 35 kg ansetzen." },
    { name:"Bizepscurl", muskel:"Bizeps (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"15/10/9 @ 25 kg (04.09., Summe 34)", zielgewicht:25, ziel:"Summe ≥34 Wdh → 27 kg",
      progression:{ schritt:2 },
      schritte:["Oberarme fixiert – nur Unterarme bewegen","Ganz unten strecken, oben 1 Sek halten","3–4 Sek absenken = mehr Muskelreiz","Kein Rückenschwung!"],
      tipp:"BEWUSST NICHT ERHÖHT am 04.09.: Die Schwelle ist mit 34 Wdh exakt getroffen, aber der Satzverlauf 15/10/9 ist der steilste Abfall im ganzen Log. Der erste Satz trägt die Summe allein. Erst den Curl an den Anfang der Einheit ziehen (wie am 21.08. notiert) und einen gleichmäßigeren Verlauf abwarten, dann auf 27 kg. Mit anstehender De-Quervain-OP ist das die vorsichtigere Reihenfolge. Nur Maschine/Kabel, Daumen nicht im Griff. Der Eintrag mit 55 kg am 21.08. war ein anderes Gerät und zählt nicht mit." },
    { name:"Face Pulls", muskel:"Hintere Schulter · Rotatorenmanschette", typ:"isolation",
      saetze:3, repzone:"15", aktuell:"3×12 @ 21,25 kg", zielgewicht:21.25, ziel:"Summe ≥43 Wdh → 22,5 kg",
      progression:{ schritt:1.25 },
      schritte:["Kabelzug mit Seilaufsatz auf Augenhöhe","Seil zur Stirn – Ellenbogen nach außen/oben"],
      tipp:"Schützt das Schultergelenk langfristig. Seit 29.07. nicht mehr geloggt – gehört zurück in die feste Pull-Rotation." },
    { name:"Wadenheben (HSR-Block)", muskel:"Gastrocnemius · Soleus · Achillessehne", typ:"compound",
      saetze:3, repzone:"6–8", aktuell:"3×7 @ 80 kg", zielgewicht:80, ziel:"Frequenzblock – kein eigenes Progressionsziel",
      progression:{ gesperrt:true, grund:"Steuerung läuft über die Morgensteifigkeit im Werte-Tab, nicht über Wiederholungen." },
      schritte:["3 Sek runter, am tiefsten Punkt direkt umkehren","3 Sek hoch, volle Streckung","Kein Halten unten, kein Abfedern"],
      tipp:"Kurzer Zusatzblock am Ende der Einheit. Zweck ist Frequenz (3×/Woche), nicht Volumen – Sehnenadaptation braucht wiederholte Reize. Steigerung nur am Legs-Tag entscheiden." }
  ],
  Legs: [
    { name:"Beinpresse", muskel:"Quadrizeps · Gesäß · Hamstrings", typ:"compound",
      saetze:4, repzone:"8–12", aktuell:"Neu ab 140 kg – 4×12 @ 135 kg am 03.09. bereits voll erreicht", zielgewicht:140, ziel:"Summe ≥45 Wdh → 145 kg",
      progression:{ schritt:5 },
      schritte:["Füße schulterbreit, Zehen leicht nach außen (15–30°)","Knie immer in Richtung Zehen – nie einknicken!","Bis ca. 90° Kniewinkel – Rücken bleibt am Sitz","Explosiv drücken, kurz vor voller Streckung stoppen"],
      tipp:"KERNBLOCK – läuft auch an kurzen Tagen. 4×12 @ 130 kg am 17.08. und 20.08., am 03.09. dann direkt 4×12 @ 135 kg (Notiz: Stufe 5 als tiefster Punkt). Daher der Doppelschritt im Plan – die 135 kg sind bereits gefahren, 140 kg ist der eine offene Schritt. Knie links: Füße etwas höher auf die Platte." },
    { name:"Beinbeuger", muskel:"Hamstrings (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 62 kg – zuletzt 12/11/11 @ 60 kg (03.09., Summe 34)", zielgewicht:62, ziel:"Summe ≥32 Wdh → 64 kg",
      progression:{ schwelle:32, schritt:2 }, pause:{ secs:120, label:"120 Sek" },
      schritte:["Oberschenkel fest auf Polsterung – nicht abheben!","Ferse zur Gesäßfalte, oben 1–2 Sek halten","3–4 Sek langsam strecken – Absenkphase ist entscheidend","Pause 120 Sek – bewusst länger als sonst bei Isolation"],
      tipp:"KERNBLOCK – läuft auch an kurzen Tagen. Grund: Die Beinpresse deckt den Quadrizeps mit ab, die Hamstrings hat sonst nichts. Der Stillstand ist gelöst: 12/11/11 am 03.09. gegen 12/10/8 am 13.08. – der dritte Satz ist um drei Wiederholungen gestiegen, genau dort saß das Problem. Die 120 Sek Pause und die wiederhergestellte Frequenz haben gewirkt. eGym kann 1-kg-Schritte; 2 kg als Kompromiss." },
    { name:"Wadenheben (HSR)", muskel:"Gastrocnemius · Soleus · Achillessehne", typ:"compound",
      saetze:4, repzone:"6–8", aktuell:"3×8 @ 90 kg (Heavy Slow Resistance)", zielgewicht:90, ziel:"90 kg halten – Steuerung über Morgensteifigkeit",
      progression:{ gesperrt:true, grund:"Steuerung läuft über den 7-Tage-Schnitt der Morgensteifigkeit im Werte-Tab. Erst mehrere Tage unter 2 darf die Last hoch." },
      schritte:["Nur Vorderfuß auf der Platte – Ferse hängt frei","3 Sek kontrolliert runter bis zur vollen Dehnung","Am tiefsten Punkt NICHT halten – direkt umkehren, ohne Abfedern","3 Sek hoch bis zur vollen Streckung","Volle ROM (Midportion-Tendinopathie – keine Einschränkung nötig)"],
      tipp:"KERNBLOCK – läuft auch an kurzen Tagen. Der 7-Tage-Schnitt der Morgensteifigkeit fällt seit Anfang August monoton: 3,6 → 3,3 → 2,9 → 2,6. Die Last passt, aber noch nicht dauerhaft unter 2 – 90 kg bleiben. Reassessment-Fenster 10.09. bis 24.09.; fällt der Schnitt weiter, entfällt die Sonographie-Frage." },
    { name:"Rückenstrecker", muskel:"Erector spinae (unterer Rücken)", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"Neu ab 15 kg – zuletzt 3×15 @ 10 kg (17.08.)", zielgewicht:15, ziel:"Summe ≥43 Wdh → 20 kg",
      progression:{ schritt:5 },
      schritte:["Aufrecht in die Maschine, Rücken flach anlegen","Langsam nach vorne beugen – volle Dehnung spüren","Kontrolliert zurückstrecken bis zur aufrechten Position","Keine Überstreckung am Ende – Spannung halten"],
      tipp:"ZUSATZBLOCK. Wenn Zeit ist: erste Position der Einheit, Warm-up für die Wirbelsäule. Die Schrittweite von 5 kg ist hier relativ groß (10 → 15 kg = 50 %) – wenn die Maschine feinere Stufen kann, schritt auf 2.5 setzen." },
    { name:"Hip Thrust", muskel:"Gluteus maximus (großer Gesäßmuskel)", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 105 kg – zuletzt 12/11/11 @ 100 kg (03.09., Summe 34)", zielgewicht:105, ziel:"Summe ≥34 Wdh → 110 kg",
      progression:{ schritt:5 },
      schritte:["Rücken gegen Polsterung, Füße schulterbreit auf dem Boden","Hüfte nach oben drücken bis Körper eine Linie bildet","Oben 1–2 Sek halten – Gesäß maximal anspannen","Kontrolliert runter – Gesäß berührt nicht den Boden"],
      tipp:"ZUSATZBLOCK. Stärkste Progression im Log: 75 → 85 → 90 → 100 → 105 kg seit Juli. Bei 100 kg von 3×10 am 20.08. auf 12/11/11 am 03.09. – sauber ausgebaut, der Schritt ist verdient." },
    { name:"Beinstrecker", muskel:"Quadrizeps (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"3×10 @ 74 kg (03.09.) – Gewicht bereits umgesetzt", zielgewicht:74, ziel:"Summe ≥34 Wdh → 76 kg",
      progression:{ schritt:2 },
      schritte:["Langsam strecken, oben 1–2 Sek halten und Quad anspannen","3–4 Sek zurück – nie fallen lassen"],
      tipp:"ZUSATZBLOCK – der Quadrizeps wird an kurzen Tagen von der Beinpresse mitgetragen, deshalb ist das hier die verzichtbare Übung. 72 → 74 kg am 03.09. selbst umgesetzt, dort 3×10 = Summe 30. Jetzt die vier fehlenden Wiederholungen aufbauen, nicht das Gewicht. Max 113 kg = viel Potenzial." },
    { name:"Hip Abduction", muskel:"Gluteus medius/minimus (seitliches Gesäß)", typ:"isolation",
      saetze:3, repzone:"15–20", aktuell:"3×15 @ 80 kg", zielgewicht:80, ziel:"Summe ≥58 Wdh → 82,5 kg",
      progression:{ schritt:2.5 },
      schritte:["Aufrecht sitzen, Core angespannt","Beine langsam nach außen – Endpunkt 1–2 Sek halten","Kontrolliert zurück – nicht einfedern","Direkt weiter zur Adduktion, ohne Pause"],
      tipp:"ZUSATZBLOCK. Als Superset mit Hip Adduktion ohne Pause dazwischen – Agonist und Antagonist behindern sich nicht, spart 4–5 Min bei gleichem Reiz. Seit 15.06. nicht mehr geloggt." },
    { name:"Hip Adduktion", muskel:"Adduktoren (Innenseite Oberschenkel)", typ:"isolation",
      saetze:3, repzone:"15–20", aktuell:"3×15–20 @ 80 kg", zielgewicht:80, ziel:"Summe ≥58 Wdh → 85 kg",
      progression:{ schritt:5 },
      schritte:["Aufrecht sitzen, Beine außen in die Polster","Beine kontrolliert nach innen zusammenführen","Am engsten Punkt 1–2 Sek halten","Langsam öffnen – nicht einfedern lassen"],
      tipp:"ZUSATZBLOCK. Zweiter Teil des Supersets mit Hip Abduction. Pause erst nach beiden Übungen. Wichtig für Kniestabilität." },
    { name:"Bauch gerade", muskel:"Rectus abdominis", typ:"core",
      saetze:3, repzone:"15–20", aktuell:"Neu ab 57 kg – zuletzt 15/15/18/18 @ 55 kg (03.09., Summe 66)", zielgewicht:57, ziel:"Summe ≥58 Wdh → 59 kg",
      progression:{ schritt:2 },
      schritte:["Bauchmuskeln aktiv zusammenziehen – nicht mit dem Rücken drücken","Langsam, kontrolliert, oben 1 Sek halten"],
      tipp:"ZUSATZBLOCK. 53 → 55 kg am 17.08., am 03.09. vier Sätze mit 66 Wdh – deutlich über der Schwelle 58. Max ist 70 kg." },
    { name:"Oblique Crunch (Hammer Strength)", muskel:"Obliques · Rectus abdominis", typ:"core",
      saetze:3, repzone:"12–15", aktuell:"Neu ab 20 kg – 3×15 je Seite @ 17,5 kg am 03.09. bereits erreicht", zielgewicht:20, ziel:"Summe ≥43 Wdh → 22,5 kg",
      progression:{ schritt:2.5 },
      schritte:["Seitlich einstellen – Schulterpolster fest anlegen","Rumpf diagonal einrollen – Schulter Richtung gegenüberliegender Hüfte","Am tiefsten Punkt 1 Sek halten, Obliques aktiv anspannen","Langsam zurück – Spannung halten, nicht zurückfallen lassen","Seite wechseln – beide Seiten gleiche Wiederholungszahl"],
      tipp:"ZUSATZBLOCK. Am 20.08. selbst mit „↑ Erhöhen\" markiert, am 03.09. dann 3×15 je Seite bei 17,5 kg gefahren – die Obergrenze der Repzone sofort getroffen. Deshalb steht der Plan jetzt auf 20 kg. Kraft kommt aus dem Rumpf, nicht aus den Armen – Handgelenk neutral (De Quervain)." },
    { name:"Reverse Crunches", muskel:"Untere Bauchmuskeln", typ:"core",
      saetze:3, repzone:"15–20", aktuell:"3×18 @ Bodyweight", zielgewicht:null, ziel:"3×20 gefestigt – ggf. leichte Zusatzlast",
      progression:{ gesperrt:true, grund:"Bodyweight – Progression läuft über Tempo und Wiederholungen, nicht über die Last." },
      schritte:["Captain's Chair: Unterarme auf die Polster, Rücken an die Rücklehne","Beine hängen lassen – Knie leicht gebeugt","Knie kontrolliert zur Brust ziehen – Hüfte rollt leicht nach oben","Langsam absenken – volle Streckung, Spannung halten"],
      tipp:"ZUSATZBLOCK. Am Captain's Chair Unterarme belasten, nicht die Hände (De Quervain). Kein Schwung – Bewegung kommt aus dem Bauch." },
    { name:"Bauch seitlich", muskel:"Obliques", typ:"core",
      saetze:3, repzone:"20–24", aktuell:"Ersetzt durch Oblique Crunch (Hammer Strength)", zielgewicht:null, ziel:"Nur noch Fallback, wenn HS-Maschine belegt",
      progression:{ gesperrt:true, grund:"Nur noch Fallback. Progression läuft über die Hammer-Strength-Maschine." },
      schritte:["Abwechselnd links/rechts – 4 Sek pro Seite","Bewegung aus dem Rumpf, nicht aus den Schultern"],
      tipp:"Maschinenmaximum ist Stufe 12 – dort ist keine Progression mehr möglich. Deshalb nur noch Fallback." }
  ]
};

// PAUSE bleibt in index.html – hier nur die Plan-Daten.
// Übungen mit eigenem pause-Feld übersteuern PAUSE[typ] (siehe progress.js).

// LEGS-ROTATION (03.09.):
// Kernblock = Beinpresse, Beinbeuger, Wadenheben (HSR). Läuft immer,
// auch an kurzen Tagen vor der Arbeit – etwa 25–30 Min.
// Zusatzblock = alles Weitere, nur wenn die lange Einheit passt.
// Begründung: Der Quadrizeps wird von der Beinpresse mitgetragen, die
// Hamstrings hatten in der bisherigen Rotation nur ~1×/Woche Reiz.

// Lädt die Zusatzmodule nach (daily.js = Kalorien/Steifigkeit,
// sync.js = GitHub-Backup, progress.js = Erhöhungs-Signal,
// tracker.js = Makro-Tracking/Abendpensum).
// Liegt hier, weil GitHub keine Teil-Updates erlaubt und index.html dadurch
// unangetastet bleibt. async=false erzwingt die Ausführungsreihenfolge –
// sync.js muss nach daily.js laufen, damit es showView/exportCSV aussen umschliesst.
// progress.js danach: es umschliesst refreshHint/renderLog/saveEntry.
// tracker.js zuletzt: es umschliesst showView als aeusserste Schicht und
// braucht setKcal aus daily.js fuer den Knopf "Tag abschliessen".
// Beim nächsten index.html-Commit sauber als eigene <script>-Tags dorthin ziehen
// und diesen Block entfernen.
["daily.js", "sync.js", "progress.js", "tracker.js"].forEach(function (src) {
  var s = document.createElement("script");
  s.src = src;
  s.async = false;
  document.head.appendChild(s);
});
