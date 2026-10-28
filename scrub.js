/* ═══════════════════════════════════════════════════
   scrub.js – Verlaufsgraphen per Gedrückthalten abtasten (28.10.2026)

   Gedrückt halten (~0,2 s) auf einem Graphen zeigt Datum und Wert des
   nächstgelegenen Punkts, mit senkrechter Linie und Markierung – wie in
   einer Finanz-App. Mit dem Finger seitlich wischen fährt den Verlauf ab,
   Loslassen blendet alles wieder aus.

   Kurzes Antippen oder senkrechtes Wischen scrollt ganz normal weiter:
   Erst nach der Haltezeit übernimmt der Graph die Geste.

   Jeder Graph meldet sich über ein Attribut an:
     <svg viewBox="…" data-scrub='[{x, y:[…], c:[…], v, t}, …]'>
       x, y – Koordinaten im viewBox-System (y als Liste, ein Punkt je Linie)
       c    – Farbe je Markierung (optional)
       v    – Hauptzeile (fett), z. B. "73,4 kg"
       t    – Nebenzeile, z. B. "28.10.2026 · Trend 73,0"
   scrubAttr(pts) in index.html baut das Attribut. Neue Graphen brauchen
   nur das Attribut – die Gesten hängen per Delegation am Dokument.
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  var HOLD = 200;   // ms bis der Graph die Geste übernimmt
  var SLOP = 10;    // px Bewegung vor Ablauf = Scrollen, kein Abtasten

  var st = null;    // { svg, pts, ov, line, dots, tip, idx, active, timer, x0, y0 }

  // ── Stil ──
  var css = document.createElement("style");
  css.textContent =
    "svg[data-scrub]{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;cursor:crosshair}" +
    ".scrub-ov{position:absolute;pointer-events:none;z-index:5}" +
    ".scrub-ln{position:absolute;top:0;bottom:0;width:1px;margin-left:-.5px;background:var(--muted,#999);opacity:.7}" +
    ".scrub-dt{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;border:2px solid var(--surface,#fff);box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,.08)}" +
    ".scrub-tip{position:absolute;bottom:100%;margin-bottom:6px;padding:5px 9px 6px;border-radius:8px;background:#1A1A1A;color:#fff;white-space:nowrap;line-height:1.25;box-shadow:0 2px 8px rgba(0,0,0,.18)}" +
    ".scrub-tip b{display:block;font-family:var(--fb,inherit);font-size:14px;font-weight:700}" +
    ".scrub-tip span{display:block;font-family:var(--fb,inherit);font-size:11px;opacity:.75}";
  document.head.appendChild(css);

  function lesen(svg) {
    try {
      var p = JSON.parse(svg.getAttribute("data-scrub"));
      return Array.isArray(p) && p.length ? p : null;
    } catch (e) { return null; }
  }

  // viewBox → Pixel (berücksichtigt preserveAspectRatio="none" der Sparklines)
  function geom(svg) {
    var vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
    var sx = r.width / vb.width, sy = r.height / vb.height, ox = 0, oy = 0;
    if ((svg.getAttribute("preserveAspectRatio") || "").indexOf("none") !== 0) {
      var s = Math.min(sx, sy);
      ox = (r.width - vb.width * s) / 2;
      oy = (r.height - vb.height * s) / 2;
      sx = sy = s;
    }
    return { r: r, vx: vb.x, vy: vb.y, sx: sx, sy: sy, ox: ox, oy: oy };
  }

  function start(svg, x, y) {
    ende();
    var pts = lesen(svg);
    if (!pts) return;
    st = { svg: svg, pts: pts, idx: -1, active: false, timer: null, x0: x, y0: y };
  }

  function aktivieren() {
    if (!st) return;
    st.active = true;
    var svg = st.svg, par = svg.parentNode;
    if (getComputedStyle(par).position === "static") par.style.position = "relative";

    var ov = document.createElement("div");
    ov.className = "scrub-ov";
    var line = document.createElement("div");
    line.className = "scrub-ln";
    ov.appendChild(line);
    var tip = document.createElement("div");
    tip.className = "scrub-tip";
    tip.appendChild(document.createElement("b"));
    tip.appendChild(document.createElement("span"));
    ov.appendChild(tip);
    par.appendChild(ov);

    st.ov = ov; st.line = line; st.tip = tip; st.dots = [];
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    zeigen(st.x0);
  }

  function zeigen(clientX) {
    if (!st || !st.active) return;
    var g = geom(st.svg);
    var vx = (clientX - g.r.left - g.ox) / g.sx + g.vx;

    var best = 0, bd = Infinity;
    for (var i = 0; i < st.pts.length; i++) {
      var d = Math.abs(st.pts[i].x - vx);
      if (d < bd) { bd = d; best = i; }
    }

    // Overlay deckungsgleich über das SVG legen (Elternteil kann neu gelayoutet sein)
    var par = st.svg.parentNode, pr = par.getBoundingClientRect();
    var oL = g.r.left - pr.left - par.clientLeft, oT = g.r.top - pr.top - par.clientTop;
    st.ov.style.left = oL + "px";
    st.ov.style.top = oT + "px";
    st.ov.style.width = g.r.width + "px";
    st.ov.style.height = g.r.height + "px";

    if (best === st.idx) return;
    st.idx = best;
    var p = st.pts[best];
    var px = (p.x - g.vx) * g.sx + g.ox;
    st.line.style.left = px + "px";

    var ys = Array.isArray(p.y) ? p.y : [p.y];
    var cs = p.c || [];
    while (st.dots.length < ys.length) {
      var dt = document.createElement("div");
      dt.className = "scrub-dt";
      st.ov.appendChild(dt);
      st.dots.push(dt);
    }
    st.dots.forEach(function (dt, k) {
      if (k >= ys.length || ys[k] === null || ys[k] === undefined) { dt.style.display = "none"; return; }
      dt.style.display = "";
      dt.style.left = px + "px";
      dt.style.top = ((ys[k] - g.vy) * g.sy + g.oy) + "px";
      dt.style.background = cs[k] || "var(--text,#1A1A1A)";
    });

    st.tip.firstChild.textContent = p.v || "";
    st.tip.lastChild.textContent = p.t || "";
    st.tip.lastChild.style.display = p.t ? "" : "none";

    // Tooltip über dem Punkt zentrieren, aber im Elternteil halten
    var tw = st.tip.offsetWidth, pw = par.clientWidth;
    var left = px - tw / 2;
    left = Math.max(left, -oL + 4);
    left = Math.min(left, pw - oL - tw - 4);
    st.tip.style.left = left + "px";
  }

  function ende() {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
    st = null;
  }

  function ziel(t) {
    return t && t.closest ? t.closest("svg[data-scrub]") : null;
  }

  // ── Touch: halten, dann wischen ──
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { ende(); return; }
    var svg = ziel(e.target);
    if (!svg) { ende(); return; }
    var t = e.touches[0];
    start(svg, t.clientX, t.clientY);
    if (st) st.timer = setTimeout(aktivieren, HOLD);
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!st) return;
    var t = e.touches[0];
    if (!st.active) {
      if (Math.abs(t.clientX - st.x0) > SLOP || Math.abs(t.clientY - st.y0) > SLOP) ende();
      return;
    }
    if (e.cancelable) e.preventDefault();
    zeigen(t.clientX);
  }, { passive: false });

  document.addEventListener("touchend", ende, { passive: true });
  document.addEventListener("touchcancel", ende, { passive: true });

  // Langes Drücken soll kein Kontextmenü / keine Textauswahl öffnen
  document.addEventListener("contextmenu", function (e) {
    if (ziel(e.target)) e.preventDefault();
  });

  // ── Maus (Desktop): sofort beim Drücken ──
  var maus = false;
  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
    var svg = ziel(e.target);
    if (!svg) return;
    e.preventDefault();
    maus = true;
    start(svg, e.clientX, e.clientY);
    aktivieren();
  });
  document.addEventListener("mousemove", function (e) { if (maus) zeigen(e.clientX); });
  document.addEventListener("mouseup", function () { if (maus) { maus = false; ende(); } });

  // Scrollen oder Tab-Wechsel während des Abtastens räumt auf
  window.addEventListener("scroll", function () { if (st && !st.active) ende(); }, { passive: true });
  document.addEventListener("visibilitychange", ende);
})();
