"""Real UI region lifecycle with CDP heap/network measurements.

The Browser plugin is not available; the project permits ordinary Playwright.
CDP only measures resources and prototype instance counts, never changes game state.
This is informed technical QA, not a blind student playtest.
"""
import argparse
import hashlib
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser()
parser.add_argument("--output", default="artifacts/settlements-resources")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
site = root / "site"
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)


def site_hash():
    digest = hashlib.sha256()
    for file in sorted(path for path in site.rglob("*") if path.is_file()):
        digest.update(file.relative_to(site).as_posix().encode() + b"\0")
        digest.update(hashlib.sha256(file.read_bytes()).digest())
    return digest.hexdigest()


wire_requests = []
phase = "lobby"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def copyfile(self, source, outputfile):
        body_bytes = 0
        try:
            while chunk := source.read(65536):
                outputfile.write(chunk)
                body_bytes += len(chunk)
        finally:
            wire_requests.append({"phase": phase, "path": urlsplit(self.path).path,
                                  "responseBodyBytes": body_bytes})


server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(site)))
Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_port}"
report = {"status": "not-run", "siteHashBefore": site_hash(), "samples": [], "requests": [],
          "errors": [], "measurement": "Chromium CDP queryObjects after explicit GC; real UI actions; service worker enabled"}

with sync_playwright() as playwright:
    options = {"headless": True}
    if os.environ.get("SETTLEMENTS_BROWSER_EXECUTABLE"):
        options["executable_path"] = os.environ["SETTLEMENTS_BROWSER_EXECUTABLE"]
    browser = playwright.chromium.launch(**options)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    cdp = context.new_cdp_session(page)
    page.on("pageerror", lambda error: report["errors"].append(str(error)))

    def finished(request):
        if request.url.startswith(origin) and "/apps/settlements/" in request.url:
            try:
                size = request.sizes()
            except Exception:
                size = {}
            report["requests"].append({"phase": phase, "path": urlsplit(request.url).path,
                                       "resourceType": request.resource_type, **size})

    page.on("requestfinished", finished)

    def count_instances(module, export):
        group = "settlements-resource-observer"
        try:
            prototype = cdp.send("Runtime.evaluate", {
                "expression": f"import({json.dumps(origin + module)}).then(m => m[{json.dumps(export)}].prototype)",
                "awaitPromise": True, "objectGroup": group})
            assert "exceptionDetails" not in prototype, prototype
            objects = cdp.send("Runtime.queryObjects", {
                "prototypeObjectId": prototype["result"]["objectId"], "objectGroup": group})
            result = cdp.send("Runtime.callFunctionOn", {
                "objectId": objects["objects"]["objectId"], "functionDeclaration": "function(){return this.length}",
                "returnByValue": True})
            return result["result"]["value"]
        finally:
            cdp.send("Runtime.releaseObjectGroup", {"objectGroup": group})

    def sample(label, expected):
        cdp.send("HeapProfiler.collectGarbage")
        value = {"label": label, **cdp.send("Runtime.getHeapUsage"),
                 "worlds": count_instances("/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs", "World"),
                 "maps": count_instances("/apps/settlements/runtime/assets/js/settlements/v24/map.mjs", "GameMap"),
                 "canvases": page.locator(".puzzle-map canvas").count()}
        report["samples"].append(value)
        assert value["worlds"] == expected, value
        assert value["maps"] == expected, value
        assert value["canvases"] == expected * 2, value
        print(json.dumps(value), flush=True)

    def click(action):
        page.locator(f'[data-act="{action}"]').click()

    def find(name):
        click("search")
        page.locator("#settlement-search").fill(name)
        page.locator("[data-search-result]").filter(has=page.get_by_text(name, exact=True)).first.click()

    def choose(tool):
        if not page.locator(f'[data-tool="{tool}"]').count():
            click("tools")
        page.locator(f'[data-tool="{tool}"]').click()

    def confirm(turn):
        click("confirm")
        if turn < 6:
            page.locator(".step-badge").filter(has_text=f"{turn + 1}/6").wait_for()

    try:
        page.goto(origin + "/#games/settlements")
        page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
        page.evaluate("navigator.serviceWorker.ready")
        page.reload()
        page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
        report["serviceWorkerControlled"] = page.evaluate("!!navigator.serviceWorker.controller")
        assert report["serviceWorkerControlled"]
        report["lobbyRequests"] = list(report["requests"])
        assert not any("/regions/" in row["path"] or "/social-plans-regions/" in row["path"]
                       or "/transport-policy-v2-regions/" in row["path"] for row in report["lobbyRequests"])
        # Imports here expose only already supported prototypes for measurement;
        # the pre-map lazy-network assertion above is taken before those imports.
        phase = "observer"
        sample("lobby", 0)
        phase = "tutorial"
        page.locator('[data-action="tutorial"]').click()
        page.locator('[data-act="guide-position"]').wait_for(timeout=60000)
        sample("tutorial-mounted", 1)
        click("guide-position"); confirm(1)
        choose("medical"); find("Большая Казакбаева"); confirm(2)
        choose("connect"); find("Большая Казакбаева"); find("Мансурова"); confirm(3)
        choose("tower"); find("Большая Тюлякова"); confirm(4)
        choose("connect"); find("Султанаева"); find("Большая Казакбаева"); confirm(5)
        choose("culture"); find("Большая Тюлякова"); confirm(6)
        page.locator('[data-action="lobby"]').filter(visible=True).click()
        page.locator('[data-select="region"]').wait_for()
        sample("tutorial-released", 0)
        # Include the supplied territory with the most settlement records.
        territories = ["nenetskiy_avtonomnyy_okrug", "respublika_altay", "chukotskiy_avtonomnyy_okrug", "tverskaya_oblast"]
        for index, territory in enumerate(territories):
            phase = territory
            page.locator('[data-select="region"]').select_option(territory)
            page.locator('[data-select="difficulty"]').select_option("easy")
            page.locator('[data-action="start"]').click()
            if index:
                page.locator('[data-dialog="confirm"]').click()
            page.locator(".puzzle-map").wait_for(timeout=120000)
            page.locator(".puzzle-loading").wait_for(state="hidden", timeout=120000)
            click("menu"); click("close")
            sample(territory + "-mounted", 1)
            page.screenshot(path=str(out / (territory + ".png")))
            page.locator('[data-action="lobby"]').filter(visible=True).click()
            page.locator('[data-select="region"]').wait_for()
            sample(territory + "-released", 0)
        allowed = {"tutorial": "chelyabinskaya_oblast", **{key: key for key in territories}}
        regional = [row for row in report["requests"] if not row["path"].endswith("/index.mjs") and
                    ("/regions/" in row["path"] or "/social-plans-regions/" in row["path"] or
                     "/transport-policy-v2-regions/" in row["path"])]
        assert all(allowed.get(row["phase"], "INVALID") in row["path"] for row in regional), regional
        assert not any("missions" in row["path"] for row in report["requests"])
        report["wireRequests"] = [row for row in wire_requests if "/apps/settlements/" in row["path"]]
        report["transferMeasurement"] = "Actual HTTP response body bytes sent by localhost, including service-worker fetches; excludes HTTP/TLS headers. Playwright request.sizes can be negative for SW responses and is not used for totals."
        report["transferBytesByPhase"] = {key: sum(row["responseBodyBytes"]
                                                  for row in report["wireRequests"] if row["phase"] == key)
                                           for key in ["lobby", "observer", *allowed]}
        report["siteHashAfter"] = site_hash()
        assert report["siteHashBefore"] == report["siteHashAfter"], "Product changed during measurements"
        assert not report["errors"], report["errors"]
        report["status"] = "pass"
    except Exception as error:
        report.update(status="fail", failure=f"{type(error).__name__}: {error}")
        page.screenshot(path=str(out / "failure.png"))
    finally:
        (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        browser.close()
        server.shutdown()
print(json.dumps({key: report.get(key) for key in ("status", "failure", "transferBytesByPhase")}), flush=True)
sys.exit(0 if report["status"] == "pass" else 1)
