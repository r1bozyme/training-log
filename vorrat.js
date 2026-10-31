/* ═══════════════════════════════════════════════════
   vorrat.js – Vorrat & Einkauf (31.10.2026, Review)

   Zwei Ansichten im Bereich Ernährung:
     Vorrat   Bestand je Produkt in Packungen, „reicht noch X Tage“,
              +1 Packung nach dem Einkauf, Korrektur per Tipp (✎).
              Inventur: Produkte ohne Bestand stehen oben mit Eingabefeld.
     Einkauf  Aldi-Liste für den nächsten Samstag (alles, was bis zum
              Samstag danach plus 1 Tag fehlt) und Online-Bestellungen
              (Hafermilch, Whey, Norsan, Glycin, Creatin), sobald der
              Rest ≤ 10 Tage reicht. ✓ bucht die Menge in den Bestand.

   Rechnung in vorrat-core.js (auch im Erinnerungsdienst: ntfy Freitag-
   abend mit der Aldi-Liste, Online-Posten mit Vorlauf).
   Abzug automatisch über die erfassten Tracker-Posten (tl-f).

   Storage-Key tl-v (geprüft: keine Kollision mit anderen tl- oder fc-Keys), im Backup.
   ═══════════════════════════════════════════════════ */
(function () {
"use strict";

var KEY = "tl-v";
var C = window.tlVorratCore;
if (!C) return;

function readJSON(k, fb) {
  try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? fb : v; } catch (e) { return fb; }
}
function state() {
  var s = readJSON(KEY, {});
  if (!s || typeof s !== "object") s = {};
  if (!s.items) s.items = {};
  if (!s.extra) s.extra = [];
  s.v = 1;
  return s;
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
function today() { return C.iso(new Date()); }

function prodMap() {
  var m = {};
  try { (window.foodProducts ? window.foodProducts() : []).forEach(function (p) { m[p.id] = p; }); } catch (e) {}
  return m;
}
function liste() {
  var cfg = readJSON("tl-fg", {});
  return C.rechne(state(), readJSON("tl-f", {}), cfg.basis || [], today(), Date.now());
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
function n1(x) { var r = Math.round(x * 10) / 10; return String(r).replace(".", ","); }
function wd(s) {
  var d = new Date(s + "T12:00:00");
  return ["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()] + " " + s.slice(8, 10) + "." + s.slice(5, 7) + ".";
}
function name(r, P) {
  var p = P[r.pid];
  return (r.n) || (p && p.n) || r.pid;
}
function unit(r, P) { var p = P[r.pid]; return r.unit || (p && p.unit) || ""; }
function packTxt(n, lbl) {
  var plural = { Becher:"Becher", Beutel:"Beutel", "Stück":"Stück", Packung:"Packungen", Brot:"Brote", Liter:"Liter", Dose:"Dosen", Flasche:"Flaschen" };
  return n1(n) + " " + (Math.abs(n - 1) < 0.05 ? lbl : (plural[lbl] || lbl));
}
function tageTxt(r) {
  if (r.tage === null) return "kein Verbrauch erfasst";
  if (r.tage < 1) return "leer bzw. heute aus";
  return "reicht ~" + Math.floor(r.tage) + " Tag" + (Math.floor(r.tage) === 1 ? "" : "e");
}

/* Bestand neu setzen = Rest jetzt + delta Packungen, ts auf jetzt */
function setPacks(pid, packs) {
  var s = state(), o = s.items[pid] || {};
  o.packs = Math.max(0, Math.round(packs * 100) / 100);
  o.ts = Date.now();
  delete o.hide;
  s.items[pid] = o;
  save(s);
}
function restPacks(pid) {
  var r = liste().find(function (x) { return x.pid === pid; });
  return r && r.erfasst ? r.restPacks : 0;
}

window.vrPlus = function (pid, n) {
  setPacks(pid, restPacks(pid) + (n || 1));
  rerender();
  if (window.showFlash) showFlash("+" + n1(n || 1) + " gebucht");
};
window.vrEdit = function (pid) {
  var P = prodMap(), r = liste().find(function (x) { return x.pid === pid; });
  if (!r) return;
  var s0 = state(), o0 = s0.items[pid] || {};
  tlAsk.form({
    title: name(r, P),
    text: "Bestand jetzt in " + r.lbl + " (Bruchteile mit Komma, z. B. 0,5). Ab hier zieht der Tracker wieder ab.",
    ok: "Speichern",
    fields: [
      { key: "packs", label: "Bestand", type: "num", value: r.erfasst ? Math.round(r.restPacks * 10) / 10 : "", suffix: r.lbl, step: 1, min: 0 },
      { key: "pack",  label: "Inhalt je " + r.lbl, type: "num", value: r.pack, suffix: unit(r, P) },
      { key: "lbl",   label: "Bezeichnung", type: "text", value: r.lbl }
    ]
  }).then(function (v) {
    if (!v) return;
    var s = state(), o = s.items[pid] || {};
    if (isFinite(v.pack) && v.pack > 0 && Math.abs(v.pack - r.pack) > 1e-9) o.pack = v.pack;
    if (v.lbl && String(v.lbl).trim() && v.lbl.trim() !== r.lbl) o.lbl = v.lbl.trim();
    s.items[pid] = o; save(s);
    if (isFinite(v.packs)) setPacks(pid, v.packs);
    rerender();
  });
};
window.vrHide = function (pid) {
  var s = state(), o = s.items[pid] || {};
  o.hide = true; delete o.packs; delete o.ts;
  s.items[pid] = o; save(s); rerender();
};
window.vrUnhide = function (pid) {
  var s = state(), o = s.items[pid] || {};
  delete o.hide; s.items[pid] = o; save(s); rerender();
};
window.vrInventur = function () {
  var ins = document.querySelectorAll("#vr-cont input[data-inv]"), n = 0;
  ins.forEach(function (el) {
    var v = parseFloat(String(el.value).replace(",", "."));
    if (el.value.trim() !== "" && isFinite(v) && v >= 0) { setPacks(el.dataset.inv, v); n++; }
  });
  rerender();
  if (window.showFlash) showFlash(n ? n + " Bestände erfasst ✓" : "Nichts eingetragen");
};
window.vrAdd = function (sel) {
  var pid = sel.value; if (!pid) return;
  var s = state();
  if (s.extra.indexOf(pid) < 0 && !C.DEF.some(function (d) { return d.pid === pid; })) s.extra.push(pid);
  if (s.items[pid]) delete s.items[pid].hide;
  save(s); rerender();
  setTimeout(function () { window.vrEdit(pid); }, 50);
};
window.vrBought = function (pid, n) { window.vrPlus(pid, n); };
window.vrAllBought = function () {
  var e = C.einkauf(liste(), today());
  e.aldi.forEach(function (r) { setPacks(r.pid, restPacks(r.pid) + r.kaufen); });
  rerender();
  if (window.showFlash) showFlash("Einkauf gebucht ✓");
};
window.vrArrived = function (pid) {
  var P = prodMap(), r = liste().find(function (x) { return x.pid === pid; });
  if (!r) return;
  var e = C.einkauf(liste(), today()), o = e.online.find(function (x) { return x.pid === pid; });
  tlAsk.form({
    title: name(r, P) + " angekommen",
    ok: "Buchen",
    fields: [{ key: "n", label: "Menge", type: "num", value: o ? o.bestellen : 1, suffix: r.lbl, step: 1, min: 0 }]
  }).then(function (v) {
    if (!v || !isFinite(v.n) || v.n <= 0) return;
    window.vrPlus(pid, v.n);
  });
};

/* ─── Render ─────────────────────────────────────── */
function rowHTML(r, P) {
  var meta = r.erfasst
    ? packTxt(r.restPacks, r.lbl) + " · " + tageTxt(r)
    : "noch kein Bestand";
  var warn = r.erfasst && r.tage !== null && r.tage <= (r.src === "online" ? 10 : 7);
  return '<div class="fitem">' +
    '<div class="fin"><div class="fitn">' + esc(name(r, P)) + '</div>' +
    '<div class="fitm' + (warn ? ' vr-warn' : '') + '">' + meta + '</div></div>' +
    '<button class="vr-b" onclick="vrPlus(\'' + r.pid + '\',1)">+1</button>' +
    '<button class="fx fed" onclick="vrEdit(\'' + r.pid + '\')">✎</button>' +
  '</div>';
}

function buildVorrat() {
  var box = document.getElementById("vr-cont"); if (!box) return;
  var P = prodMap(), L = liste();
  var vis = L.filter(function (r) { return !r.hide; });
  var neu = vis.filter(function (r) { return !r.erfasst && r.src !== "alt"; });
  var alt = vis.filter(function (r) { return !r.erfasst && r.src === "alt"; });
  var grp = function (src) { return vis.filter(function (r) { return r.erfasst && r.src === src; })
    .sort(function (a, b) { return (a.tage === null ? 1e9 : a.tage) - (b.tage === null ? 1e9 : b.tage); }); };
  var h = "";

  if (neu.length || alt.length) {
    h += '<div class="fsec"><div class="fsub">Inventur</div>' +
      '<div class="fhint" style="margin-top:0">Bestand in Packungen eintragen (0,5 = halbe Packung). Leer lassen = später. ' +
      'Altbestand nur eintragen, solange davon noch etwas da ist.</div>';
    function invRow(r) {
      return '<div class="fbrow"><div class="fbn">' + esc(name(r, P)) +
        '<div class="fitm">' + r.lbl + ' à ' + n1(r.pack) + ' ' + esc(unit(r, P)) + '</div></div>' +
        '<input class="fbi" inputmode="decimal" data-inv="' + r.pid + '" placeholder="–">' +
        '<span class="fbu" style="width:auto;min-width:30px">' + esc(r.lbl) + '</span>' +
        '<button class="fx" title="nicht führen" onclick="vrHide(\'' + r.pid + '\')">×</button></div>';
    }
    if (neu.length) h += '<div class="fgrp">AKTUELL</div>' + neu.map(invRow).join("");
    if (alt.length) h += '<div class="fgrp">ALTBESTAND</div>' + alt.map(invRow).join("");
    h += '<div class="frow2"><button class="fbtn2 prim" onclick="vrInventur()">Bestand übernehmen</button></div></div>';
  }

  [["aldi", "Aldi"], ["online", "Online"], ["alt", "Altbestand"]].forEach(function (g) {
    var a = grp(g[0]);
    if (!a.length) return;
    h += '<div class="fsec"><div class="fsub">' + g[1] + '</div>' + a.map(function (r) { return rowHTML(r, P); }).join("") + '</div>';
  });

  /* Produkt hinzufügen / ausgeblendete zurückholen */
  var known = {}; L.forEach(function (r) { known[r.pid] = 1; });
  var opts = Object.keys(P).filter(function (id) { return !known[id]; })
    .map(function (id) { return P[id]; }).sort(function (a, b) { return a.n.localeCompare(b.n, "de"); });
  var hidden = L.filter(function (r) { return r.hide; });
  h += '<div class="fsec"><div class="fsub">Weitere Produkte</div>' +
    '<div class="fbaddrow"><select onchange="vrAdd(this)"><option value="">+ Produkt aus dem Tracker …</option>' +
    opts.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.n) + '</option>'; }).join("") +
    '</select></div>' +
    (hidden.length ? '<div class="fhint">Ausgeblendet: ' + hidden.map(function (r) {
      return '<a href="#" onclick="vrUnhide(\'' + r.pid + '\');return false">' + esc(name(r, P)) + '</a>';
    }).join(" · ") + '</div>' : "") +
    '<div class="fhint">Abzug läuft automatisch über die erfassten Posten im Tracker (Cappuccino = 155 ml Hafermilch). ' +
    'Creatin zählt fest 5 g/Tag. Tagesbedarf = Schnitt der letzten 14 erfassten Tage, mindestens die Fixbasis.</div></div>';

  box.innerHTML = h;
}

function buildEinkauf() {
  var box = document.getElementById("ek-cont"); if (!box) return;
  var P = prodMap(), e = C.einkauf(liste(), today());
  var h = '<div class="fsec"><div class="fsub">Aldi · ' + wd(e.samstag) + (e.samstag === today() ? " (heute)" : "") + '</div>';
  if (!e.aldi.length) h += '<div class="fhint" style="margin-top:0">Nichts nötig – alles reicht bis zum Samstag danach.</div>';
  else {
    h += e.aldi.map(function (r) {
      return '<div class="fitem"><div class="fin"><div class="fitn">' + packTxt(r.kaufen, r.lbl) + ' ' + esc(name(r, P)) + '</div>' +
        '<div class="fitm">jetzt ' + (r.erfasst ? packTxt(r.restPacks, r.lbl) : "–") + ' · ' + tageTxt(r) + '</div></div>' +
        '<button class="vr-b" onclick="vrBought(\'' + r.pid + '\',' + r.kaufen + ')">✓</button></div>';
    }).join("");
    h += '<div class="frow2"><button class="fbtn2 prim" onclick="vrAllBought()">Alles eingekauft</button></div>' +
      '<div class="fhint">✓ bucht genau die vorgeschlagene Menge. Anders gekauft? Im Vorrat per ✎ korrigieren.</div>';
  }
  h += '</div>';

  h += '<div class="fsec"><div class="fsub">Online bestellen</div>';
  if (!e.online.length) h += '<div class="fhint" style="margin-top:0">Nichts fällig – alles reicht länger als 10 Tage.</div>';
  else h += e.online.map(function (r) {
    return '<div class="fitem"><div class="fin"><div class="fitn">' + esc(name(r, P)) + '</div>' +
      '<div class="fitm vr-warn">leer ~' + wd(r.leer) + ' · Vorschlag ' + packTxt(r.bestellen, r.lbl) + ' (~30 Tage)</div></div>' +
      '<button class="vr-b" onclick="vrArrived(\'' + r.pid + '\')">da</button></div>';
  }).join("");
  h += '</div>';

  if (e.offen.length) {
    h += '<div class="fsec"><div class="fsub">Ohne Bestand</div><div class="fhint" style="margin-top:0">' +
      e.offen.map(function (r) { return esc(name(r, P)); }).join(" · ") +
      ' – fehlen in der Liste, bis der Bestand im <a href="#" onclick="showView(\'vorrat\');return false">Vorrat</a> erfasst ist.</div></div>';
  }
  h += '<div class="fphint">Freitagabend kommt die Aldi-Liste per ntfy, Online-Posten mit ~10 Tagen Vorlauf.</div>';
  box.innerHTML = h;
}

function rerender() {
  var v = document.getElementById("view-vorrat"), k = document.getElementById("view-einkauf");
  if (v && v.classList.contains("active")) buildVorrat();
  if (k && k.classList.contains("active")) buildEinkauf();
}

var CSS = [
  ".vr-b { flex-shrink:0; min-width:40px; height:34px; border-radius:8px; border:1.5px solid var(--border); background:transparent;",
  "  font-family:var(--fb); font-weight:700; font-size:13px; color:var(--text); cursor:pointer; padding:0 8px; }",
  ".vr-warn { color:#B87A15 !important; font-weight:600; }"
].join("\n");

function init() {
  var app = document.getElementById("app");
  if (!app || document.getElementById("view-vorrat")) return;
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

  function mk(id, title, inner) {
    var v = document.createElement("div");
    v.id = "view-" + id; v.className = "view";
    v.innerHTML = '<div class="dhead" style="margin-top:24px"><div class="dhl">' + title + '</div><div class="dhline"></div></div>' +
      '<div id="' + inner + '"></div>';
    var fv = document.getElementById("view-food");
    if (fv && fv.parentNode === app) app.insertBefore(v, fv.nextSibling); else app.appendChild(v);
    return v;
  }
  var ek = mk("einkauf", "EINKAUF", "ek-cont");
  var vr = mk("vorrat", "VORRAT", "vr-cont");

  var origShow = window.showView;
  if (typeof origShow === "function") {
    window.showView = function (v) {
      var res = origShow.apply(this, arguments);
      vr.classList.toggle("active", v === "vorrat");
      ek.classList.toggle("active", v === "einkauf");
      if (v === "vorrat") buildVorrat();
      if (v === "einkauf") buildEinkauf();
      return res;
    };
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") rerender(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
