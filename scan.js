/* ═══════════════════════════════════════════════════
   scan.js – Barcode-Scanner (08.11.2026)

   Zwei Modi, beide über window.tlScan.open(modus):
     "food"    Ernährung › Heute › Produkte (Knopf ▦ neben der Suche).
               EAN bekannt → Produkt aufklappen, Menge eintragen.
               EAN unbekannt → Open Food Facts abfragen und
                 · als neues Produkt anlegen (Werte vorbelegt, chk:1
                   = geschätzt, bis am Etikett bestätigt) oder
                 · mit einem vorhandenen Produkt verknüpfen
                   (z. B. eingebaute Aldi-Produkte).
     "vorrat"  Ernährung › Vorrat (Knopf „Einkauf scannen“).
               Dauerbetrieb: jede erkannte Packung bucht +1, mit
               Rückgängig für die letzte Buchung. Dieselbe Packung
               zählt erst wieder, nachdem der Code 1 s aus dem Bild war.

   Erkennung über die eingebaute BarcodeDetector-API (Chrome Android),
   ohne Bibliothek. Fehlt sie, bleibt die Eingabe per Hand.
   Die Zuordnung EAN → Produkt liegt in tl-fg unter "ean" (im Backup).
   Etikett-Foto: label.js (Claude liest die Nährwerttabelle).
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
var ov = null, stream = null, det = null, timer = null, mode = "food";
var busy = false, last = { code: "", seen: 0, booked: 0 }, log = [];

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
function n1(x) { return String(Math.round(x * 10) / 10).replace(".", ","); }
function flash(t) { if (window.showFlash) window.showFlash(t); }

/* ─── Overlay ─────────────────────────────────────── */
function css() {
  if (document.getElementById("scan-css")) return;
  var s = document.createElement("style");
  s.id = "scan-css";
  s.textContent = [
    "#scan-ov { position:fixed; inset:0; z-index:9000; background:#0E0F12; color:#fff; font-family:var(--fb, sans-serif); display:flex; flex-direction:column; padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom); }",
    "#scan-ov .sc-vid { position:relative; flex:1; overflow:hidden; background:#000; }",
    "#scan-ov video { width:100%; height:100%; object-fit:cover; }",
    "#scan-ov .sc-frame { position:absolute; left:12%; right:12%; top:38%; height:24%; border:2px solid rgba(255,255,255,.85); border-radius:14px; box-shadow:0 0 0 9999px rgba(0,0,0,.35); }",
    "#scan-ov .sc-frame.hit { border-color:#5BD08A; }",
    "#scan-ov .sc-top { position:absolute; top:12px; left:12px; right:12px; display:flex; justify-content:space-between; gap:8px; }",
    "#scan-ov .sc-pill { background:rgba(0,0,0,.55); color:#fff; border:0; border-radius:20px; padding:9px 14px; font-size:14px; }",
    "#scan-ov .sc-panel { background:#1A1C21; padding:16px 16px 18px; border-radius:18px 18px 0 0; max-height:62vh; overflow:auto; }",
    "#scan-ov .sc-st { font-size:15px; line-height:1.4; }",
    "#scan-ov .sc-dim { color:#9AA0AA; font-size:13px; margin-top:4px; }",
    "#scan-ov .sc-name { font-size:17px; font-weight:600; margin-bottom:6px; }",
    "#scan-ov .sc-mac { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:10px 0 4px; text-align:center; }",
    "#scan-ov .sc-mac div { background:#262931; border-radius:10px; padding:8px 2px; font-size:15px; font-weight:600; }",
    "#scan-ov .sc-mac span { display:block; font-size:11px; font-weight:400; color:#9AA0AA; }",
    "#scan-ov .sc-btn { display:block; width:100%; margin-top:10px; padding:13px; border-radius:12px; border:0; font-size:15px; background:#2C3039; color:#fff; }",
    "#scan-ov .sc-btn.prim { background:#0077AA; }",
    "#scan-ov select, #scan-ov input { width:100%; margin-top:10px; padding:12px; border-radius:12px; border:1px solid #3A3E48; background:#262931; color:#fff; font-size:15px; box-sizing:border-box; }",
    "#scan-ov .sc-log { margin-top:10px; font-size:14px; }",
    "#scan-ov .sc-log div { padding:6px 0; border-top:1px solid #2C3039; display:flex; justify-content:space-between; gap:8px; }",
    "#scan-ov .sc-row { display:flex; gap:8px; } #scan-ov .sc-row .sc-btn { flex:1; }"
  ].join("\n");
  document.head.appendChild(s);
}

function panel(html) { var p = ov && ov.querySelector(".sc-panel"); if (p) p.innerHTML = html; }
function frameHit(on) { var f = ov && ov.querySelector(".sc-frame"); if (f) f.classList.toggle("hit", !!on); }

function open(m) {
  mode = m === "vorrat" ? "vorrat" : "food";
  log = []; busy = false; last = { code: "", seen: 0, booked: 0 };
  css();
  close(true);
  ov = document.createElement("div");
  ov.id = "scan-ov";
  ov.innerHTML =
    '<div class="sc-vid"><video playsinline muted></video><div class="sc-frame"></div>' +
      '<div class="sc-top"><button class="sc-pill" data-a="close">✕ Schließen</button>' +
      '<button class="sc-pill" data-a="torch" style="display:none">🔦 Licht</button></div></div>' +
    '<div class="sc-panel"></div>';
  ov.addEventListener("click", onClick);
  document.body.appendChild(ov);
  idle();
  start();
}

function idle(msg) {
  var hint = mode === "vorrat"
    ? "Packungen nacheinander vor die Kamera halten – jede bucht +1 im Vorrat."
    : "Barcode in den Rahmen halten – oder direkt das Etikett fotografieren.";
  panel('<div class="sc-st">' + (msg || hint) + '</div>' + logHTML() +
    (mode === "food" && window.tlLabel ? '<button class="sc-btn prim" data-a="labelonly">📷 Etikett fotografieren</button>' : "") +
    '<div class="sc-row"><button class="sc-btn" data-a="manual">EAN eintippen</button>' +
    (mode === "vorrat" && log.length ? '<button class="sc-btn" data-a="undo">Letzte zurück</button>' : "") + '</div>' +
    (mode === "vorrat" && log.length ? '<button class="sc-btn prim" data-a="close">Fertig</button>' : ""));
}
function logHTML() {
  if (mode !== "vorrat" || !log.length) return "";
  var agg = {}, order = [];
  log.forEach(function (x) { if (!agg[x.pid]) { agg[x.pid] = { n: x.n, k: 0 }; order.push(x.pid); } agg[x.pid].k++; });
  return '<div class="sc-log">' + order.map(function (pid) {
    return "<div><span>" + esc(agg[pid].n) + "</span><span>+" + agg[pid].k + "</span></div>";
  }).join("") + "</div>";
}

function close(silent) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  if (ov) { ov.remove(); ov = null; }
  if (!silent && mode === "vorrat" && log.length) flash(log.length + " Packung" + (log.length === 1 ? "" : "en") + " gebucht ✓");
}

/* ─── Kamera + Erkennung ──────────────────────────── */
function start() {
  if (!("BarcodeDetector" in window)) {
    idle("Dieser Browser kann keine Barcodes erkennen – EAN bitte eintippen.");
    return;
  }
  var p = BarcodeDetector.getSupportedFormats ? BarcodeDetector.getSupportedFormats() : Promise.resolve(FORMATS);
  p.then(function (sup) {
    var f = FORMATS.filter(function (x) { return sup.indexOf(x) !== -1; });
    det = new BarcodeDetector({ formats: f.length ? f : FORMATS });
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
    });
  }).then(function (s) {
    if (!ov) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
    stream = s;
    var v = ov.querySelector("video");
    v.srcObject = s;
    v.play();
    var tr = s.getVideoTracks()[0];
    var caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
    if (caps.torch) ov.querySelector('[data-a="torch"]').style.display = "";
    loop();
  }).catch(function (e) {
    idle(e && e.name === "NotAllowedError"
      ? "Kein Kamerazugriff – in den Website-Einstellungen erlauben oder EAN eintippen."
      : "Kamera nicht verfügbar – EAN eintippen.");
  });
}

function loop() {
  if (!ov || !stream) return;
  var v = ov.querySelector("video");
  if (busy || v.readyState < 2) { timer = setTimeout(loop, 200); return; }
  det.detect(v).then(function (codes) {
    var c = codes && codes[0] && String(codes[0].rawValue || "").replace(/\D/g, "");
    var now = Date.now();
    if (c && c.length >= 8) {
      /* Dauerbetrieb: gleiche Packung erst wieder, wenn der Code ≥ 1 s weg war */
      var neu = c !== last.code || now - last.seen > 1000;
      last.code = c; last.seen = now;
      if (neu) hit(c);
    }
  }).catch(function () {}).then(function () { timer = setTimeout(loop, 180); });
}

function hit(code) {
  if (navigator.vibrate) navigator.vibrate(40);
  frameHit(true); setTimeout(function () { frameHit(false); }, 400);
  if (mode === "vorrat") vorratHit(code); else foodHit(code);
}

/* ─── Modus Vorrat ────────────────────────────────── */
function vorratHit(code) {
  var pid = window.foodEanLookup ? window.foodEanLookup(code) : null;
  if (!pid) { idle("EAN " + esc(code) + " ist noch keinem Produkt zugeordnet – einmal unter Heute › Produkte scannen und verknüpfen."); return; }
  var n = window.vrScanPlus ? window.vrScanPlus(pid) : null;
  if (!n) { idle("Vorrat nicht bereit."); return; }
  log.push({ pid: pid, n: n });
  idle("<strong>+1 " + esc(n) + "</strong>");
}

/* ─── Modus Ernährung ─────────────────────────────── */
function foodHit(code) {
  busy = true;
  var pid = window.foodEanLookup ? window.foodEanLookup(code) : null;
  if (pid) { close(true); window.foodScanShow(pid); return; }
  panel('<div class="sc-st">EAN ' + esc(code) + '</div><div class="sc-dim">Suche in Open Food Facts …</div>');
  offLookup(code).then(function (r) { showResult(code, r); });
}

function offLookup(code) {
  var url = "https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(code) +
    ".json?fields=product_name,product_name_de,generic_name_de,brands,quantity,nutriments";
  var ctl = window.AbortController ? new AbortController() : null;
  var to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
  return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.json(); })
    .then(function (d) { clearTimeout(to); return parseOff(d); })
    .catch(function () { clearTimeout(to); return { err: true }; });
}

function num(x) { var v = Number(x); return isFinite(v) && x !== "" && x != null ? v : null; }
function parseOff(d) {
  if (!d || d.status !== 1 || !d.product) return { none: true };
  var P = d.product, N = P.nutriments || {};
  var kcal = num(N["energy-kcal_100g"]);
  if (kcal === null) { var kj = num(N["energy-kj_100g"]); if (kj === null) kj = num(N["energy_100g"]); if (kj !== null) kcal = kj / 4.184; }
  var r = {
    name: String(P.product_name_de || P.product_name || P.generic_name_de || "").trim(),
    marke: String(P.brands || "").split(",")[0].trim(),
    ml: /\d\s*(ml|cl|l)\b/i.test(String(P.quantity || "")),
    kcal: kcal, kh: num(N.carbohydrates_100g), f: num(N.fat_100g), p: num(N.proteins_100g)
  };
  if (r.marke && r.name.toLowerCase().indexOf(r.marke.toLowerCase()) === -1) r.name += " " + r.marke;
  ["kcal", "kh", "f", "p"].forEach(function (k) { if (r[k] !== null) r[k] = Math.round(r[k] * 10) / 10; });
  r.voll = r.kcal !== null && r.kh !== null && r.f !== null && r.p !== null;
  return r;
}

var cur = null;   // { code, r }
function showResult(code, r) {
  if (!ov) return;
  cur = { code: code, r: r };
  var h = "";
  if (r.err) h = '<div class="sc-st">Open Food Facts nicht erreichbar.</div><div class="sc-dim">EAN ' + esc(code) + "</div>";
  else if (r.none) h = '<div class="sc-st">Nicht in Open Food Facts.</div><div class="sc-dim">EAN ' + esc(code) + " – Werte vom Etikett eintragen.</div>";
  else {
    var m = function (k, l) { return "<div>" + (r[k] === null ? "–" : n1(r[k])) + "<span>" + l + "</span></div>"; };
    h = '<div class="sc-name">' + esc(r.name || "Ohne Namen") + "</div>" +
      '<div class="sc-dim">je 100 ' + (r.ml ? "ml" : "g") + " · Open Food Facts" + (r.voll ? "" : " · unvollständig") + "</div>" +
      '<div class="sc-mac">' + m("kcal", "kcal") + m("kh", "KH g") + m("f", "Fett g") + m("p", "Prot. g") + "</div>" +
      '<div class="sc-dim">Wird als geschätzt (?) gespeichert, bis du die Werte am Etikett bestätigst.</div>';
  }
  var found = !r.err && !r.none, lbl = !!window.tlLabel;
  h += (lbl && !found ? '<button class="sc-btn prim" data-a="label">📷 Etikett fotografieren</button>' : "") +
    '<button class="sc-btn' + (found || !lbl ? " prim" : "") + '" data-a="new">' + (found ? "Als neues Produkt anlegen" : "Werte selbst eintragen") + '</button>' +
    (lbl && found ? '<button class="sc-btn" data-a="label">📷 Lieber vom Etikett lesen</button>' : "") +
    '<button class="sc-btn" data-a="link">Mit vorhandenem Produkt verknüpfen</button>' +
    '<button class="sc-btn" data-a="again">Nochmal scannen</button>';
  panel(h);
}

function linkPicker() {
  var a = (window.foodProducts ? window.foodProducts() : []).slice()
    .sort(function (x, y) { return x.n.localeCompare(y.n, "de"); });
  panel('<div class="sc-st">Welches Produkt ist EAN ' + esc(cur.code) + "?</div>" +
    '<select id="sc-sel"><option value="">Produkt wählen …</option>' +
    a.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.n) + "</option>"; }).join("") + "</select>" +
    '<button class="sc-btn prim" data-a="linkok">Verknüpfen</button>' +
    '<button class="sc-btn" data-a="back">Zurück</button>');
}

function manual() {
  panel('<div class="sc-st">EAN eintippen</div>' +
    '<input id="sc-ean" inputmode="numeric" pattern="[0-9]*" placeholder="z. B. 4061458…">' +
    '<button class="sc-btn prim" data-a="manok">Suchen</button>' +
    '<button class="sc-btn" data-a="again">Zurück</button>');
  var i = document.getElementById("sc-ean"); if (i) i.focus();
}

function onClick(e) {
  var b = e.target.closest("[data-a]"); if (!b) return;
  var a = b.getAttribute("data-a");
  if (a === "close") close();
  else if (a === "torch") {
    var tr = stream && stream.getVideoTracks()[0]; if (!tr) return;
    var on = !b.classList.contains("on"); b.classList.toggle("on", on);
    tr.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {});
  }
  else if (a === "again" || a === "back" && !cur) { busy = false; cur = null; last.code = ""; idle(); }
  else if (a === "back") showResult(cur.code, cur.r);
  else if (a === "manual") { busy = true; manual(); }
  else if (a === "manok") {
    var v = (document.getElementById("sc-ean").value || "").replace(/\D/g, "");
    if (v.length < 8) { flash("EAN zu kurz"); return; }
    busy = false; hit(v);
  }
  else if (a === "undo") {
    var x = log.pop(); if (!x) return;
    if (window.vrScanPlus) window.vrScanPlus(x.pid, -1);
    idle("Zurückgenommen: " + esc(x.n));
  }
  else if (a === "new") {
    var r = cur.r, code = cur.code; close(true);
    window.foodNewPrefill({
      ean: code, name: r.name || "", ml: !!r.ml,
      kcal: r.kcal, kh: r.kh, f: r.f, p: r.p, off: !r.none && !r.err
    });
  }
  else if (a === "label") {
    /* Foto statt Open Food Facts: Werte gelten als vom Etikett (kein chk).
       Foto abgebrochen → Formular trotzdem öffnen, EAN geht nicht verloren. */
    var r0 = cur.r, c0 = cur.code; close(true);
    var base = { ean: c0, name: r0.name || "", ml: !!r0.ml, kcal: r0.kcal, kh: r0.kh, f: r0.f, p: r0.p, off: !r0.none && !r0.err };
    window.tlLabel.read().then(function (x) {
      if (x) window.foodNewPrefill({ ean: c0, name: x.name || base.name, ml: x.ml, kcal: x.kcal, kh: x.kh, f: x.f, p: x.p, off: false });
      else window.foodNewPrefill(base);
    });
  }
  else if (a === "labelonly") {
    /* 08.11.: Etikett direkt, ohne Barcode (lose Ware, Code unleserlich) */
    close(true);
    window.tlLabel.read().then(function (x) {
      if (x) window.foodNewPrefill({ ean: null, name: x.name, ml: x.ml, kcal: x.kcal, kh: x.kh, f: x.f, p: x.p, off: false });
    });
  }
  else if (a === "link") linkPicker();
  else if (a === "linkok") {
    var pid = document.getElementById("sc-sel").value;
    if (!pid) { flash("Bitte ein Produkt wählen"); return; }
    var code2 = cur.code; close(true);
    window.foodEanLink(code2, pid);
    window.foodScanShow(pid);
  }
}

document.addEventListener("visibilitychange", function () { if (document.hidden && ov) close(true); });

/* ─── Schwebender Scan-Knopf (08.11.) ─────────────────
   Ernährung › Heute: über „Tag ▴“, öffnet den Scanner (Modus food).
   Ernährung › Vorrat: an der Stelle von „Tag ▴“, startet „Einkauf scannen“.
   Versteckt, solange das Tag-Menü offen ist. Die Ansichten werden über
   die Klasse .active erkannt (MutationObserver), ohne showView zu umschließen. */
var fab = null;
function fabCss() {
  if (document.getElementById("scanfab-css")) return;
  var s = document.createElement("style"); s.id = "scanfab-css";
  s.textContent =
    ".scanfab { position:fixed; right:max(16px, calc(50% - 224px)); z-index:102; width:52px; height:52px; border:none; border-radius:50%;" +
    " background:var(--neutral); color:#FFF; font-size:24px; line-height:52px; text-align:center; padding:0;" +
    " box-shadow:0 4px 14px rgba(0,0,0,.18); cursor:pointer; }" +
    ".scanfab[hidden] { display:none; }" +
    ".scanfab.hi { bottom:calc(136px + var(--sb)); } .scanfab.lo { bottom:calc(76px + var(--sb)); }" +
    "body.scanfab-on #view-food.ffab-on { padding-bottom:136px; } body.scanfab-on #view-vorrat { padding-bottom:76px; }";
  document.head.appendChild(s);
}
function isOn(id) { var v = document.getElementById(id); return !!(v && v.classList.contains("active")); }
function fabSync() {
  if (!fab) return;
  var food = isOn("view-food"), vr = isOn("view-vorrat");
  var tag = food && document.querySelector("#f-act .ffab");   // „Tag ▴“ gibt es erst mit Posten
  var menu = !!(tag && tag.classList.contains("open"));
  var show = (food || vr) && !menu;
  fab.hidden = !show;
  fab.className = "scanfab " + (tag ? "hi" : "lo");
  fab.setAttribute("data-m", vr ? "vorrat" : "food");
  fab.setAttribute("aria-label", vr ? "Einkauf scannen" : "Barcode scannen");
  document.body.classList.toggle("scanfab-on", show);
}
function fabInit() {
  var app = document.getElementById("app");
  if (!app || fab) return;
  fabCss();
  fab = document.createElement("button");
  fab.type = "button"; fab.textContent = "▦"; fab.hidden = true;
  fab.onclick = function () { open(fab.getAttribute("data-m")); };
  document.body.appendChild(fab);
  var t = 0;
  new MutationObserver(function () {
    if (t) return;
    t = requestAnimationFrame(function () { t = 0; fabSync(); });
  }).observe(app, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  fabSync();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fabInit); else fabInit();

window.tlScan = { open: open, close: close, parseOff: parseOff };
})();
