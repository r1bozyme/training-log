/* ═══════════════════════════════════════════════════
   speise.js – Essen unterwegs (08.11.2026)

   Zwei Wege aus dem Scanner (scan.js), beide über tlLabel.vision:

   tlSpeise.karte()   Foto der Speisekarte (24.11.: bis zu 4 Seiten sammeln,
                      dann eine gemeinsame Anfrage). Claude bekommt das FREIE Budget
                      (foodBudgetFrei: Tagesrest minus noch fehlende Basis-
                      Posten, an Reisetagen die Reise-Basis), den bindenden
                      Faktor und „vegetarisch“, und nennt bis zu drei
                      Gerichte mit geschätzten Werten und Begründung.
                      Ein Tipp trägt das Gericht ein.
   tlSpeise.gericht() Gericht schätzen: Text („Käsespätzle mit Salat, große
                      Portion“), wahlweise mit Foto vom Teller. Ergebnis mit
                      Spanne; eingetragen wird die Mitte, Werte anpassbar.

   tlSpeise.naehe()   24.11.: Restaurants in der Nähe (Reise-Modus-Karte,
                      Scanner). Standort per GPS (OpenStreetMap-Nominatim
                      macht daraus eine Adresse) oder Freitext („Hotel …“),
                      dazu Wunsch und Gehzeit. Claude sucht per Websuche
                      (Server-Werkzeug, tlLabel.vision mit o.extra) 3–5 jetzt
                      geöffnete Lokale und nennt je Lokal das passende
                      vegetarische Gericht mit Schätzwerten fürs freie Budget.
                      „Eintragen“ bucht „~ Gericht (Lokal)“, „Maps ↗“ öffnet
                      Google Maps. Kosten ~10–20 Cent je Suche.

   25.11.: „Stimmt etwas nicht?“ (Vorbild Orva): Unter jeder Einzel-
   schätzung ein Freitextfeld („nur halbe Portion Reis“, „ohne Käse“).
   „Korrigieren“ schickt bisherige Schätzung, Annahmen und Korrektur an
   Claude (ohne Foto, gleiches Werkzeug portion) und zeigt die neue
   Schätzung; mehrere Korrekturen hintereinander gehen. Gerichte aus
   Speisekarte und Restaurant-Suche öffnen per „Ändern“ dieselbe Ansicht.

   Eingetragen wird immer als Einmal-Posten ohne Produkt (foodAddFrei,
   Name mit „~“), der Tag wird automatisch als „geschätzt“ markiert.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var ov = null;

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
function n0(x) { return String(Math.round(Number(x) || 0)); }
function flash(t) { if (window.showFlash) window.showFlash(t); }
function num(v) { v = Number(v); return isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null; }

/* ─── Sheet ───────────────────────────────────────── */
function css() {
  if (document.getElementById("sp-css")) return;
  var s = document.createElement("style"); s.id = "sp-css";
  s.textContent = [
    "#sp-ov { position:fixed; inset:0; z-index:9000; background:rgba(26,26,26,.35); display:flex; align-items:flex-end; justify-content:center; }",
    "#sp-ov .sp-sh { width:100%; max-width:480px; max-height:86vh; overflow:auto; background:var(--surface); color:var(--text);",
    "  border-radius:18px 18px 0 0; padding:18px 18px calc(18px + env(safe-area-inset-bottom)); box-sizing:border-box; font-family:var(--fb, sans-serif); }",
    "#sp-ov .sp-t { font-size:18px; font-weight:700; margin-bottom:4px; }",
    "#sp-ov .sp-x { font-size:13px; color:var(--muted); line-height:1.45; margin-bottom:12px; }",
    "#sp-ov .sp-bud { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:8px 0 14px; text-align:center; }",
    "#sp-ov .sp-bud div { background:var(--bg); border-radius:10px; padding:7px 2px; font-size:15px; font-weight:700; }",
    "#sp-ov .sp-bud span { display:block; font-size:10px; font-weight:400; color:var(--muted); letter-spacing:.04em; }",
    "#sp-ov .sp-g { border:1px solid var(--border); border-radius:14px; padding:12px 14px; margin-bottom:10px; }",
    "#sp-ov .sp-g.top { border-color:var(--neutral); }",
    "#sp-ov .sp-gn { font-size:15px; font-weight:700; }",
    "#sp-ov .sp-gm { font-size:13px; color:var(--muted); margin:3px 0 6px; }",
    "#sp-ov .sp-gr { font-size:13px; line-height:1.4; }",
    "#sp-ov .sp-gb { margin-top:10px; display:flex; gap:8px; }",
    "#sp-ov textarea { width:100%; box-sizing:border-box; border:1px solid var(--border); border-radius:12px; padding:12px; font-size:15px; font-family:inherit; min-height:74px; resize:vertical; background:var(--bg); color:inherit; }",
    "#sp-ov .sp-b { display:block; width:100%; margin-top:10px; padding:13px; border-radius:12px; border:1px solid var(--border); background:transparent; font-size:15px; font-family:inherit; color:inherit; }",
    "#sp-ov .sp-b.prim { background:var(--neutral); color:var(--on-neutral); border-color:transparent; }",
    "#sp-ov .sp-b.sm { margin-top:0; padding:10px; font-size:14px; flex:1; }",
    "#sp-ov .sp-in { width:100%; box-sizing:border-box; border:1px solid var(--border); border-radius:12px; padding:11px 12px; font-size:15px; font-family:inherit; background:var(--bg); color:inherit; margin-bottom:8px; }",
    "#sp-ov .sp-lo { font-size:12px; color:var(--muted); margin:-2px 0 10px; }",
    "#sp-ov .sp-ln { font-size:12px; font-weight:700; color:var(--muted); letter-spacing:.03em; margin-bottom:2px; }",
    "#sp-ov .sp-seg { display:flex; gap:6px; margin-bottom:10px; }",
    "#sp-ov .sp-seg button { flex:1; padding:9px 4px; border-radius:10px; border:1px solid var(--border); background:transparent; color:inherit; font-family:inherit; font-size:14px; }",
    "#sp-ov .sp-seg button.on { background:var(--neutral); color:var(--on-neutral); border-color:transparent; }",
    "#sp-ov .sp-thumbs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }",
    "#sp-ov .sp-th { position:relative; width:72px; height:96px; border-radius:10px; overflow:hidden; border:1px solid var(--border); }",
    "#sp-ov .sp-th img { width:100%; height:100%; object-fit:cover; display:block; }",
    "#sp-ov .sp-th button { position:absolute; top:3px; right:3px; width:24px; height:24px; border-radius:12px; border:none; background:var(--neutral); color:var(--on-neutral); font-size:15px; line-height:22px; padding:0; }",
    "#sp-ov .sp-th span { position:absolute; left:4px; bottom:3px; font-size:11px; font-weight:700; color:var(--on-neutral); background:var(--neutral); border-radius:6px; padding:0 5px; }",
    "#sp-ov .sp-kl { font-size:13px; font-weight:700; margin:16px 0 6px; padding-top:14px; border-top:1px solid var(--border); }",
    "#sp-ov .sp-kr { display:flex; gap:8px; } #sp-ov .sp-kr .sp-in { flex:1; margin-bottom:0; } #sp-ov .sp-kr .sp-b { width:auto; margin-top:0; padding:10px 14px; font-size:14px; }",
    "#sp-ov .sp-warn { font-size:13px; color:var(--amb-tx); margin-bottom:10px; line-height:1.4; }"
  ].join("\n");
  document.head.appendChild(s);
}
function open(html) {
  css(); close();
  ov = document.createElement("div"); ov.id = "sp-ov";
  ov.innerHTML = '<div class="sp-sh">' + html + "</div>";
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  if (window.tlBackLayer) backRel = window.tlBackLayer(function () { backRel = null; close(); });   // 11.11.: Android-Zurück
}
var backRel = null;
function close() {
  if (backRel) { var r = backRel; backRel = null; r(); }
  if (ov) { ov.remove(); ov = null; }
}
function set(html) { if (ov) ov.querySelector(".sp-sh").innerHTML = html; }

/* ─── Budget ──────────────────────────────────────── */
function budget() {
  var b = window.foodBudgetFrei ? window.foodBudgetFrei() : null;
  if (!b) return null;
  /* 18.11.: bindend sind nur Obergrenzen (Fett, kcal); Protein ist Mindestziel */
  var q = [
    { k: "f", lbl: "Fett", g: b.ziel.f }, { k: "kcal", lbl: "Kalorien", g: b.ziel.kcal }
  ].map(function (x) { x.left = b.frei[x.k]; x.q = x.g ? x.left / x.g : 0; return x; })
   .sort(function (a, c) { return a.q - c.q; });
  b.binder = q[0];
  return b;
}
function budHTML(b) {
  var c = function (k, l) { var v = b.frei[k]; return "<div" + (v < 0 ? ' style="color:var(--err)"' : "") + ">" + n0(v) + "<span>" + l + "</span></div>"; };
  return '<div class="sp-bud">' + c("kcal", "KCAL FREI") + c("kh", "G KH") + c("f", "G FETT") + c("p", "G PROT.") + "</div>" +
    (b.fehlt.length ? '<div class="sp-x">Darin schon abgezogen: ' + b.fehlt.length + " noch offene" + (b.reise ? " Reise-" : " ") + "Basis-Posten (" + esc(b.fehlt.join(", ")) + ").</div>" : "");
}
function budText(b) {
  return "Frei für dieses Essen (Tagesrest, abzüglich dessen, was heute noch fest eingeplant ist): " +
    b.frei.kcal + " kcal, " + b.frei.kh + " g Kohlenhydrate, " + b.frei.f + " g Fett, " + b.frei.p + " g Protein. " +
    "Bindender Faktor (knappste Obergrenze): " + b.binder.lbl + ". " +
    "Protein ist ein Mindestziel, keine Obergrenze: " + (b.frei.p <= 0 ? "heute schon erreicht, mehr ist unproblematisch. " : "noch " + b.frei.p + " g offen, darüber ist unproblematisch. ") +
    "Tagesziel insgesamt: " + b.ziel.kcal + " kcal / " + b.ziel.kh + " KH / " + b.ziel.f + " F / " + b.ziel.p + " P (Lean Bulk, Muskelaufbau).";
}

/* ─── Speisekarte ─────────────────────────────────── */
var TOOL_KARTE = {
  name: "empfehlung",
  description: "Bis zu drei passende Gerichte von der Speisekarte mit geschätzten Nährwerten je Portion",
  input_schema: {
    type: "object",
    properties: {
      lesbar: { type: "boolean", description: "Speisekarte sicher lesbar" },
      gerichte: { type: "array", items: { type: "object", properties: {
        name: { type: "string", description: "Gericht wie auf der Karte, ggf. mit Anpassung in Klammern" },
        kcal: { type: "number" }, kh: { type: "number" }, f: { type: "number" }, p: { type: "number" },
        grund: { type: "string", description: "ein Satz: warum / worauf achten" },
        passt: { type: "boolean", description: "bleibt im freien Budget" }
      }, required: ["name", "kcal", "kh", "f", "p", "grund", "passt"] } },
      hinweis: { type: "string", description: "kurz, z. B. wenn nichts gut passt oder Karte unvollständig" }
    },
    required: ["lesbar", "gerichte"]
  }
};

/* 24.11.: Mehrere Seiten – Fotos sammeln (höchstens MAXS), dann eine Anfrage */
var MAXS = 4, seiten = [];
function karte() {
  if (!window.tlLabel) return;
  if (!budget()) { flash("Ernährung-Tab nicht bereit"); return; }
  window.tlLabel.key().then(function (k) {
    if (!k) return;
    seiten = [];
    seite(false);
  });
}
function seite(gallery) {
  if (seiten.length >= MAXS) return;
  window.tlLabel.photo(gallery).then(function (img) {
    if (img) seiten.push(img);
    if (!seiten.length) { close(); return; }
    zeigeSeiten();
  });
}
function zeigeSeiten() {
  var b = budget(); if (!b) return;
  var n = seiten.length, voll = n >= MAXS;
  var h = '<div class="sp-t">Speisekarte</div>' + budHTML(b) +
    '<div class="sp-thumbs">' + seiten.map(function (img, i) {
      return '<div class="sp-th"><img src="data:image/jpeg;base64,' + img + '" alt=""><button onclick="tlSpeise.seiteWeg(' + i + ')" aria-label="Seite entfernen">×</button><span>' + (i + 1) + "</span></div>";
    }).join("") + "</div>" +
    '<div class="sp-x">' + n + (n === 1 ? " Seite" : " Seiten") + (voll ? " – mehr passen nicht in eine Anfrage." : ". Weitere Seiten? Nur die mit Hauptgerichten reichen meist.") + "</div>" +
    '<button class="sp-b prim" onclick="tlSpeise.auswerten()">Auswerten (' + n + (n === 1 ? " Seite" : " Seiten") + ")</button>" +
    (voll ? "" : '<div class="sp-gb"><button class="sp-b sm" onclick="tlSpeise.seite(false)">＋ Seite fotografieren</button>' +
      '<button class="sp-b sm" onclick="tlSpeise.seite(true)">＋ Aus Galerie</button></div>') +
    '<button class="sp-b" onclick="tlSpeise.close()">Abbrechen</button>';
  if (ov) set(h); else open(h);
}
function auswerten() {
  var b = budget(); if (!b || !seiten.length) return;
  var n = seiten.length;
  var prompt = [
    (n === 1 ? "Das Foto zeigt eine Speisekarte" : "Die " + n + " Fotos zeigen zusammen EINE Speisekarte (mehrere Seiten)") +
      " (Restaurant, Kantine o. ä.). Ich bin Vegetarier (Eier und Milchprodukte ja, kein Fleisch, kein Fisch).",
    budText(b),
    "Wähle bis zu drei vegetarische Gerichte" + (n > 1 ? " aus allen Seiten zusammen" : "") + ", die am besten in dieses freie Budget passen, und rufe das Werkzeug empfehlung auf.",
    "Regeln:",
    "- Fett und Kalorien sind Obergrenzen, der bindende Faktor entscheidet, wenn es eng wird. Protein ist ein Mindestziel: Ist noch viel offen, proteinreiche Gerichte bevorzugen; ist es (fast) erreicht, zählt Protein nicht mehr – dann Gerichte mit vielen Kohlenhydraten und wenig Fett bevorzugen. Proteinüberschreitung ist nie ein Grund für passt=false.",
    "- Schätze Nährwerte je Portion realistisch für deutsche/österreichische Restaurantportionen (eher groß). Fett bei Käse-, Sahne- und frittierten Gerichten nicht unterschätzen.",
    "- Eine Anpassung ist erlaubt und oft klug (z. B. „Dressing separat“, „ohne Pommes, dafür Salat“, „halbe Portion“) – dann kurz in Klammern an den Namen und die Werte entsprechend schätzen.",
    "- Beilagen oder Extras von einer anderen Seite (z. B. „Reis extra“) dürfen kombiniert werden.",
    "- Beste Wahl zuerst. passt=false, wenn das Gericht das freie Budget trotzdem sprengt, aber die beste Annäherung ist.",
    "- grund: ein kurzer Satz, konkret (z. B. „28 g Protein, Fett knapp – Käse weglassen“).",
    "- Ist die Karte nicht lesbar, lesbar=false und keine Gerichte erfinden; ist nur eine Seite unlesbar, das im hinweis sagen."
  ].join("\n");
  set('<div class="sp-t">Speisekarte</div>' + budHTML(b) + '<div class="sp-x">Claude liest ' + (n === 1 ? "die Karte" : n + " Seiten") + " …</div>");
  window.tlLabel.vision({ prompt: prompt, images: seiten, tool: TOOL_KARTE, maxTokens: 2500, limitMs: 45000 + 15000 * (n - 1), busy: "Speisekarte wird gelesen …" })
    .then(function (x) { showKarte(b, x); });
}

var lastG = [];
function showKarte(b, x) {
  if (!ov) return;
  if (!x || x.lesbar === false || !Array.isArray(x.gerichte) || !x.gerichte.length) {
    set('<div class="sp-t">Speisekarte</div><div class="sp-x">' + (x && x.hinweis ? esc(x.hinweis) : "Karte nicht lesbar – näher und gerader fotografieren, oder das Gericht beschreiben.") + "</div>" +
      '<button class="sp-b prim" onclick="tlSpeise.karte()">Nochmal fotografieren</button>' +
      '<button class="sp-b" onclick="tlSpeise.gericht()">Gericht beschreiben</button>' +
      '<button class="sp-b" onclick="tlSpeise.close()">Schließen</button>');
    return;
  }
  lastG = x.gerichte.slice(0, 3).map(function (g) {
    return { n: String(g.name || "Gericht").slice(0, 60), kcal: num(g.kcal) || 0, kh: num(g.kh) || 0, f: num(g.f) || 0, p: num(g.p) || 0,
             grund: String(g.grund || ""), passt: g.passt !== false };
  });
  var h = '<div class="sp-t">Speisekarte</div>' + budHTML(b) +
    (x.hinweis ? '<div class="sp-warn">' + esc(x.hinweis) + "</div>" : "");
  h += lastG.map(function (g, i) {
    var over = ["kcal", "kh", "f"].filter(function (k) { return g[k] > b.frei[k]; });   // mehr Protein ist kein Problem
    return '<div class="sp-g' + (i === 0 ? " top" : "") + '"><div class="sp-gn">' + esc(g.n) + "</div>" +
      '<div class="sp-gm">~ ' + n0(g.kcal) + " kcal · " + n0(g.kh) + " KH · " + n0(g.f) + " F · " + n0(g.p) + " P" +
        (over.length ? ' · <span style="color:var(--err)">über Budget: ' + over.map(function (k) { return { kcal: "kcal", kh: "KH", f: "Fett", p: "Protein" }[k]; }).join(", ") + "</span>" : "") + "</div>" +
      '<div class="sp-gr">' + esc(g.grund) + "</div>" +
      '<div class="sp-gb"><button class="sp-b sm prim" onclick="tlSpeise.nimm(' + i + ')">Eintragen</button>' +
      '<button class="sp-b sm" onclick="tlSpeise.aendern(' + i + ')">Ändern</button></div></div>';
  }).join("");
  h += '<div class="sp-x" style="margin-top:6px">Schätzwerte, ±25 % sind bei Restaurantportionen normal. Der Tag wird als „geschätzt“ markiert.</div>' +
    '<button class="sp-b" onclick="tlSpeise.gericht()">Anderes Gericht beschreiben</button>' +
    '<button class="sp-b" onclick="tlSpeise.close()">Schließen</button>';
  set(h);
}

function eintragen(g) {
  close();
  if (!window.foodAddFrei) return;
  window.foodAddFrei({ n: "~ " + g.n.replace(/^~\s*/, ""), kcal: g.kcal, kh: g.kh, f: g.f, p: g.p });
}
function anpassen(g) {
  close();
  tlAsk.form({
    title: g.n, text: "Geschätzte Werte je Portion – anpassen und eintragen.", ok: "Eintragen",
    fields: [
      { key: "n", label: "Name", type: "text", value: g.n },
      { key: "kcal", label: "kcal", type: "num", value: g.kcal, step: 10, min: 0 },
      { key: "kh", label: "Kohlenhydrate", type: "num", value: g.kh, step: 1, min: 0, suffix: "g" },
      { key: "f", label: "Fett", type: "num", value: g.f, step: 1, min: 0, suffix: "g" },
      { key: "p", label: "Protein", type: "num", value: g.p, step: 1, min: 0, suffix: "g" }
    ]
  }).then(function (r) {
    if (!r) return;
    var v = function (k) { var x = Number(String(r[k]).replace(",", ".")); return isFinite(x) && x >= 0 ? x : g[k]; };
    eintragen({ n: String(r.n || g.n).trim() || g.n, kcal: v("kcal"), kh: v("kh"), f: v("f"), p: v("p") });
  });
}

/* ─── Gericht schätzen ────────────────────────────── */
var TOOL_GERICHT = {
  name: "portion",
  description: "Geschätzte Nährwerte eines Gerichts je Portion, mit Spanne",
  input_schema: {
    type: "object",
    properties: {
      sicher: { type: "boolean", description: "Gericht erkannt / Beschreibung ausreichend" },
      name: { type: "string", description: "kurzer Name des Gerichts" },
      kcal: { type: "number" }, kh: { type: "number" }, f: { type: "number" }, p: { type: "number" },
      kcal_min: { type: "number" }, kcal_max: { type: "number" },
      annahmen: { type: "string", description: "ein Satz: angenommene Portion und Zubereitung" }
    },
    required: ["sicher", "name", "kcal", "kh", "f", "p", "kcal_min", "kcal_max"]
  }
};

function gericht() {
  if (!window.tlLabel) return;
  open('<div class="sp-t">Gericht schätzen</div>' +
    '<div class="sp-x">Beschreib, was du isst – Portion und Zubereitung helfen. Ein Foto vom Teller ist optional; Text ist bei Portionen oft genauer.</div>' +
    '<textarea id="sp-txt" placeholder="z. B. Käsespätzle mit kleinem Salat, große Portion, Röstzwiebeln"></textarea>' +
    '<button class="sp-b prim" onclick="tlSpeise.schaetzen(false)">Schätzen</button>' +
    '<button class="sp-b" onclick="tlSpeise.schaetzen(true)">Mit Foto schätzen</button>' +
    '<button class="sp-b" onclick="tlSpeise.close()">Abbrechen</button>');
  var t = document.getElementById("sp-txt"); if (t) t.focus();
}

function schaetzen(mitFoto) {
  var t = document.getElementById("sp-txt"), txt = t ? t.value.trim() : "";
  if (!txt && !mitFoto) { flash("Bitte das Gericht beschreiben"); return; }
  window.tlLabel.key().then(function (k) {
    if (!k) return;
    var p = mitFoto ? window.tlLabel.photo() : Promise.resolve(null);
    return p.then(function (img) {
      if (mitFoto && !img) return;
      var prompt = [
        mitFoto ? "Das Foto zeigt mein Essen." : "Ich beschreibe mein Essen.",
        txt ? "Beschreibung: " + txt : "Keine Beschreibung – schätze anhand des Fotos.",
        "Schätze die Nährwerte je Portion (kcal, Kohlenhydrate, Fett, Protein in g) für eine typische Restaurant- bzw. Kantinenportion in Deutschland/Österreich und rufe das Werkzeug portion auf.",
        "Regeln:",
        "- Mittelwert schätzen, dazu kcal_min/kcal_max als realistische Spanne.",
        "- Fett bei Käse, Sahne, Butter, Frittiertem und Dressings nicht unterschätzen; Protein nicht überschätzen.",
        "- annahmen: ein Satz, welche Portion und Zubereitung du angenommen hast.",
        "- Wenn die Beschreibung/das Foto nicht reicht: sicher=false und die wahrscheinlichste Annahme nennen."
      ].join("\n");
      set('<div class="sp-t">Gericht schätzen</div><div class="sp-x">Claude schätzt …</div>');
      return window.tlLabel.vision({ prompt: prompt, image: img, tool: TOOL_GERICHT, maxTokens: 1500, busy: "Gericht wird geschätzt …" })
        .then(function (x) { showGericht(x, txt); });
    });
  });
}

var cur = null;   // 25.11.: aktuelle Einzelschätzung für „Korrigieren“
function showGericht(x, txt) {
  if (!ov) return;
  if (!x || x.kcal == null) {
    set('<div class="sp-t">Gericht schätzen</div><div class="sp-x">Keine Schätzung erhalten.</div>' +
      '<button class="sp-b prim" onclick="tlSpeise.gericht()">Nochmal</button><button class="sp-b" onclick="tlSpeise.close()">Schließen</button>');
    return;
  }
  var g = { n: String(x.name || txt || "Gericht").slice(0, 60), kcal: num(x.kcal) || 0, kh: num(x.kh) || 0, f: num(x.f) || 0, p: num(x.p) || 0 };
  lastG = [g];
  cur = { g: g, annahmen: String(x.annahmen || ""), txt: txt || "", min: x.kcal_min, max: x.kcal_max };
  var b = budget(), over = b ? ["kcal", "kh", "f"].filter(function (k) { return g[k] > b.frei[k]; }) : [];
  set('<div class="sp-t">' + esc(g.n) + "</div>" +
    (x.sicher === false ? '<div class="sp-warn">Unsichere Schätzung – Beschreibung war knapp.</div>' : "") +
    '<div class="sp-bud"><div>' + n0(g.kcal) + "<span>KCAL</span></div><div>" + n0(g.kh) + "<span>G KH</span></div><div>" + n0(g.f) + "<span>G FETT</span></div><div>" + n0(g.p) + "<span>G PROT.</span></div></div>" +
    '<div class="sp-x">' + (x.kcal_min != null && x.kcal_max != null ? "Spanne " + n0(x.kcal_min) + "–" + n0(x.kcal_max) + " kcal" : "Schätzwert") + (x.annahmen ? " · " + esc(x.annahmen) : "") +
      (over.length ? '<br><span style="color:var(--err)">Über dem freien Budget: ' + over.map(function (k) { return { kcal: "kcal", kh: "KH", f: "Fett", p: "Protein" }[k]; }).join(", ") + "</span>" : "") + "</div>" +
    '<button class="sp-b prim" onclick="tlSpeise.nimm(0)">Eintragen</button>' +
    '<button class="sp-b" onclick="tlSpeise.anpassen(0)">Werte anpassen</button>' +
    '<div class="sp-kl">Stimmt etwas nicht?</div>' +
    '<div class="sp-kr"><input class="sp-in" id="sp-korr" placeholder="z. B. nur halbe Portion Reis" enterkeyhint="send">' +
      '<button class="sp-b" onclick="tlSpeise.korrigieren()">Korrigieren</button></div>' +
    '<button class="sp-b" onclick="tlSpeise.gericht()">Neu beschreiben</button>' +
    '<button class="sp-b" onclick="tlSpeise.close()">Abbrechen</button>');
  var k = document.getElementById("sp-korr");
  if (k) k.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); korrigieren(); } });
}

/* 25.11.: Schätzung per Freitext nachbessern (ohne Foto, nur Text) */
function korrigieren() {
  var el = document.getElementById("sp-korr"), k = el ? el.value.trim() : "";
  if (!cur) return;
  if (!k) { flash("Bitte kurz schreiben, was nicht stimmt"); return; }
  var g = cur.g, c = cur;
  var prompt = [
    "Du hast für mein Essen diese Nährwerte je Portion geschätzt:",
    g.n + ": " + n0(g.kcal) + " kcal, " + n0(g.kh) + " g KH, " + n0(g.f) + " g Fett, " + n0(g.p) + " g Protein" +
      (c.min != null && c.max != null ? " (Spanne " + n0(c.min) + "–" + n0(c.max) + " kcal)" : "") + ".",
    c.annahmen ? "Deine Annahmen: " + c.annahmen : "",
    c.txt ? "Bisherige Angaben von mir: " + c.txt : "",
    "Meine Korrektur: " + k,
    "Passe die Schätzung an die Korrektur an und rufe das Werkzeug portion auf. Ändere nur, was die Korrektur betrifft; der Rest bleibt wie geschätzt.",
    "Fett bei Käse, Sahne, Butter, Frittiertem und Dressings nicht unterschätzen; Protein nicht überschätzen. annahmen: ein Satz zur jetzt angenommenen Portion."
  ].filter(Boolean).join("\n");
  window.tlLabel.vision({ prompt: prompt, image: null, tool: TOOL_GERICHT, maxTokens: 1500, busy: "Schätzung wird korrigiert …" })
    .then(function (x) {
      if (!x || x.kcal == null) return;   // Fehler meldet tlLabel; alte Schätzung bleibt stehen
      showGericht(x, (c.txt ? c.txt + " · " : "") + "Korrektur: " + k);
    });
}
function aendernAus(g, kontext) {
  showGericht({ sicher: true, name: g.n, kcal: g.kcal, kh: g.kh, f: g.f, p: g.p, annahmen: g.grund || "" }, kontext + ": " + g.n);
}

/* ─── In der Nähe (24.11.) ────────────────────────── */
var TOOL_NAEHE = {
  name: "lokale",
  description: "3–5 Restaurants in Gehweite mit je einem passenden vegetarischen Gericht und geschätzten Nährwerten je Portion",
  input_schema: {
    type: "object",
    properties: {
      ort: { type: "string", description: "Wie du den Standort verstanden hast (kurz)" },
      lokale: { type: "array", items: { type: "object", properties: {
        lokal: { type: "string" },
        adresse: { type: "string", description: "Straße und Hausnummer" },
        minuten: { type: "number", description: "geschätzte Gehminuten vom Standort" },
        offen: { type: "string", description: "Öffnungszeit heute, z. B. „bis 22 Uhr“, oder „unklar“" },
        gericht: { type: "string", description: "konkretes Gericht, kurz (höchstens 45 Zeichen); Anpassungen gehören in grund" },
        kcal: { type: "number" }, kh: { type: "number" }, f: { type: "number" }, p: { type: "number" },
        grund: { type: "string", description: "höchstens zwei kurze Sätze: warum und was beim Bestellen sagen" },
        passt: { type: "boolean", description: "bleibt im freien Budget (Protein zählt nicht)" }
      }, required: ["lokal", "adresse", "minuten", "gericht", "kcal", "kh", "f", "p", "grund", "passt"] } },
      hinweis: { type: "string", description: "höchstens zwei Sätze, z. B. wenn Fett kaum noch frei ist und was du dann rätst" }
    },
    required: ["lokale"]
  }
};
var WEB = { type: "web_search_20250305", name: "web_search", max_uses: 5,
            user_location: { type: "approximate", country: "DE", timezone: "Europe/Berlin" } };
var nh = { pos: null, adr: "", stadt: "", min: 10 };

function naehe() {
  if (!window.tlLabel) return;
  var b = budget();
  if (!b) { flash("Ernährung-Tab nicht bereit"); return; }
  open('<div class="sp-t">Restaurants in der Nähe</div>' + budHTML(b) +
    '<div class="sp-ln">STANDORT</div>' +
    '<input id="sp-ort" class="sp-in" placeholder="Hotel, Adresse – leer = aktueller Standort" value="' + esc(nh.frei || "") + '">' +
    '<div class="sp-lo" id="sp-lo">' + (nh.adr ? "📍 " + esc(nh.adr) : "Standort wird ermittelt …") + "</div>" +
    '<div class="sp-ln">GEHZEIT HÖCHSTENS</div><div class="sp-seg" id="sp-min">' +
      [5, 10, 15, 20].map(function (m) { return '<button data-m="' + m + '"' + (m === nh.min ? ' class="on"' : "") + ">" + m + " Min</button>"; }).join("") + "</div>" +
    '<div class="sp-ln">WUNSCH (OPTIONAL)</div>' +
    '<input id="sp-wu" class="sp-in" placeholder="z. B. asiatisch, ruhig, schnell" value="' + esc(nh.wunsch || "") + '">' +
    '<button class="sp-b prim" onclick="tlSpeise.suchen()">Passende Lokale suchen</button>' +
    '<div class="sp-x" style="margin-top:8px">Claude sucht im Netz nach geöffneten Lokalen und schätzt je ein Gericht. Dauert 20–60 s, kostet ~10–20 Cent.</div>' +
    '<button class="sp-b" onclick="tlSpeise.close()">Abbrechen</button>');
  ov.querySelector("#sp-min").addEventListener("click", function (e) {
    var m = e.target && e.target.getAttribute("data-m"); if (!m) return;
    nh.min = Number(m);
    [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === e.target); });
  });
  orten();
}

function orten() {
  var lo = function (t) { var el = document.getElementById("sp-lo"); if (el) el.textContent = t; };
  if (!navigator.geolocation) { lo("Kein GPS – bitte Ort eintippen"); return; }
  navigator.geolocation.getCurrentPosition(function (p) {
    nh.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
    lo("📍 " + nh.pos.lat.toFixed(4) + ", " + nh.pos.lon.toFixed(4) + " – Adresse wird gesucht …");
    /* Adresse für Claude (Koordinaten allein sucht die Websuche schlecht) */
    fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=de&lat=" + nh.pos.lat + "&lon=" + nh.pos.lon)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var a = (d && d.address) || {};
        var str = [a.road, a.house_number].filter(Boolean).join(" ");
        nh.stadt = a.city || a.town || a.village || "";
        nh.adr = [str, a.postcode && nh.stadt ? a.postcode + " " + nh.stadt : nh.stadt, a.suburb].filter(Boolean).join(", ");
        lo("📍 " + (nh.adr || "Standort gefunden"));
      })
      .catch(function () { lo("📍 Standort gefunden (ohne Adresse)"); });
  }, function () { nh.pos = null; lo("Standort nicht verfügbar – bitte Ort eintippen"); },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
}

function suchen() {
  var b = budget(); if (!b) return;
  var f = document.getElementById("sp-ort"), w = document.getElementById("sp-wu");
  nh.frei = f ? f.value.trim() : ""; nh.wunsch = w ? w.value.trim() : "";
  if (!nh.frei && !nh.pos) { flash("Bitte Ort eintippen oder Standort erlauben"); return; }
  var ort = nh.frei ? "Standort: " + nh.frei + (nh.stadt ? " (aktuell in " + nh.stadt + ")" : "")
          : "Standort: " + (nh.adr || "") + " (GPS " + nh.pos.lat.toFixed(5) + ", " + nh.pos.lon.toFixed(5) + ", ±" + nh.pos.acc + " m)";
  var jetzt = new Date(), wt = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][jetzt.getDay()];
  var prompt = [
    "Ich bin unterwegs und suche jetzt ein Restaurant zum Essen. Ich bin Vegetarier (Eier und Milchprodukte ja, kein Fleisch, kein Fisch).",
    ort + ". Höchstens " + nh.min + " Minuten zu Fuß.",
    "Jetzt: " + wt + ", " + String(jetzt.getHours()).padStart(2, "0") + ":" + String(jetzt.getMinutes()).padStart(2, "0") + " Uhr.",
    nh.wunsch ? "Wunsch: " + nh.wunsch + "." : "",
    budText(b),
    "Vorgehen: Suche mit der Websuche nach Restaurants in Gehweite, die jetzt geöffnet sind, und – wo möglich – nach ihrer Speisekarte. Wähle 3–5 Lokale mit je EINEM konkreten Gericht, das am besten ins freie Budget passt, und rufe dann das Werkzeug lokale auf.",
    "Regeln:",
    "- Nur Lokale, die es wirklich an dieser Adresse gibt (aus den Suchergebnissen), keine erfundenen. Lieber 3 sichere als 5 unsichere. Gehminuten realistisch schätzen, sortiert nach Eignung, beste zuerst.",
    "- Fett und Kalorien sind Obergrenzen; der bindende Faktor entscheidet. Protein ist ein Mindestziel, Überschreitung ist nie ein Grund für passt=false. Ist noch viel Protein offen, proteinreich bevorzugen; sind viele Kohlenhydrate offen, KH-dichte, fettarme Gerichte (Reis, Nudeln, Brot, Brühe) bevorzugen.",
    "- Ist kaum noch Fett frei, das fettärmste realistische Gericht wählen und im hinweis offen sagen, wie viel Fett es trotzdem kostet – nicht schönrechnen.",
    "- Anpassungen sind erlaubt und oft klug („Extra Reis“, „ohne Käse“, „Dressing separat“, „Tofu nicht frittiert“) – im grund nennen, Werte entsprechend; der Gerichtname bleibt kurz.",
    "- Nährwerte je Portion realistisch für deutsche Restaurantportionen (eher groß); Fett bei Käse, Sahne, Öl, Ghee, Frittiertem nicht unterschätzen.",
    "- grund: ein kurzer Satz, konkret. offen: Öffnungszeit heute, falls gefunden."
  ].filter(Boolean).join("\n");
  set('<div class="sp-t">Restaurants in der Nähe</div>' + budHTML(b) + '<div class="sp-x">Claude sucht Lokale und Gerichte … (20–60 s)</div>');
  window.tlLabel.vision({ prompt: prompt, tool: TOOL_NAEHE, extra: [WEB], maxTokens: 4000, limitMs: 120000, busy: "Lokale werden gesucht …" })
    .then(function (x) { showNaehe(b, x); });
}

var lastL = [];
function showNaehe(b, x) {
  if (!ov) return;
  if (!x || !Array.isArray(x.lokale) || !x.lokale.length) {
    set('<div class="sp-t">Restaurants in der Nähe</div><div class="sp-x">' + (x && x.hinweis ? esc(x.hinweis) : "Nichts Passendes gefunden.") + "</div>" +
      '<button class="sp-b prim" onclick="tlSpeise.naehe()">Nochmal</button><button class="sp-b" onclick="tlSpeise.close()">Schließen</button>');
    return;
  }
  lastL = x.lokale.slice(0, 5).map(function (l) {
    return { lokal: String(l.lokal || "Lokal").slice(0, 50), adr: String(l.adresse || ""), min: num(l.minuten), offen: String(l.offen || ""),
             n: String(l.gericht || "Gericht").slice(0, 90), kcal: num(l.kcal) || 0, kh: num(l.kh) || 0, f: num(l.f) || 0, p: num(l.p) || 0,
             grund: String(l.grund || ""), passt: l.passt !== false };
  });
  var h = '<div class="sp-t">Restaurants in der Nähe</div>' + budHTML(b) +
    (x.hinweis ? '<div class="sp-warn">' + esc(x.hinweis) + "</div>" : "");
  h += lastL.map(function (l, i) {
    var over = ["kcal", "kh", "f"].filter(function (k) { return l[k] > b.frei[k]; });
    var q = encodeURIComponent(l.lokal + " " + l.adr + (nh.stadt ? " " + nh.stadt : ""));
    return '<div class="sp-g' + (i === 0 ? " top" : "") + '"><div class="sp-gn">' + esc(l.lokal) + "</div>" +
      '<div class="sp-gm">' + esc(l.adr) + (l.min != null ? " · ~" + n0(l.min) + " Min" : "") + (l.offen ? " · " + esc(l.offen) : "") + "</div>" +
      '<div class="sp-gr" style="font-weight:700">' + esc(l.n) + "</div>" +
      '<div class="sp-gm">~ ' + n0(l.kcal) + " kcal · " + n0(l.kh) + " KH · " + n0(l.f) + " F · " + n0(l.p) + " P" +
        (over.length ? ' · <span style="color:var(--err)">über Budget: ' + over.map(function (k) { return { kcal: "kcal", kh: "KH", f: "Fett" }[k]; }).join(", ") + "</span>" : "") + "</div>" +
      '<div class="sp-gr">' + esc(l.grund) + "</div>" +
      '<div class="sp-gb"><button class="sp-b sm prim" onclick="tlSpeise.nimmL(' + i + ')">Eintragen</button>' +
      '<button class="sp-b sm" onclick="tlSpeise.aendernL(' + i + ')">Ändern</button>' +
      '<a class="sp-b sm" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + q + '">Maps ↗</a></div></div>';
  }).join("");
  h += '<div class="sp-x" style="margin-top:6px">Schätzwerte aus der Websuche – Öffnungszeiten vor Ort prüfen. Liegt die Karte vor dir, ist „Speisekarte“ genauer.</div>' +
    '<button class="sp-b" onclick="tlSpeise.karte()">Speisekarte vor Ort fotografieren</button>' +
    '<button class="sp-b" onclick="tlSpeise.close()">Schließen</button>';
  set(h);
}
function lPosten(l) { return { n: l.n + " (" + l.lokal + ")", kcal: l.kcal, kh: l.kh, f: l.f, p: l.p }; }

window.tlSpeise = {
  naehe: naehe, suchen: suchen,
  seite: seite, auswerten: auswerten,
  seiteWeg: function (i) { seiten.splice(i, 1); if (seiten.length) zeigeSeiten(); else close(); },
  nimmL: function (i) { if (lastL[i]) eintragen(lPosten(lastL[i])); },
  anpassenL: function (i) { if (lastL[i]) anpassen(lPosten(lastL[i])); },
  aendernL: function (i) { var l = lastL[i]; if (!l) return; var g = lPosten(l); g.grund = l.grund; aendernAus(g, "Gericht im Lokal " + l.lokal); },
  aendern: function (i) { if (lastG[i]) aendernAus(lastG[i], "Gericht von der Speisekarte"); },
  korrigieren: korrigieren,
  karte: karte, gericht: gericht, schaetzen: schaetzen, close: close,
  nimm: function (i) { if (lastG[i]) eintragen(lastG[i]); },
  anpassen: function (i) { if (lastG[i]) anpassen(lastG[i]); }
};
})();
