"""Actual localhost wrapper QA; no profile, storage or engine-state injection.

Run with an existing Python Playwright installation and running platform server.
Browser plugin was unavailable (CUA: Browser is not available: iab); project permits
ordinary localhost Playwright fallback. This is informed technical QA, not a blind
playtest or evidence of cloud/student persistence.
"""
from pathlib import Path
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import hashlib
import os
import subprocess
import sys
from threading import Thread
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
VIEWPORTS = [(320, 568), (390, 844), (430, 932), (844, 390), (1365, 900)]
LOCALES = ("ru", "en", "zh")
parser = argparse.ArgumentParser()
parser.add_argument("--url", help="Use a running site instead of launching an isolated localhost server")
parser.add_argument("--site-dir", default=str(Path(__file__).resolve().parents[1] / "site"))
parser.add_argument("--output", default="evidence/settlements-browser")
parser.add_argument("--skip-region-switch", action="store_true", help="Run only the 15-case viewport/locale matrix")
parser.add_argument("--case", action="append", choices=[f"{w}x{h}:{locale}" for w, h in VIEWPORTS for locale in LOCALES],
                    help="Optional focused case, e.g. 320x568:zh (repeatable)")
args = parser.parse_args()
served_from_local_site = not bool(args.url)
def build_hash():
    digest = hashlib.sha256()
    site_root = Path(args.site_dir)
    for file in sorted(path for path in site_root.rglob("*") if path.is_file()):
        digest.update(file.relative_to(site_root).as_posix().encode() + b"\0")
        with file.open("rb") as source:
            digest.update(hashlib.file_digest(source, "sha256").digest())
    return digest.hexdigest()

build_hash_before = build_hash()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
report = []
server = None
if not args.url:
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=args.site_dir))
    Thread(target=server.serve_forever, daemon=True).start()
    args.url = f"http://127.0.0.1:{server.server_port}/#games/settlements"


def listener_counts(cdp):
    result = {}
    for target in ("document", "window"):
        remote = cdp.send("Runtime.evaluate", {"expression": target, "objectGroup": "settlements-qa"})
        listeners = cdp.send("DOMDebugger.getEventListeners", {"objectId": remote["result"]["objectId"]})["listeners"]
        result[target] = {kind: sum(item["type"] == kind for item in listeners)
                          for kind in ("visibilitychange", "resize", "keydown", "pointerdown")}
    cdp.send("Runtime.releaseObjectGroup", {"objectGroup": "settlements-qa"})
    return result


with sync_playwright() as p:
    launch = {"headless": True}
    if os.environ.get("SETTLEMENTS_BROWSER_EXECUTABLE"):
        launch["executable_path"] = os.environ["SETTLEMENTS_BROWSER_EXECUTABLE"]
    browser = p.chromium.launch(**launch)
    for width, height in VIEWPORTS:
        for locale in LOCALES:
            if args.case and f"{width}x{height}:{locale}" not in args.case:
                continue
            context = browser.new_context(viewport={"width": width, "height": height}, service_workers="block")
            if width == 320:
                # A denied browser fullscreen permission must never expose the
                # platform chrome or prevent the mandatory viewport layout.
                context.add_init_script("Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Denied for regression', 'NotAllowedError'))")
            page = context.new_page()
            cdp = context.new_cdp_session(page)
            errors, requests, console_errors = [], [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url) if "/apps/settlements/" in request.url else None)
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            row = {"viewport": [width, height], "locale": locale, "issues": [], "errors": errors,
                   "consoleErrors": console_errors}
            stem = f"{width}x{height}-{locale}"
            try:
                page.goto(args.url)
                page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
                row["title"] = page.title()
                row["url"] = page.url
                assert page.locator(".leaderboard").is_visible(), "leaderboard not rendered before map"
                row["lobbyDataRequests"] = [url for url in requests if "/runtime/data/" in url]
                if any(not url.endswith("/manifest.json") for url in row["lobbyDataRequests"]):
                    row["issues"].append("lobby_downloaded_geography")
                if not any(url.endswith("/manifest.json") for url in row["lobbyDataRequests"]):
                    row["issues"].append("lobby_manifest_not_requested")
                page.locator(f'[data-lang="{locale}"]').click()
                row["listenersBefore"] = listener_counts(cdp)
                page.screenshot(path=str(out / f"lobby-{stem}.png"))
                page.locator('[data-action="tutorial"]').click()
                page.locator('[data-act="guide-position"]').wait_for(timeout=60000)
                row["listenersMounted"] = listener_counts(cdp)
                assert page.locator('[data-game-status]').is_visible(), "save status must be visible above the map"
                assert page.locator('html.settlements-playing').count() == 1
                assert not page.locator('.topbar').is_visible()
                assert not page.locator('.mobile-nav').is_visible()
                assert not page.locator('.sidebar').is_visible()
                assert not page.locator('.leaderboard').is_visible()
                stage = page.locator('.game-stage').bounding_box()
                row['fullscreenStage'] = stage
                assert stage['height'] >= height - 150, f'map does not fill viewport: {stage}'
                page.screenshot(path=str(out / f"tutorial-{stem}.png"))
                page.locator('[data-act="guide-position"]').click()
                confirm = page.locator('[data-act="confirm"]')
                confirm.wait_for()
                box = confirm.bounding_box()
                mapbox = page.locator(".puzzle-map").bounding_box()
                nav = page.locator(".mobile-nav").bounding_box() if page.locator(".mobile-nav").is_visible() else None
                top = page.locator(".topbar").bounding_box()
                row.update({"confirm": box, "map": mapbox, "bottomNav": nav, "topbar": top})
                if box["x"] < 0 or box["x"] + box["width"] > width or box["y"] < 0 or box["y"] + box["height"] > height:
                    row["issues"].append("confirm_outside_viewport")
                if nav and box["y"] + box["height"] > nav["y"]:
                    row["issues"].append("confirm_under_bottom_navigation")
                if top and box["y"] < top["y"] + top["height"]:
                    row["issues"].append("confirm_under_header")
                if page.evaluate("document.documentElement.scrollWidth > innerWidth"):
                    row["issues"].append("horizontal_document_overflow")
                page.screenshot(path=str(out / f"preview-{stem}.png"))
                selected_action = page.locator('.preview-panel').inner_text() if page.locator('.preview-panel').count() else None
                next_locale = {"ru": "en", "en": "zh", "zh": "ru"}[locale]
                page.locator('[data-select="locale"]').select_option(next_locale)
                confirm.wait_for()
                assert page.locator('.puzzle-map').count() == 1
                assert page.locator('.step-badge').filter(has_text='1/6').is_visible()
                page.locator('[data-select="locale"]').select_option(locale)
                confirm.wait_for()
                if selected_action is not None:
                    assert page.locator('.preview-panel').inner_text() == selected_action
                confirm.click()
                page.locator(".step-badge").filter(has_text="2/6").wait_for()
                row["cycles"] = []
                for cycle in range(3):
                    page.locator('[data-action="lobby"]').filter(visible=True).click()
                    page.locator('[data-action="tutorial"]').wait_for()
                    page.locator(".puzzle-map").wait_for(state="detached")
                    assert page.locator('html.settlements-playing').count() == 0
                    assert page.locator('.topbar').is_visible()
                    assert page.locator('.mobile-nav' if width <= 760 else '.sidebar').is_visible()
                    counts = listener_counts(cdp)
                    row["cycles"].append({"cycle": cycle + 1, "listenersAfterDestroy": counts,
                                          "canvasCount": page.locator(".puzzle-map canvas").count()})
                    if counts != row["listenersBefore"]:
                        row["issues"].append(f"listeners_accumulated_cycle_{cycle + 1}")
                    page.locator('[data-action="tutorial"]').click()
                    page.locator(".step-badge").filter(has_text="2/6").wait_for(timeout=60000)
                    if listener_counts(cdp) != row["listenersMounted"]:
                        row["issues"].append(f"mounted_listeners_changed_cycle_{cycle + 1}")
                next_locale = {"ru": "en", "en": "zh", "zh": "ru"}[locale]
                page.locator('[data-select="locale"]').select_option(next_locale)
                page.locator(".step-badge").filter(has_text="2/6").wait_for()
                page.locator('[data-action="lobby"]').filter(visible=True).click()
                page.locator('[data-action="tutorial"]').wait_for()
                page.reload()
                page.locator('[data-action="tutorial"]').click(timeout=60000)
                page.locator(".step-badge").filter(has_text="2/6").wait_for(timeout=60000)
                page.screenshot(path=str(out / f"restored-{stem}-{next_locale}.png"))
                row["restoredStep"] = "2/6"
                row["regionRequests"] = sorted(set(url for url in requests if "/regions/" in url))
                if len(row["regionRequests"]) != 1 or "chelyabinskaya_oblast" not in row["regionRequests"][0]:
                    row["issues"].append("unexpected_region_downloads")
                page.goto(args.url.split('#')[0]+'#games')
                page.locator('#settlementsMount').wait_for(state='detached')
                assert page.locator('html.settlements-playing').count() == 0
                assert page.locator('.topbar').is_visible()
                row['fullscreenExitRestoresPlatform'] = True
                row["status"] = "fail" if row["issues"] or errors or console_errors else "pass"
            except Exception as error:
                row.update({"status": "fail", "failure": str(error)})
                page.screenshot(path=str(out / f"failed-{stem}.png"))
            report.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
            (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            context.close()
    browser.close()
region_exit = 0
if not args.skip_region_switch:
    region_exit = subprocess.run([sys.executable, str(Path(__file__).with_name("test-settlements-region-switch.py")),
                                  "--url", args.url, "--output", str(out)]).returncode
if server:
    server.shutdown()
    server.server_close()
build_hash_after = build_hash()
failed = any(row["status"] != "pass" for row in report) or region_exit or build_hash_before != build_hash_after
(out / "build-evidence.json").write_text(json.dumps({
    "status": "fail" if failed else "pass", "localSiteHashBefore": build_hash_before,
    "localSiteHashAfter": build_hash_after, "servedFromLocalSite": served_from_local_site,
    "hashAlgorithm": "SHA256(sorted relative POSIX paths, NUL, raw SHA256 of each file)",
    "cases": len(report), "matrixReport": "report.json", "regionSwitchExitCode": region_exit,
    "regionSwitchRequested": not args.skip_region_switch,
}, indent=2), encoding="utf-8")
if failed:
    sys.exit(1)
