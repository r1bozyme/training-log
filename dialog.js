/* ═══════════════════════════════════════════════════
   dialog.js – eigene Dialoge statt confirm()/prompt()/alert() (02.10.2026)

   Bottom-Sheet im App-Stil. Alles liefert Promises – die Aufrufer in
   tracker.js und sync.js sind darauf umgestellt (native Dialoge
   blockieren, diese nicht).

     tlAsk.confirm({ title, text, ok, danger })        → true | false
     tlAsk.alert({ title, text })                      → undefined
     tlAsk.form({ title, text, fields, ok })           → { key: wert } | null
         field: { key, label, value, type: "num"|"text"|"password",
                  suffix, placeholder, step (zeigt − / +), min }
         "num" akzeptiert Komma, liefert Number (leer/ungueltig → NaN)
     tlAsk.typed({ title, text, word, ok })            → true | false
         Bestaetigen erst aktiv, wenn `word` eingetippt ist

   Android-Zurueck schliesst den Dialog (= Abbrechen). Das Sheet
   rutscht ueber die Bildschirmtastatur (visualViewport).
   CSS-Praefix .ask- (vorher auf Kollisionen geprueft).
   ═══════════════════════════════════════════════════ */

(function () {

var CSS = `
.ask-ov { position: fixed; inset: 0; z-index: 400; background: rgba(26,26,26,.38);
  opacity: 0; transition: opacity .18s; -webkit-tap-highlight-color: transparent; }
.ask-ov.in { opacity: 1; }
.ask-sh { position: fixed; left: 50%; bottom: 0; z-index: 401; width: 100%; max-width: 480px;
  transform: translate(-50%, 100%); transition: transform .22s cubic-bezier(.2,.8,.2,1);
  background: var(--surface); border-radius: 20px 20px 0 0; box-shadow: 0 -6px 30px rgba(0,0,0,.12);
  padding: 10px 20px calc(18px + env(safe-area-inset-bottom)); max-height: 88vh; overflow-y: auto; }
.ask-sh.in { transform: translate(-50%, 0); }
.ask-grip { width: 36px; height: 4px; border-radius: 2px; background: var(--border); margin: 0 auto 14px; }
.ask-t { font-family: var(--fd); font-size: 24px; letter-spacing: 1.5px; line-height: 1.1; color: var(--text); }
.ask-x { font-size: 14px; color: var(--muted); line-height: 1.5; margin-top: 8px; white-space: pre-line; }
.ask-x b { color: var(--text); }
.ask-fs { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.ask-f label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1.5px;
  text-transform: uppercase; margin-bottom: 6px; }
.ask-row { display: flex; align-items: center; gap: 8px; }
.ask-in { flex: 1; min-width: 0; padding: 13px 14px; border-radius: 10px; border: 2px solid var(--border);
  background: var(--bg); font-family: var(--fb); font-size: 17px; font-weight: 600; color: var(--text); outline: none; }
.ask-in:focus { border-color: var(--text); background: var(--surface); }
.ask-in.bad { border-color: var(--legs); }
.ask-su { font-size: 13px; font-weight: 600; color: var(--muted); flex-shrink: 0; min-width: 28px; }
.ask-st { width: 46px; height: 46px; flex-shrink: 0; border-radius: 10px; border: 2px solid var(--border);
  background: var(--surface); font-size: 22px; font-weight: 600; color: var(--text); cursor: pointer; line-height: 1; }
.ask-st:active { background: var(--bg); }
.ask-bs { display: flex; gap: 10px; margin-top: 20px; }
.ask-b { flex: 1; padding: 15px 0; border-radius: 12px; border: 2px solid var(--border); background: var(--surface);
  font-family: var(--fb); font-weight: 700; font-size: 15px; color: var(--muted); cursor: pointer; }
.ask-b.ok { background: var(--neutral); border-color: var(--neutral); color: #FFF; }
.ask-b.ok.danger { background: var(--legs); border-color: var(--legs); }
.ask-b:disabled { opacity: .35; cursor: default; }
`;

var open = null;          // { close(fn) } des offenen Dialogs
var vvBound = false;

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
  return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

function num(v) {
  var s = String(v == null ? "" : v).trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
}
function fmt(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }

function ensureCSS() {
  if (document.getElementById("ask-css")) return;
  var st = document.createElement("style"); st.id = "ask-css"; st.textContent = CSS;
  document.head.appendChild(st);
}

/* Tastatur: Chrome verkleinert nur den sichtbaren Bereich, fixierte
   Elemente bleiben unten dahinter – deshalb das Sheet anheben. */
function liftForKeyboard() {
  var sh = document.querySelector(".ask-sh");
  var vv = window.visualViewport;
  if (!sh || !vv) return;
  var hidden = window.innerHeight - vv.height - vv.offsetTop;
  sh.style.bottom = Math.max(0, hidden) + "px";
}

/* Grundgeruest: baut Overlay + Sheet, liefert Promise. build(sheet, done)
   befuellt das Sheet; done(wert) schliesst mit Ergebnis. */
function sheet(build, cancelValue) {
  ensureCSS();
  if (open) open.close(true);          // nie zwei uebereinander
  return new Promise(function (resolve) {
    var ov = document.createElement("div"); ov.className = "ask-ov";
    var sh = document.createElement("div"); sh.className = "ask-sh";
    sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true");
    document.body.appendChild(ov); document.body.appendChild(sh);

    var finished = false, viaBack = false;
    function done(val) {
      if (finished) return;
      finished = true; open = null;
      window.removeEventListener("popstate", onPop);
      ov.classList.remove("in"); sh.classList.remove("in");
      setTimeout(function () { ov.remove(); sh.remove(); }, 230);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      /* Eigenen Verlaufseintrag wieder entfernen – und erst danach
         aufloesen. Sonst traefe das verspaetete popstate einen direkt
         folgenden Dialog (z. B. die zweite Rueckfrage beim Wiederherstellen). */
      if (!viaBack && history.state && history.state.tlAsk) {
        var t = null;
        var after = function () {
          window.removeEventListener("popstate", after); clearTimeout(t); resolve(val);
        };
        window.addEventListener("popstate", after);
        t = setTimeout(after, 400);
        history.back();
      } else resolve(val);
    }
    function onPop() { viaBack = true; done(cancelValue); }

    history.pushState({ tlAsk: 1 }, "");
    window.addEventListener("popstate", onPop);
    ov.onclick = function () { done(cancelValue); };
    open = { close: function () { done(cancelValue); } };

    build(sh, done);
    requestAnimationFrame(function () { ov.classList.add("in"); sh.classList.add("in"); liftForKeyboard(); });
    if (!vvBound && window.visualViewport) {
      vvBound = true;
      window.visualViewport.addEventListener("resize", liftForKeyboard);
      window.visualViewport.addEventListener("scroll", liftForKeyboard);
    }
  });
}

function head(o) {
  return '<div class="ask-grip"></div>' +
         (o.title ? '<div class="ask-t">' + esc(o.title) + "</div>" : "") +
         (o.text ? '<div class="ask-x">' + (o.html ? o.text : esc(o.text)) + "</div>" : "");
}
function buttons(okLabel, danger, cancelLabel) {
  return '<div class="ask-bs">' +
    (cancelLabel === false ? "" : '<button class="ask-b" data-a="cancel">' + esc(cancelLabel || "Abbrechen") + "</button>") +
    '<button class="ask-b ok' + (danger ? " danger" : "") + '" data-a="ok">' + esc(okLabel || "OK") + "</button></div>";
}

/* ─── Bausteine ─────────────────────────────────────────── */
function confirmD(o) {
  return sheet(function (sh, done) {
    sh.innerHTML = head(o) + buttons(o.ok || "OK", o.danger);
    sh.querySelector('[data-a="cancel"]').onclick = function () { done(false); };
    var ok = sh.querySelector('[data-a="ok"]');
    ok.onclick = function () { done(true); };
    setTimeout(function () { ok.focus(); }, 50);
  }, false);
}

function alertD(o) {
  return sheet(function (sh, done) {
    sh.innerHTML = head(o) + buttons(o.ok || "OK", false, false);
    sh.querySelector('[data-a="ok"]').onclick = function () { done(); };
  }, undefined);
}

function formD(o) {
  var fields = o.fields || [];
  return sheet(function (sh, done) {
    var h = head(o) + '<div class="ask-fs">';
    fields.forEach(function (f, i) {
      var isNum = f.type === "num";
      var val = f.value == null ? "" : (isNum && typeof f.value === "number" ? fmt(f.value) : f.value);
      h += '<div class="ask-f"><label for="ask-i' + i + '">' + esc(f.label || "") + "</label>" +
           '<div class="ask-row">' +
           (f.step ? '<button type="button" class="ask-st" data-st="-' + i + '" aria-label="weniger">−</button>' : "") +
           '<input class="ask-in" id="ask-i' + i + '" autocomplete="off" spellcheck="false"' +
           ' type="' + (f.type === "password" ? "password" : "text") + '"' +
           (isNum ? ' inputmode="decimal"' : "") +
           ' placeholder="' + esc(f.placeholder || "") + '" value="' + esc(val) + '">' +
           (f.step ? '<button type="button" class="ask-st" data-st="+' + i + '" aria-label="mehr">+</button>' : "") +
           (f.suffix ? '<span class="ask-su">' + esc(f.suffix) + "</span>" : "") +
           "</div></div>";
    });
    sh.innerHTML = h + "</div>" + buttons(o.ok || "Speichern");

    var inputs = fields.map(function (f, i) { return sh.querySelector("#ask-i" + i); });
    sh.querySelectorAll("[data-st]").forEach(function (b) {
      b.onclick = function () {
        var spec = b.getAttribute("data-st"), sign = spec[0] === "-" ? -1 : 1, i = Number(spec.slice(1));
        var f = fields[i], cur = num(inputs[i].value);
        if (!isFinite(cur)) cur = 0;
        var nx = Math.round((cur + sign * f.step) / f.step) * f.step;
        if (typeof f.min === "number" && nx < f.min) nx = f.min;
        inputs[i].value = fmt(nx); inputs[i].classList.remove("bad");
      };
    });
    function submit() {
      var out = {}, bad = false;
      fields.forEach(function (f, i) {
        var v = inputs[i].value;
        if (f.type === "num") {
          v = num(v);
          var wrong = inputs[i].value.trim() !== "" && !isFinite(v);
          inputs[i].classList.toggle("bad", wrong);
          if (wrong) bad = true;
        }
        out[f.key] = v;
      });
      if (!bad) done(out);
    }
    inputs.forEach(function (inp, i) {
      inp.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (i < inputs.length - 1) inputs[i + 1].focus(); else submit();
      });
      inp.addEventListener("focus", function () { setTimeout(function () { inp.select(); }, 0); });
    });
    sh.querySelector('[data-a="cancel"]').onclick = function () { done(null); };
    sh.querySelector('[data-a="ok"]').onclick = submit;
    if (o.autofocus !== false && inputs[0]) setTimeout(function () { inputs[0].focus(); }, 260);
  }, null);
}

function typedD(o) {
  return sheet(function (sh, done) {
    sh.innerHTML = head(o) +
      '<div class="ask-fs"><div class="ask-f"><label for="ask-ty">Zur Bestätigung „' + esc(o.word) + '“ eintippen</label>' +
      '<div class="ask-row"><input class="ask-in" id="ask-ty" autocomplete="off" autocapitalize="characters" spellcheck="false"></div></div></div>' +
      buttons(o.ok || "Bestätigen", true);
    var inp = sh.querySelector("#ask-ty"), ok = sh.querySelector('[data-a="ok"]');
    function check() { ok.disabled = inp.value.trim().toUpperCase() !== String(o.word).toUpperCase(); }
    inp.addEventListener("input", check); check();
    sh.querySelector('[data-a="cancel"]').onclick = function () { done(false); };
    ok.onclick = function () { if (!ok.disabled) done(true); };
  }, false);
}

window.tlAsk = { confirm: confirmD, alert: alertD, form: formD, typed: typedD, num: num };

})();
