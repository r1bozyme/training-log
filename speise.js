/* ═══════════════════════════════════════════════════
   speise.js – Essen unterwegs (08.11.2026)

   Zwei Wege aus dem Scanner (scan.js), beide über tlLabel.vision:

   tlSpeise.karte()   Foto der Speisekarte. Claude bekommt das FREIE Budget
                      (foodBudgetFrei: Tagesrest minus noch fehlende Basis-
                      Posten, an Reisetagen die Reise-Basis), den bindenden
                      Faktor und „vegetarisch“, und nennt bis zu drei
                      Gerichte mit geschätzten Werten und Begründung.
                      Ein Tipp trägt das Gericht ein.
   tlSpeise.gericht() Gericht schätzen: Text („Käsespätzle mit Salat, große
                      Portion“), wahlweise mit Foto vom Teller. Ergebnis mit
                      Spanne; eingetragen wird die Mitte, Werte anpassbar.

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
    "#sp-ov .sp-sh { width:100%; max-width:480px; max-height:86vh; overflow:auto; background:var(--surface, #fff); color:var(--text, #1A1A1A);",
    "  border-radius:18px 18px 0 0; padding:18px 18px calc(18px + env(safe-area-inset-bottom)); box-sizing:border-box; font-family:var(--fb, sans-serif); }",
    "#sp-ov .sp-t { font-size:18px; font-weight:700; margin-bottom:4px; }",
    "#sp-ov .sp-x { font-size:13px; color:var(--muted, #777); line-height:1.45; margin-bottom:12px; }",
    "#sp-ov .sp-bud { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:8px 0 14px; text-align:center; }",
    "#sp-ov .sp-bud div { background:var(--bg, #F4F4F2); border-radius:10px; padding:7px 2px; font-size:15px; font-weight:700; }",
    "#sp-ov .sp-bud span { display:block; font-size:10px; font-weight:400; color:var(--muted, #777); letter-spacing:.04em; }",
    "#sp-ov .sp-g { border:1px solid var(--border, #E3E3E0); border-radius:14px; padding:12px 14px; margin-bottom:10px; }",
    "#sp-ov .sp-g.top { border-color:var(--neutral, #1A1A1A); }",
    "#sp-ov .sp-gn { font-size:15px; font-weight:700; }",
    "#sp-ov .sp-gm { font-size:13px; color:var(--muted, #777); margin:3px 0 6px; }",
    "#sp-ov .sp-gr { font-size:13px; line-height:1.4; }",
    "#sp-ov .sp-gb { margin-top:10px; display:flex; gap:8px; }",
    "#sp-ov textarea { width:100%; box-sizing:border-box; border:1px solid var(--border, #E3E3E0); border-radius:12px; padding:12px; font-size:15px; font-family:inherit; min-height:74px; resize:vertical; background:var(--bg, #F4F4F2); color:inherit; }",
    "#sp-ov .sp-b { display:block; width:100%; margin-top:10px; padding:13px; border-radius:12px; border:1px solid var(--border, #E3E3E0); background:transparent; font-size:15px; font-family:inherit; color:inherit; }",
    "#sp-ov .sp-b.prim { background:var(--neutral, #1A1A1A); color:#fff; border-color:transparent; }",
    "#sp-ov .sp-b.sm { margin-top:0; padding:10px; font-size:14px; flex:1; }",
    "#sp-ov .sp-warn { font-size:13px; color:#B87A15; margin-bottom:10px; line-height:1.4; }"
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
  var q = [
    { k: "f", lbl: "Fett", g: b.ziel.f }, { k: "p", lbl: "Protein", g: b.ziel.p },
    { k: "kh", lbl: "Kohlenhydrate", g: b.ziel.kh }, { k: "kcal", lbl: "Kalorien", g: b.ziel.kcal }
  ].map(function (x) { x.left = b.frei[x.k]; x.q = x.g ? x.left / x.g : 0; return x; })
   .sort(function (a, c) { return a.q - c.q; });
  b.binder = q[0];
  return b;
}
function budHTML(b) {
  var c = function (k, l) { var v = b.frei[k]; return "<div" + (v < 0 ? ' style="color:#A33A2A"' : "") + ">" + n0(v) + "<span>" + l + "</span></div>"; };
  return '<div class="sp-bud">' + c("kcal", "KCAL FREI") + c("kh", "G KH") + c("f", "G FETT") + c("p", "G PROT.") + "</div>" +
    (b.fehlt.length ? '<div class="sp-x">Darin schon abgezogen: ' + b.fehlt.length + " noch offene" + (b.reise ? " Reise-" : " ") + "Basis-Posten (" + esc(b.fehlt.join(", ")) + ").</div>" : "");
}
function budText(b) {
  return "Frei für dieses Essen (Tagesrest, abzüglich dessen, was heute noch fest eingeplant ist): " +
    b.frei.kcal + " kcal, " + b.frei.kh + " g Kohlenhydrate, " + b.frei.f + " g Fett, " + b.frei.p + " g Protein. " +
    "Bindender Faktor (knappstes Budget): " + b.binder.lbl + ". " +
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

function karte() {
  if (!window.tlLabel) return;
  var b = budget();
  if (!b) { flash("Ernährung-Tab nicht bereit"); return; }
  window.tlLabel.key().then(function (k) {
    if (!k) return;
    return window.tlLabel.photo().then(function (img) {
      if (!img) return;
      var prompt = [
        "Das Foto zeigt eine Speisekarte (Restaurant, Kantine o. ä.). Ich bin Vegetarier (Eier und Milchprodukte ja, kein Fleisch, kein Fisch).",
        budText(b),
        "Wähle bis zu drei vegetarische Gerichte, die am besten in dieses freie Budget passen, und rufe das Werkzeug empfehlung auf.",
        "Regeln:",
        "- Vorrang: viel Protein, Fett innerhalb des Budgets. Der bindende Faktor entscheidet, wenn es eng wird.",
        "- Schätze Nährwerte je Portion realistisch für deutsche/österreichische Restaurantportionen (eher groß). Fett bei Käse-, Sahne- und frittierten Gerichten nicht unterschätzen.",
        "- Eine Anpassung ist erlaubt und oft klug (z. B. „Dressing separat“, „ohne Pommes, dafür Salat“, „halbe Portion“) – dann in Klammern an den Namen und die Werte entsprechend schätzen.",
        "- Beste Wahl zuerst. passt=false, wenn das Gericht das freie Budget trotzdem sprengt, aber die beste Annäherung ist.",
        "- grund: ein kurzer Satz, konkret (z. B. „28 g Protein, Fett knapp – Käse weglassen“).",
        "- Ist die Karte nicht lesbar, lesbar=false und keine Gerichte erfinden."
      ].join("\n");
      open('<div class="sp-t">Speisekarte</div>' + budHTML(b) + '<div class="sp-x">Claude liest die Karte …</div>');
      return window.tlLabel.vision({ prompt: prompt, image: img, tool: TOOL_KARTE, maxTokens: 2500, busy: "Speisekarte wird gelesen …" })
        .then(function (x) { showKarte(b, x); });
    });
  });
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
        (over.length ? ' · <span style="color:#A33A2A">über Budget: ' + over.map(function (k) { return { kcal: "kcal", kh: "KH", f: "Fett", p: "Protein" }[k]; }).join(", ") + "</span>" : "") + "</div>" +
      '<div class="sp-gr">' + esc(g.grund) + "</div>" +
      '<div class="sp-gb"><button class="sp-b sm prim" onclick="tlSpeise.nimm(' + i + ')">Eintragen</button>' +
      '<button class="sp-b sm" onclick="tlSpeise.anpassen(' + i + ')">Werte anpassen</button></div></div>';
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

function showGericht(x, txt) {
  if (!ov) return;
  if (!x || x.kcal == null) {
    set('<div class="sp-t">Gericht schätzen</div><div class="sp-x">Keine Schätzung erhalten.</div>' +
      '<button class="sp-b prim" onclick="tlSpeise.gericht()">Nochmal</button><button class="sp-b" onclick="tlSpeise.close()">Schließen</button>');
    return;
  }
  var g = { n: String(x.name || txt || "Gericht").slice(0, 60), kcal: num(x.kcal) || 0, kh: num(x.kh) || 0, f: num(x.f) || 0, p: num(x.p) || 0 };
  lastG = [g];
  var b = budget(), over = b ? ["kcal", "kh", "f"].filter(function (k) { return g[k] > b.frei[k]; }) : [];
  set('<div class="sp-t">' + esc(g.n) + "</div>" +
    (x.sicher === false ? '<div class="sp-warn">Unsichere Schätzung – Beschreibung war knapp.</div>' : "") +
    '<div class="sp-bud"><div>' + n0(g.kcal) + "<span>KCAL</span></div><div>" + n0(g.kh) + "<span>G KH</span></div><div>" + n0(g.f) + "<span>G FETT</span></div><div>" + n0(g.p) + "<span>G PROT.</span></div></div>" +
    '<div class="sp-x">Spanne ' + n0(x.kcal_min) + "–" + n0(x.kcal_max) + " kcal" + (x.annahmen ? " · " + esc(x.annahmen) : "") +
      (over.length ? '<br><span style="color:#A33A2A">Über dem freien Budget: ' + over.map(function (k) { return { kcal: "kcal", kh: "KH", f: "Fett", p: "Protein" }[k]; }).join(", ") + "</span>" : "") + "</div>" +
    '<button class="sp-b prim" onclick="tlSpeise.nimm(0)">Eintragen</button>' +
    '<button class="sp-b" onclick="tlSpeise.anpassen(0)">Werte anpassen</button>' +
    '<button class="sp-b" onclick="tlSpeise.gericht()">Neu beschreiben</button>' +
    '<button class="sp-b" onclick="tlSpeise.close()">Abbrechen</button>');
}

window.tlSpeise = {
  karte: karte, gericht: gericht, schaetzen: schaetzen, close: close,
  nimm: function (i) { if (lastG[i]) eintragen(lastG[i]); },
  anpassen: function (i) { if (lastG[i]) anpassen(lastG[i]); }
};
})();
