#!/usr/bin/env python3
"""Smoke-Test für training-log (18.11.2026).

Prüft vor jedem Push auf main, ob die App überhaupt noch startet:
  1. Syntax: node --check für jedes .js im Wurzelordner
  2. Loader: jede Moduldatei steht in MODS (plan.js) und umgekehrt
  3. Storage statisch: kein Key fc-… (gehört dem Finanz-Cockpit;
     das reine Präfix "fc-" zum Messen in diag.js ist erlaubt)
  4. Headless-Start (Chrome, Handy-Viewport): keine ungefangenen Fehler,
     alle Ansichten lassen sich per showView öffnen, alle localStorage-Keys
     beginnen mit tl-, Fehlerprotokoll tl-err bleibt leer.
     Externe Anfragen (GitHub, Oura, Anthropic, ntfy) werden blockiert,
     Fehler daraus zählen nicht.

Aufruf aus dem Repo-Wurzelordner:  python3 test/smoke.py
Voraussetzung: node, Python-Paket playwright mit Chromium
(pip install playwright --break-system-packages && playwright install chromium).
Exit-Code 0 = bestanden, 1 = Fehler.
"""
import functools, http.server, json, os, re, subprocess, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []

def fail(msg):
    fails.append(msg)
    print("  ✗ " + msg)

def ok(msg):
    print("  ✓ " + msg)

js = sorted(f for f in os.listdir(ROOT) if f.endswith(".js"))

# 1. Syntax
print("1. Syntax")
bad = 0
for f in js:
    r = subprocess.run(["node", "--check", os.path.join(ROOT, f)], capture_output=True, text=True)
    if r.returncode:
        bad += 1
        fail(f + ": " + (r.stderr.strip().splitlines() or ["?"])[-1])
if not bad:
    ok(f"{len(js)} Dateien fehlerfrei")

# 2. Loader
print("2. Loader (MODS in plan.js)")
plan = open(os.path.join(ROOT, "plan.js"), encoding="utf-8").read()
m = re.search(r"var MODS = \[([^\]]*)\]", plan)
if not m:
    fail("MODS-Liste in plan.js nicht gefunden")
    mods = []
else:
    mods = re.findall(r'"([^"]+)"', m.group(1))
    for f in mods:
        if f not in js:
            fail(f"MODS nennt {f}, Datei fehlt")
    for f in js:
        if f != "plan.js" and f not in mods:
            fail(f"{f} liegt im Repo, steht aber nicht in MODS")
    if len(set(mods)) != len(mods):
        fail("MODS enthält Doppelte")
    if mods and (mods[0] != "view.js" or mods[-1] != "back.js"):
        fail("Reihenfolge: view.js muss zuerst, back.js zuletzt laden")
    if not fails:
        ok(f"{len(mods)} Module, Liste vollständig")

# 3. Storage statisch
print("3. Storage-Keys (statisch)")
hits = []
for f in js + ["index.html"]:
    for n, line in enumerate(open(os.path.join(ROOT, f), encoding="utf-8"), 1):
        if re.search(r"""["'`]fc-[\w-]+["'`]""", line):
            hits.append(f"{f}:{n}")
if hits:
    fail("fc-Keys gefunden (gehören dem Finanz-Cockpit): " + ", ".join(hits))
else:
    ok("keine fc-Keys")

# 4. Headless-Start
print("4. Headless-Start")
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    fail("playwright fehlt – Headless-Teil übersprungen")
    sync_playwright = None

if sync_playwright:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True,
                            locale="de-DE", timezone_id="Europe/Berlin")
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("Laufzeit: " + str(e)))
        page.on("console", lambda m: errors.append("Konsole: " + m.text)
                if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to fetch" not in m.text
                and "Failed to load resource" not in m.text else None)
        page.goto(base + "index.html")
        page.wait_for_function("() => window.tlViewCore && document.querySelector('.view.active')", timeout=15000)
        page.wait_for_timeout(2500)
        views = page.evaluate("() => [...document.querySelectorAll('.view[id^=\"view-\"]')].map(v => v.id.slice(5))")
        for v in views:
            try:
                page.evaluate("v => window.showView(v)", v)
                page.wait_for_timeout(200)
            except Exception as e:
                errors.append(f"showView('{v}'): {e}")
        keys = page.evaluate("() => Array.from({length: localStorage.length}, (_, i) => localStorage.key(i))")
        tlerr = page.evaluate("() => localStorage.getItem('tl-err')")
        b.close()
    srv.shutdown()
    for e in errors:
        fail(e)
    if not errors:
        ok(f"Start ohne Fehler, {len(views)} Ansichten geöffnet: {', '.join(views)}")
    foreign = [k for k in keys if not k.startswith("tl-")]
    if foreign:
        fail("localStorage-Keys ohne tl-: " + ", ".join(foreign))
    else:
        ok(f"{len(keys)} localStorage-Keys, alle tl-")
    if tlerr:
        try:
            ents = json.loads(tlerr)
        except Exception:
            ents = [tlerr]
        ents = [e for e in ents if "fetch" not in json.dumps(e).lower()]
        for e in ents:
            fail("tl-err: " + json.dumps(e, ensure_ascii=False)[:200])
        if not ents:
            ok("tl-err leer (bis auf blockierte Netzanfragen)")
    else:
        ok("tl-err leer")

print()
print("BESTANDEN" if not fails else f"FEHLGESCHLAGEN ({len(fails)})")
sys.exit(1 if fails else 0)
