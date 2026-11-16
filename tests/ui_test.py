"""End-to-end UI test in headless Chrome with a mocked encoder and mocked Europe PMC.

    python tests/ui_test.py   (writes screenshots to tests/screenshots/)
"""
import http.server, json, shutil, socketserver, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "screenshots"; OUT.mkdir(exist_ok=True)
tmp = Path(tempfile.mkdtemp()) / "site"
shutil.copytree(ROOT / "site", tmp)
shutil.copy(ROOT / "tests" / "mock-transformers.js", tmp / "js" / "mock-transformers.js")
shutil.rmtree(tmp / "models", ignore_errors=True)   # the mock replaces the real model
cfg = json.loads((tmp / "data" / "config.json").read_text(encoding="utf-8"))
cfg["transformers_js"] = "./js/mock-transformers.js"
(tmp / "data" / "config.json").write_text(json.dumps(cfg))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(tmp), **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{port}/"

EPMC = {"resultList": {"result": [{"id": "999", "source": "MED", "title": "Live result: theta and mind wandering in novice meditators.",
        "authorString": "Doe J, Roe R.", "pubYear": "2025", "doi": "10.9999/live.1", "journalInfo": {"journal": {"title": "Test Journal"}},
        "abstractText": "We recorded EEG during breath meditation and probed mind wandering. Frontal theta rose during focus."}]}}
errors, seen_live = [], []
with sync_playwright() as p:
    chrome = Path("/usr/bin/google-chrome")
    b = p.chromium.launch(**({"executable_path": str(chrome)} if chrome.exists() else {}), args=["--no-sandbox", "--no-proxy-server"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    def epmc(route):
        seen_live.append(route.request.url); route.fulfill(status=200, content_type="application/json", body=json.dumps(EPMC),
                                                          headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("https://www.ebi.ac.uk/**", epmc)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))

    page.goto(BASE); page.wait_for_selector("#home-practices .pcard")
    n_home_cards = page.locator("#home-practices .pcard").count()
    page.screenshot(path=str(OUT / "home.png"), full_page=False)
    page.goto(BASE + "#how"); page.wait_for_selector("#nce-matrix .mc")
    page.click("#nce-step-btn"); page.wait_for_timeout(100)
    how_steps = page.inner_text("#nce-step")
    page.screenshot(path=str(OUT / "how.png"), full_page=False)

    page.goto(BASE + "#explore"); page.wait_for_selector(".card")
    n_cards = page.locator("#kb-results .card").count()
    page.fill("#kb-search", "gamma"); page.wait_for_timeout(200)
    n_gamma = page.locator("#kb-results .card").count()
    page.fill("#kb-search", ""); page.locator("#kb-facets input[value='advanced']").check(); page.wait_for_timeout(200)
    n_adv = page.locator("#kb-results .card").count()
    page.screenshot(path=str(OUT / "explore.png"), full_page=False)
    page.locator("#kb-facets input[value='advanced']").uncheck()
    page.click("#kb-sections button[data-s='datasets']"); page.wait_for_timeout(150)
    n_ds = page.locator("#kb-results .card").count()

    page.goto(BASE + "#find"); page.wait_for_function("!document.querySelector('#run').disabled", timeout=30000)
    status = page.inner_text("#model-status")
    page.fill("#query", "Cessation events in an advanced meditator, EEG alpha power drops before awareness stops")
    page.click("#run"); page.wait_for_selector(".result")
    top = page.inner_text(".result h3")
    page.screenshot(path=str(OUT / "find.png"), full_page=False)

    page.check("#live")
    page.fill("#query", "Mind wandering during breath meditation: frontal theta and mind wandering probes in novice meditators using EEG")
    page.click("#run"); page.wait_for_function("document.querySelector('#find-meta').innerText.includes('live search')")
    meta = page.inner_text("#find-meta"); live_titles = page.locator(".result h3").all_inner_texts()

    page.click("[data-action='more']"); page.wait_for_timeout(300); more_meta = page.inner_text("#find-meta")
    page.click("#show-on-map"); page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / "map.png"), full_page=False)
    legend = page.inner_text("#map-legend")
    page.set_viewport_size({"width": 390, "height": 844}); page.goto(BASE + "#explore"); page.wait_for_selector(".card")
    page.screenshot(path=str(OUT / "mobile.png"), full_page=False)
    b.close()
srv.shutdown()

report = dict(n_home_cards=n_home_cards, how_steps=how_steps, n_cards=n_cards, n_gamma=n_gamma, n_adv=n_adv, n_datasets=n_ds, status=status, top=top, meta=meta,
              live_in_results=any("Live result" in t for t in live_titles), live_url=seen_live[:1], more_meta=more_meta, legend=legend, errors=errors)
print(json.dumps(report, indent=1))
ok = n_home_cards == 4 and how_steps == "10" and n_cards > 50 and 0 < n_gamma < n_cards and n_adv >= 4 and n_ds == 8 and "Ready" in status and report["live_in_results"] and not errors
sys.exit(0 if ok else 1)
