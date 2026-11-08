/* ═══════════════════════════════════════════════════
   label.js – Nährwerte vom Etikett-Foto lesen (08.11.2026)

   tlLabel.read() → Promise<{ name, ml, kcal, kh, f, p, hinweis } | null>
     1. Kamera über <input capture> (native Kamera-App, volle Auflösung)
     2. auf max. 1600 px verkleinern, JPEG
     3. Claude (Messages-API, Tool-Aufruf mit festem Schema) liest die
        Spalte „pro 100 g / 100 ml“ aus.

   Aufruf direkt aus dem Browser. Der API-Schlüssel liegt NUR auf dem
   Gerät unter localStorage "tl-ak" – nicht im Repo und bewusst nicht
   in sync.js/DATA_KEYS, geht also nicht ins Backup. Bei 401 wird er
   verworfen und neu abgefragt. Empfehlung: eigener Schlüssel mit
   niedrigem Ausgabenlimit in der Anthropic-Konsole.

   Genutzt von scan.js (Ergebnis-Panel), tracker.js (Formular
   „Eigenes Produkt“ und „Etikett“ beim aufgeklappten Produkt).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var KEY = "tl-ak";
var MODEL = "claude-sonnet-5-5";
var MAXPX = 1600;

var PROMPT = [
  "Das Foto zeigt die Nährwerttabelle eines Lebensmittels (meist deutsch).",
  "Lies die Werte für 100 g bzw. 100 ml und rufe das Werkzeug naehrwerte auf.",
  "Regeln:",
  "- kcal = Brennwert in kcal. Steht nur kJ da, rechne kJ / 4,184.",
  "- kh = Kohlenhydrate gesamt, NICHT „davon Zucker“.",
  "- f = Fett gesamt, NICHT „davon gesättigte Fettsäuren“.",
  "- p = Eiweiß.",
  "- Nimm die 100-g/100-ml-Spalte, nicht die Portionsspalte. Gibt es nur Werte je Portion und ist die Portionsgröße in g/ml angegeben, rechne auf 100 um und schreib das in hinweis.",
  "- Gibt es „unzubereitet“ und „zubereitet“, nimm unzubereitet und erwähne es in hinweis.",
  "- name: Produktname, falls auf dem Foto erkennbar, sonst leer.",
  "- Ist die Tabelle nicht sicher lesbar, setze lesbar = false und rate nicht."
].join("\n");

var TOOL = {
  name: "naehrwerte",
  description: "Nährwerte je 100 g oder 100 ml vom Etikett",
  input_schema: {
    type: "object",
    properties: {
      lesbar:  { type: "boolean", description: "Tabelle sicher gelesen" },
      name:    { type: "string" },
      basis:   { type: "string", enum: ["100g", "100ml"] },
      kcal:    { type: "number" },
      kh:      { type: "number" },
      f:       { type: "number" },
      p:       { type: "number" },
      hinweis: { type: "string", description: "kurze Anmerkung, z. B. umgerechnet aus Portion" }
    },
    required: ["lesbar", "basis", "kcal", "kh", "f", "p"]
  }
};

function flash(t) { if (window.showFlash) window.showFlash(t); }

/* ─── Laufanzeige ─────────────────────────────────── */
function busy(on, txt) {
  var el = document.getElementById("lbl-busy");
  if (!on) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "lbl-busy";
    el.style.cssText = "position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);" +
      "z-index:9500;background:#1A1A1A;color:#fff;padding:12px 18px;border-radius:24px;font-size:14px;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.25);font-family:var(--fb, sans-serif)";
    document.body.appendChild(el);
  }
  el.textContent = txt;
}

/* ─── Schlüssel ───────────────────────────────────── */
function getKey() {
  var k = localStorage.getItem(KEY);
  if (k) return Promise.resolve(k);
  return tlAsk.form({
    title: "Etikett lesen",
    text: "Einmalig: Anthropic-API-Schlüssel (console.anthropic.com › API Keys). Er bleibt nur auf diesem Handy und geht nicht ins Backup.\nKosten: rund 1 Cent pro Foto.",
    ok: "Speichern",
    fields: [{ key: "k", label: "API-Schlüssel", type: "password", placeholder: "sk-ant-…" }]
  }).then(function (r) {
    var k = r && String(r.k || "").trim();
    if (!k) return null;
    if (k.indexOf("sk-ant-") !== 0) { flash("Das sieht nicht nach einem Anthropic-Schlüssel aus"); return null; }
    localStorage.setItem(KEY, k);
    return k;
  });
}

/* ─── Foto ────────────────────────────────────────── */
function pickPhoto() {
  return new Promise(function (res) {
    var i = document.createElement("input");
    i.type = "file"; i.accept = "image/*"; i.setAttribute("capture", "environment");
    i.style.display = "none";
    var done = false;
    var fin = function (f) { if (done) return; done = true; i.remove(); res(f || null); };
    i.addEventListener("change", function () { fin(i.files && i.files[0]); });
    i.addEventListener("cancel", function () { fin(null); });
    document.body.appendChild(i);
    i.click();
  });
}

function shrink(file) {
  return createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bmp) {
    var s = Math.min(1, MAXPX / Math.max(bmp.width, bmp.height));
    var c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  });
}

/* ─── API ─────────────────────────────────────────── */
function ask(key, b64) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "naehrwerte" },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: PROMPT }
      ] }]
    })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; });
  });
}

function parse(d) {
  var t = (d && d.content || []).filter(function (c) { return c.type === "tool_use"; })[0];
  if (!t || !t.input) return null;
  var x = t.input, r1 = function (v) { v = Number(v); return isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null; };
  return {
    lesbar: x.lesbar !== false,
    name: String(x.name || "").trim(),
    ml: x.basis === "100ml",
    kcal: r1(x.kcal), kh: r1(x.kh), f: r1(x.f), p: r1(x.p),
    hinweis: String(x.hinweis || "").trim()
  };
}

function read() {
  var key0;
  return getKey().then(function (k) {
    if (!k) return null;
    key0 = k;
    return pickPhoto();
  }).then(function (file) {
    if (!file) return null;
    busy(true, "Etikett wird gelesen …");
    return shrink(file).then(function (b64) { return ask(key0, b64); }).then(function (res) {
      busy(false);
      if (res.status === 401) { localStorage.removeItem(KEY); flash("Schlüssel ungültig – beim nächsten Mal neu eingeben"); return null; }
      if (res.status === 429 || res.status === 529) { flash("Claude ist gerade ausgelastet – gleich nochmal"); return null; }
      if (res.status !== 200) {
        var m = res.d && res.d.error && res.d.error.message;
        flash("Fehler " + res.status + (m ? ": " + m.slice(0, 80) : "")); return null;
      }
      var r = parse(res.d);
      if (!r) { flash("Keine Werte erkannt"); return null; }
      if (!r.lesbar || r.kcal === null) { flash("Tabelle nicht lesbar – bitte gerader und näher fotografieren"); return null; }
      if (r.hinweis) flash(r.hinweis);
      return r;
    });
  }).catch(function (e) {
    busy(false);
    flash("Etikett lesen fehlgeschlagen" + (e && e.message ? ": " + e.message.slice(0, 60) : ""));
    return null;
  });
}

window.tlLabel = { read: read, parse: parse, hasKey: function () { return !!localStorage.getItem(KEY); },
                   forgetKey: function () { localStorage.removeItem(KEY); } };
})();
