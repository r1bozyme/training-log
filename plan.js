// ═══════════════════════════════════════════════════
// PLAN DATA – Letzte Aktualisierung: 30. September 2026
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
//
// REVIEW 30.09. (Oktober-Revision):
// · Latzug und Ruderzug fest zurück in jede Pull-Einheit. Beide mit
//   progression.ab = "2026-10-01": Wiedereinstieg nach 3,5 bzw. 6
//   Wochen Pause – ältere Einträge zählen nicht, sonst stünde der
//   Latzug wegen 3×12 @ 85 kg vom 04.09. sofort auf 90 kg.
// · Bizepscurl: 25 kg halten, Pause 120 Sek (Satz-3-Einbruch =
//   Erholungsproblem, gleiches Muster wie Rear Delt Fly).
// · Nachgezogen aus dem Summenkriterium: Triceps 102,5 · Straight
//   Arm Pulldown 33,75 · Dual Pulley Roll 37,5 · Hip Thrust 110 ·
//   Oblique Crunch 25 · Face Pulls auf den gefahrenen Stand 25 kg.
// · HSR: 105 kg an allen drei Tagen, Morgensteifigkeit Ø 1,86.
// · Neu in progress.js: Nur Einträge der letzten 8 Wochen zählen.
// ═══════════════════════════════════════════════════
const PLAN = {
  version: "Oktober 2026 (Rev. 30.09.)",
  Push: [
    { name:"Chest Press", muskel:"Brust · Schulter · Trizeps", typ:"compound",
      saetze:4, repzone:"8–12", aktuell:"41 Wdh @ 57,5 kg (25.09.) – am 20.09. schon 4×12", zielgewicht:57.5, ziel:"Summe ≥44 Wdh → 60 kg",
      progression:{ schwelle:44, schritt:2.5 },
      schritte:["Rücken fest ans Polster – nicht abheben","3 Sek runter, explosiv hoch","Ellenbogen nicht ganz durchstrecken","Brust am engsten Punkt 1 Sek zusammendrücken","Ausgangsposition immer Stufe 2 – Stufe 1 verkürzt den Weg"],
      tipp:"55 → 57,5 kg am 09.09. Am 20.09. mit 4×12 = 48 Wdh über der Schwelle, am 25.09. zurück auf 41. Ein Treffer von zweien – die nächste Einheit entscheidet. Wenn die Maschine 1,25er kennt, diesen Schritt nehmen und schritt hier auf 1.25 setzen." },
    { name:"Pectoral Fly", muskel:"Brust (Isolation)", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"10/13/10 @ 60 kg (25.09., Summe 33)", zielgewicht:60, ziel:"Summe ≥40 Wdh → 62,5 kg",
      progression:{ schwelle:40, schritt:2.5 },
      schritte:["Arme immer leicht gebeugt – Ellenbogenschutz!","Langsam zur Mitte, 1–2 Sek halten","Brust aktiv zusammenquetschen","Kontrolliert öffnen bis zur vollen Dehnung","Einstellung Stufe 2 für mehr Dehnung"],
      tipp:"Nach elf Wochen auf 57,5 kg am 20.09. auf 60 kg – die Summe lag davor bei 40 (14/14/12 am 17.09.). Jetzt 32–33 Wdh: normale Anpassung nach dem Sprung. Schwelle bleibt 40." },
    { name:"Shoulder Press", muskel:"Schulter vorne/mitte · Trizeps", typ:"compound",
      saetze:3, repzone:"8–12", aktuell:"11/10/10 @ 35 kg (25.09., Summe 31)", zielgewicht:35, ziel:"Summe ≥34 Wdh → 37,5 kg",
      progression:{ schritt:2.5 },
      schritte:["Core anspannen, kein Hohlkreuz","Griffe auf Ohrhöhe – drücken bis kurz vor Streckung","Langsam runter, Schultern nicht hochziehen","Backoff: 4. Satz @ 30 kg bis zum Versagen"],
      tipp:"32,5 → 35 kg am 09.09. Verlauf 29 → 26 → 22 → 31 Wdh – der letzte Wert ist der beste seit dem Sprung. In jeder zweiten Push-Einheit an erste Position, sonst ist die vordere Schulter durch Chest Press und Fly vorermüdet." },
    { name:"Triceps Press", muskel:"Trizeps (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 102,5 kg – zuletzt 3×12 @ 100 kg (20.09. und 25.09.)", zielgewicht:102.5, ziel:"Summe ≥34 Wdh → 105 kg",
      progression:{ schritt:2.5 },
      schritte:["Aufrecht sitzen, Rücken fest ans Polster","Sitzhöhe Stufe 3 – seit 21.08. fest dokumentiert","Griffe auf Schulterhöhe, Ellenbogen nah am Körper","Explosiv drücken bis zur vollen Streckung – Trizeps anspannen","3 Sek zurück – kontrolliert, nicht fallen lassen"],
      tipp:"Sitzhöhe Stufe 3 (seit 21.08. fest). 3×12 @ 100 kg zweimal in Folge – der Schritt auf 102,5 kg ist verdient. Konstanteste Progression im Push-Tag: 80 → 102,5 kg seit Juni." },
    { name:"Rear Delt Fly", muskel:"Hintere Schulter · Rhomboiden", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"10/12/12 @ 57,5 kg (25.09., Summe 34)", zielgewicht:57.5, ziel:"Summe ≥40 Wdh → 60 kg",
      progression:{ schwelle:40, schritt:2.5 }, pause:{ secs:120, label:"120 Sek" },
      schritte:["Sitz umdrehen oder Reverse-Modus","Arme leicht gebeugt, Schulterblätter zusammenziehen","Langsam und kontrolliert – kein Schwung","Pause 120 Sek – bewusst länger als sonst bei Isolation"],
      tipp:"55 → 57,5 kg am 17.09. Summe 34/33/34 – stabil, noch kein Aufbau. 120 Sek Pause bleiben: Der Einbruch in Satz 2 und 3 ist ein Erholungs-, kein Kraftproblem." },
    { name:"Lateral Raise", muskel:"Mittlere Schulter", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"3×8 @ 7,5–8 kg (links schmerzhaft)", zielgewicht:null, ziel:"Nicht forcieren – erst 3×12 schmerzfrei",
      progression:{ gesperrt:true, grund:"Links weiter gereizt. Erst 3×12 schmerzfrei, dann wieder Progression." },
      schritte:["Arme seitlich bis Schulterhöhe heben","Leicht gebeugte Ellenbogen, Daumen leicht nach unten"],
      tipp:"Links weiter gereizt trotz Manschette – nicht forcieren. Erst wenn 3×12 schmerzfrei laufen, wieder aufbauen." },
    { name:"Wadenheben (HSR-Block)", muskel:"Gastrocnemius · Soleus · Achillessehne", typ:"compound",
      saetze:3, repzone:"6–8", aktuell:"3×8 @ 105 kg (25.09.)", zielgewicht:105, ziel:"Frequenzblock – Last wie am Legs-Tag",
      progression:{ gesperrt:true, grund:"Steuerung läuft über die Morgensteifigkeit im Werte-Tab, nicht über Wiederholungen." },
      schritte:["3 Sek runter, am tiefsten Punkt direkt umkehren","3 Sek hoch, volle Streckung","Kein Halten unten, kein Abfedern"],
      tipp:"Kurzer Zusatzblock am Ende der Einheit. Zweck ist Frequenz (3×/Woche) – Sehnenadaptation braucht wiederholte Reize. Seit 25.09. mit derselben Last wie am Legs-Tag (105 kg). Steigerung weiter nur am Legs-Tag entscheiden, dann hier nachziehen." }
  ],
  Pull: [
    { name:"Latzug", muskel:"Latissimus · Bizeps", typ:"compound",
      saetze:3, repzone:"8–12", aktuell:"Wiedereinstieg @ 85 kg – zuletzt 3×12 @ 85 kg (04.09.)", zielgewicht:85, ziel:"Summe ≥34 Wdh → 90 kg",
      progression:{ schritt:5, ab:"2026-10-01" },
      schritte:["Griff breiter als Schultern (Obergriff)","Zughilfen verwenden – Griffkraft ist nicht der Zielmuskel","Stange zur oberen Brust – Ellenbogen nach unten/hinten","Brust nach vorne öffnen – nicht zurückschaukeln!","Latissimus am Ende 1 Sek zusammenziehen"],
      tipp:"FEST IN JEDER PULL-EINHEIT (Review 30.09.). Nach dem 04.09. aus Vorsicht weggelassen, obwohl 3×12 @ 85 kg mit Zughilfen ohne 24-Stunden-Reaktion lief – die Handgelenke brauchen die Belastung. Die 36 Wdh vom 04.09. zählen bewusst nicht (Wiedereinstieg ab 01.10.): erst eine Einheit bei 85 kg bestätigen, dann 90. Zughilfen, Vier-Finger-Griff, Daumen nicht einschlagen. Steuerung über die 24-Stunden-Reaktion." },
    { name:"Ruderzug", muskel:"Mittlerer Rücken · Trapezius · Bizeps", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Wiedereinstieg @ 45 kg – zuletzt 12/12/13 @ 45 kg (15.08.)", zielgewicht:45, ziel:"Summe ≥34 Wdh → 50 kg",
      progression:{ schritt:5, ab:"2026-10-01" },
      schritte:["Aufrecht sitzen – nicht nach hinten lehnen!","Griff zur Brust-/Bauchmitte – Ellenbogen nah am Körper","Schulterblätter am Ende 1–2 Sek zusammendrücken","Kontrolliert zurück"],
      tipp:"FEST IN JEDER PULL-EINHEIT (Review 30.09.). Seit 15.08. nicht mehr gefahren – deshalb Wiedereinstieg auf dem letzten gefahrenen Gewicht 45 kg statt der rechnerisch fälligen 50. Einträge vor dem 01.10. zählen nicht. Vier-Finger-Griff, Zughilfen erlaubt." },
    { name:"Straight Arm Pulldown", muskel:"Latissimus (kein Grip)", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 33,75 kg – zuletzt 12/12/11 @ 32,5 kg (25.09., Summe 35)", zielgewicht:33.75, ziel:"Summe ≥34 Wdh → 35 kg",
      progression:{ schritt:1.25 },
      schritte:["Kabelzug, Seil oder gerade Stange auf Augenhöhe","Arme gestreckt – Stange/Seil mit gestreckten Armen nach unten/hinten drücken","Latissimus am Ende zusammenziehen","Keine Ellenbogenbeugung – das ist der Trick"],
      tipp:"32,5 kg ist inzwischen ausgebaut: 9/8/8 am 04.09. → 12/12/11 am 25.09. Nächster Schritt 1,25 kg, nicht 2,5 – der Sprung auf 32,5 war im Juli zu groß. Kein Grip nötig – Open-Hand oder Seil." },
    { name:"Dual Pulley Roll", muskel:"Latissimus · Rumpfstabilität", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 37,5 kg – zuletzt 12/11/14 @ 35 kg (25.09., Summe 37)", zielgewicht:37.5, ziel:"Summe ≥34 Wdh → 40 kg",
      progression:{ schritt:2.5 },
      schritte:["Zwei Kabelzüge auf Schulterhöhe, je eine Umlenkrolle","Einen nach dem anderen nach unten ziehen – alternierend","Rumpf stabil halten, nicht schaukeln","Kontrollierte Bewegung, Lat aktiviert halten"],
      tipp:"35 kg von 30 Wdh (20.09.) auf 37 (25.09.) ausgebaut. Der Eintrag mit 70 kg am 17.09. war das Low-Row-Gerät und zählt nicht. Mit Latzug und Ruderzug zurück in der Einheit ist das jetzt Ergänzung, nicht mehr Ersatz." },
    { name:"Bizepscurl", muskel:"Bizeps (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"12/10/8 @ 25 kg (25.09., Summe 30)", zielgewicht:25, ziel:"Summe ≥34 Wdh → 27 kg",
      progression:{ schritt:2 }, pause:{ secs:120, label:"120 Sek" },
      schritte:["Oberarme fixiert – nur Unterarme bewegen","Ganz unten strecken, oben 1 Sek halten","3–4 Sek absenken = mehr Muskelreiz","Kein Rückenschwung!","Pause 120 Sek – bewusst länger als sonst bei Isolation"],
      tipp:"Seit 15.08. auf 25 kg, sechs Wochen ohne Aufbau. Satz 1 hält 11–12 Wdh, der Einbruch sitzt in Satz 3 (6–9) – trotz Position am Anfang der Einheit. Gleiches Muster wie Rear Delt Fly: Erholung, nicht Kraft. Deshalb ab Oktober 120 Sek Pause bei 25 kg. Bewertung nach drei Einheiten; bewegt sich die Summe nicht, 27 kg mit 3×8–10. Nur Maschine/Kabel, Daumen nicht im Griff." },
    { name:"Face Pulls", muskel:"Hintere Schulter · Rotatorenmanschette", typ:"isolation",
      saetze:3, repzone:"15", aktuell:"3×12 @ 25 kg (25.09.)", zielgewicht:25, ziel:"Summe ≥43 Wdh → 26,25 kg",
      progression:{ schritt:1.25 },
      schritte:["Kabelzug mit Seilaufsatz auf Augenhöhe","Seil zur Stirn – Ellenbogen nach außen/oben"],
      tipp:"Schützt das Schultergelenk langfristig. Am 25.09. selbst auf 25 kg gegangen (3×12) – Plan auf den gefahrenen Stand gezogen. Ziel ist jetzt 3×15 bei 25 kg." },
    { name:"Wadenheben (HSR-Block)", muskel:"Gastrocnemius · Soleus · Achillessehne", typ:"compound",
      saetze:3, repzone:"6–8", aktuell:"3×8 @ 105 kg (25.09.)", zielgewicht:105, ziel:"Frequenzblock – Last wie am Legs-Tag",
      progression:{ gesperrt:true, grund:"Steuerung läuft über die Morgensteifigkeit im Werte-Tab, nicht über Wiederholungen." },
      schritte:["3 Sek runter, am tiefsten Punkt direkt umkehren","3 Sek hoch, volle Streckung","Kein Halten unten, kein Abfedern"],
      tipp:"Kurzer Zusatzblock am Ende der Einheit. Zweck ist Frequenz (3×/Woche) – Sehnenadaptation braucht wiederholte Reize. Seit 25.09. mit derselben Last wie am Legs-Tag (105 kg). Steigerung weiter nur am Legs-Tag entscheiden, dann hier nachziehen." }
  ],
  Legs: [
    { name:"Beinpresse", muskel:"Quadrizeps · Gesäß · Hamstrings", typ:"compound",
      saetze:4, repzone:"8–12", aktuell:"4×11 @ 140 kg (19.09. und 27.09., Summe 44)", zielgewicht:140, ziel:"Summe ≥45 Wdh → 145 kg",
      progression:{ schritt:5 },
      schritte:["Füße schulterbreit, Zehen leicht nach außen (15–30°)","Knie immer in Richtung Zehen – nie einknicken!","Bis ca. 90° Kniewinkel – Rücken bleibt am Sitz","Explosiv drücken, kurz vor voller Streckung stoppen"],
      tipp:"KERNBLOCK – läuft auch an kurzen Tagen. 130 → 140 kg im September. Zweimal 44 Wdh – eine Wiederholung unter der Schwelle. Stufe 5 als tiefster Punkt. Knie links: Füße etwas höher auf die Platte." },
    { name:"Beinbeuger", muskel:"Hamstrings (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"9/10/9 @ 64 kg (27.09., Summe 28)", zielgewicht:64, ziel:"Summe ≥32 Wdh → 66 kg",
      progression:{ schwelle:32, schritt:2 }, pause:{ secs:120, label:"120 Sek" },
      schritte:["Oberschenkel fest auf Polsterung – nicht abheben!","Ferse zur Gesäßfalte, oben 1–2 Sek halten","3–4 Sek langsam strecken – Absenkphase ist entscheidend","Pause 120 Sek – bewusst länger als sonst bei Isolation"],
      tipp:"KERNBLOCK – läuft auch an kurzen Tagen. 60 → 64 kg im September, der Stillstand aus dem Sommer ist gelöst. Bei 64 kg jetzt 28 Wdh – die Wiederholungen aufbauen, nicht das Gewicht. eGym kann 1-kg-Schritte; 2 kg als Kompromiss." },
    { name:"Wadenheben (HSR)", muskel:"Gastrocnemius · Soleus · Achillessehne", typ:"compound",
      saetze:4, repzone:"6–8", aktuell:"3×8 @ 105 kg (27.09., Heavy Slow Resistance)", zielgewicht:105, ziel:"Stufenweise Richtung echtes 8RM – Steuerung über Morgensteifigkeit",
      progression:{ gesperrt:true, grund:"Steuerung läuft über den 7-Tage-Schnitt der Morgensteifigkeit im Werte-Tab: fallend oder unter 2 = weiter steigern, steigend = zurück." },
      schritte:["Nur Vorderfuß auf der Platte – Ferse hängt frei","3 Sek kontrolliert runter bis zur vollen Dehnung","Am tiefsten Punkt NICHT halten – direkt umkehren, ohne Abfedern","3 Sek hoch bis zur vollen Streckung","Volle ROM (Midportion-Tendinopathie – keine Einschränkung nötig)"],
      tipp:"KERNBLOCK – läuft auch an kurzen Tagen. 90 → 105 kg am 25./27.09. ohne Reaktion: 7-Tage-Schnitt der Morgensteifigkeit 1,86 (24.–30.09.), erstmals unter 2, am 28.09. sogar 1. 90 kg im 3/3-Tempo waren zu leicht (Wadenheben lief früher mit ~135 kg). Weiter in 5-kg-Stufen Richtung echtes 8RM, solange der Schnitt nicht steigt. Sonographie-Frage entfällt." },
    { name:"Rückenstrecker", muskel:"Erector spinae (unterer Rücken)", typ:"isolation",
      saetze:3, repzone:"12–15", aktuell:"Neu ab 15 kg – zuletzt 3×15 @ 10 kg (17.08.)", zielgewicht:15, ziel:"Summe ≥43 Wdh → 20 kg",
      progression:{ schritt:5 },
      schritte:["Aufrecht in die Maschine, Rücken flach anlegen","Langsam nach vorne beugen – volle Dehnung spüren","Kontrolliert zurückstrecken bis zur aufrechten Position","Keine Überstreckung am Ende – Spannung halten"],
      tipp:"ZUSATZBLOCK. Wenn Zeit ist: erste Position der Einheit, Warm-up für die Wirbelsäule. Die Schrittweite von 5 kg ist hier relativ groß (10 → 15 kg = 50 %) – wenn die Maschine feinere Stufen kann, schritt auf 2.5 setzen." },
    { name:"Hip Thrust", muskel:"Gluteus maximus (großer Gesäßmuskel)", typ:"compound",
      saetze:3, repzone:"10–12", aktuell:"Neu ab 110 kg – zuletzt 12/11/11 @ 105 kg (27.09., Summe 34)", zielgewicht:110, ziel:"Summe ≥34 Wdh → 115 kg",
      progression:{ schritt:5 },
      schritte:["Rücken gegen Polsterung, Füße schulterbreit auf dem Boden","Hüfte nach oben drücken bis Körper eine Linie bildet","Oben 1–2 Sek halten – Gesäß maximal anspannen","Kontrolliert runter – Gesäß berührt nicht den Boden"],
      tipp:"ZUSATZBLOCK. Stärkste Progression im Log: 75 → 85 → 90 → 100 → 105 → 110 kg seit Juli. Bei 105 kg von 3×10 am 19.09. auf 12/11/11 am 27.09. – Schwelle exakt getroffen." },
    { name:"Beinstrecker", muskel:"Quadrizeps (Isolation)", typ:"isolation",
      saetze:3, repzone:"10–12", aktuell:"3×10 @ 74 kg (19.09., Summe 30)", zielgewicht:74, ziel:"Summe ≥34 Wdh → 76 kg",
      progression:{ schritt:2 },
      schritte:["Langsam strecken, oben 1–2 Sek halten und Quad anspannen","3–4 Sek zurück – nie fallen lassen"],
      tipp:"ZUSATZBLOCK – der Quadrizeps wird an kurzen Tagen von der Beinpresse mitgetragen, deshalb ist das hier die verzichtbare Übung. Seit 03.09. bei 74 kg und 3×10 – drei Einheiten ohne Bewegung, aber auch nur dreimal gefahren. Priorität bleibt niedrig. Max 113 kg = viel Potenzial." },
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
      saetze:3, repzone:"15–20", aktuell:"20/14/10/11 @ 57 kg (27.09.)", zielgewicht:57, ziel:"Summe ≥58 Wdh → 59 kg",
      progression:{ schritt:2 },
      schritte:["Bauchmuskeln aktiv zusammenziehen – nicht mit dem Rücken drücken","Langsam, kontrolliert, oben 1 Sek halten"],
      tipp:"ZUSATZBLOCK. Seit 19.09. auf 57 kg. Satz 1 bei 16–20, danach Einbruch. Drei saubere Sätze zählen; ein vierter Satz ist Zugabe, keine Pflicht. Max ist 70 kg." },
    { name:"Oblique Crunch (Hammer Strength)", muskel:"Obliques · Rectus abdominis", typ:"core",
      saetze:3, repzone:"12–15", aktuell:"Neu ab 25 kg – zuletzt 15/15/22 je Seite @ 22,5 kg (27.09.)", zielgewicht:25, ziel:"Summe ≥43 Wdh → 27,5 kg",
      progression:{ schritt:2.5 },
      schritte:["Seitlich einstellen – Schulterpolster fest anlegen","Rumpf diagonal einrollen – Schulter Richtung gegenüberliegender Hüfte","Am tiefsten Punkt 1 Sek halten, Obliques aktiv anspannen","Langsam zurück – Spannung halten, nicht zurückfallen lassen","Seite wechseln – beide Seiten gleiche Wiederholungszahl"],
      tipp:"ZUSATZBLOCK. 15 → 22,5 kg im September, am 27.09. selbst mit „↑ Erhöhen\" markiert und 52 Wdh bei Schwelle 43. Plan auf 25 kg. Kraft kommt aus dem Rumpf, nicht aus den Armen – Handgelenk neutral (De Quervain)." },
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
