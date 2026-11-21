#!/usr/bin/env python3
"""Nachtmodus-Test für training-log (21.11.2026, nach regel-cockpit tests/theme_test.py).

  1. Statisch: keine fest eingetragenen Farben außerhalb der :root-Blöcke
     in index.html. Erlaubt sind nur die bewusst festen Stellen (Scanner-
     Overlay, App-Icon, theme-color, Schatten/Abdunkler rgba(0,0,0,…) bzw.
     rgba(26,26,26,…)) und Fallbacks gibt es keine.
  2. Headless über HTTP (nicht file://: dort gingen localStorage-Schreib-
     vorgänge bei schnellem Neuladen verloren), System hell und dunkel:
     Auto folgt dem System, Knopf schaltet Auto → Hell → Dunkel → Auto,
     Wahl übersteht Neuladen, Statusleiste zieht mit, Auto reagiert live
     auf Systemwechsel (Energiesparmodus), manuelle Wahl schlägt System,
     Knopf in allen Ansichten sichtbar, Key tl-theme, keine Fehler.

Aufruf aus dem Repo-Wurzelordner:  python3 test/theme_test.py
Exit-Code 0 = bestanden, 1 = Fehler.
"""
import functools, http.server, os, re, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = 0

def check(name, cond, info=""):
    global fails
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond or not info else "  " + str(info)[:300]))
    fails += 0 if cond else 1

# 1. Statisch
print("1. Feste Farben (statisch)")
COL = re.compile(r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)")
KEEP_LINE = ["#scan-ov", "ctx.fillStyle", 'name="theme-color"', "#615", "BAR = {"]
hits = []
files = ["index.html"] + sorted(f for f in os.listdir(ROOT) if f.endswith(".js"))
for f in files:
    in_root = False
    for n, ln in enumerate(open(os.path.join(ROOT, f), encoding="utf-8"), 1):
        if f == "index.html" and ln.startswith(":root"):
            in_root = True
        if in_root:
            if ln.startswith("}"):
                in_root = False
            continue
        if any(k in ln for k in KEEP_LINE):
            continue
        for m in COL.findall(ln):
            c = re.sub(r"\s+", "", m)
            if c.startswith("rgba(0,0,0") or c.startswith("rgba(26,26,26"):
                continue
            hits.append(f"{f}:{n} {m}")
check("alle Farben über var(--…)", not hits, ", ".join(hits))

# 2. Headless
print("2. Umschalten (headless, HTTP)")
from playwright.sync_api import sync_playwright

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}/"

LIGHT_BG, DARK_BG = "rgb(245, 245, 243)", "rgb(17, 18, 20)"
STATE = """() => ({t: document.documentElement.dataset.theme, p: document.documentElement.dataset.themePref,
  bg: getComputedStyle(document.body).backgroundColor,
  bar: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content + '|' + (m.getAttribute('media') || '')),
  lbl: document.getElementById('theme-btn').getAttribute('aria-label'),
  vis: !!document.getElementById('theme-btn').offsetParent,
  ls: localStorage.getItem('tl-theme'),
  keys: Array.from({length: localStorage.length}, (_, i) => localStorage.key(i))})"""
READY = "() => window.tlViewCore && document.querySelector('.view.active')"

with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ("light", "dark"):
        print(f"  [System {scheme}]")
        ctx = b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True,
                            locale="de-DE", timezone_id="Europe/Berlin", color_scheme=scheme)
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=15000)
        st = lambda: pg.evaluate(STATE)
        bar = lambda t: "#111214" if t == "dark" else "#F5F5F3"
        s = st()
        want = DARK_BG if scheme == "dark" else LIGHT_BG
        check("Auto folgt System", s["p"] == "auto" and s["t"] == scheme and s["bg"] == want, s)
        check("Statusleiste passt", s["bar"] and all(x.startswith(bar(scheme) + "|") for x in s["bar"]), s["bar"])
        check("Knopf sichtbar mit Label", s["vis"] and "automatisch" in s["lbl"], s["lbl"])

        pg.click("#theme-btn"); s = st()
        check("1. Tipp: hell", s["p"] == "light" and s["t"] == "light" and s["bg"] == LIGHT_BG and s["ls"] == "light", s)
        pg.click("#theme-btn"); s = st()
        check("2. Tipp: dunkel", s["p"] == "dark" and s["t"] == "dark" and s["bg"] == DARK_BG
              and all(x.startswith("#111214") for x in s["bar"]), s)

        pg.reload(); pg.wait_for_function(READY, timeout=15000); s = st()
        check("dunkel nach Neuladen", s["t"] == "dark" and s["bg"] == DARK_BG, s)

        pg.click("#theme-btn"); s = st()
        check("3. Tipp: zurück auf Auto, Key entfernt", s["p"] == "auto" and s["t"] == scheme and s["ls"] is None, s)

        other = "light" if scheme == "dark" else "dark"
        pg.emulate_media(color_scheme=other); pg.wait_for_timeout(100); s = st()
        check(f"Auto reagiert live auf System → {other}", s["t"] == other and s["bar"][0].startswith(bar(other)), s)
        pg.click("#theme-btn"); pg.emulate_media(color_scheme="dark"); pg.wait_for_timeout(100); s = st()
        check("manuell hell schlägt System dunkel", s["t"] == "light", s)
        pg.click("#theme-btn"); pg.click("#theme-btn")   # zurück auf Auto
        pg.emulate_media(color_scheme=scheme)

        views = pg.evaluate("() => [...document.querySelectorAll('.view[id^=\"view-\"]')].map(v => v.id.slice(5))")
        hidden = []
        for v in views:
            pg.evaluate("v => window.showView(v)", v); pg.wait_for_timeout(100)
            if not st()["vis"]:
                hidden.append(v)
        check(f"Knopf in allen {len(views)} Ansichten sichtbar", not hidden, hidden)
        width = pg.evaluate("() => document.documentElement.scrollWidth")
        check("Kopf nicht breiter als der Bildschirm", width <= 412, width)
        s = st()
        foreign = [k for k in s["keys"] if not k.startswith("tl-")]
        check("nur tl-Keys", not foreign, foreign)
        check("keine JS-Fehler", not errs, errs)
        ctx.close()
    b.close()
srv.shutdown()

print()
print("BESTANDEN" if not fails else f"FEHLGESCHLAGEN ({fails})")
sys.exit(1 if fails else 0)
