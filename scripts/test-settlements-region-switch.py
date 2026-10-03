"""Actual UI tutorial completion, free-region lazy loading and replay QA."""
from pathlib import Path
import argparse
import json
import os
import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4189/#games/settlements")
parser.add_argument("--output", default="evidence/settlements-browser-final")
parser.add_argument("--browser", choices=("chromium", "webkit", "firefox"), default="chromium")
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
report = {"browser": args.browser, "errors": [], "consoleErrors": [], "steps": [], "requests": []}

with sync_playwright() as p:
    launch = {"headless": True}
    if os.environ.get("SETTLEMENTS_BROWSER_EXECUTABLE"):
        launch["executable_path"] = os.environ["SETTLEMENTS_BROWSER_EXECUTABLE"]
    browser = getattr(p, args.browser).launch(**launch)
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    page = context.new_page()
    page.on("pageerror", lambda error: report["errors"].append(str(error)))
    page.on("console", lambda message: report["consoleErrors"].append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: report["requests"].append(request.url) if "/runtime/data/" in request.url else None)

    def click(action):
        page.locator(f'[data-act="{action}"]').click()

    def find(name):
        click("search")
        page.locator("#settlement-search").fill(name)
        page.locator("[data-search-result]").filter(has=page.get_by_text(name, exact=True)).first.click()

    def choose(tool):
        if page.locator(f'[data-tool="{tool}"]').count() == 0:
            click("tools")
        page.locator(f'[data-tool="{tool}"]').click()

    def confirm(turn):
        click("confirm")
        if turn < 6:
            page.locator(".step-badge").filter(has_text=f"{turn + 1}/6").wait_for()
        report["steps"].append({"turn": turn, "badge": page.locator(".step-badge").inner_text()})
        page.screenshot(path=str(out / f"tutorial-turn-{turn}.png"))

    try:
        page.goto(args.url)
        page.locator('[data-action="tutorial"]').click(timeout=60000)
        page.locator('[data-act="guide-position"]').wait_for(timeout=60000)
        click("guide-position"); confirm(1)
        choose("medical"); find("Большая Казакбаева"); confirm(2)
        choose("connect"); find("Большая Казакбаева"); find("Мансурова"); confirm(3)
        # Use an actual named source settlement through the accessible search UI.
        choose("tower"); find("Большая Тюлякова"); confirm(4)
        choose("connect"); find("Султанаева"); find("Большая Казакбаева"); confirm(5)
        choose("culture"); find("Большая Тюлякова"); confirm(6)
        assert page.locator('[data-act="undo"]').is_disabled()
        assert page.locator('[data-act="tools"]').is_disabled()
        page.locator('[data-action="lobby"]').filter(visible=True).click()
        page.locator('[data-select="region"]').wait_for()
        report["completedTutorialGate"] = True
        report["tutorialRegionRequests"] = sorted(set(url for url in report["requests"] if "/regions/" in url))
        assert len(report["tutorialRegionRequests"]) == 1 and "chelyabinskaya_oblast" in report["tutorialRegionRequests"][0]
        page.reload()
        page.locator('[data-select="region"]').wait_for(timeout=60000)
        report["tutorialFlagSurvivesReload"] = True
        chosen = "respublika_altay"
        page.locator('[data-select="region"]').select_option(chosen)
        page.locator('[data-select="difficulty"]').select_option("hard")
        page.locator('[data-lang="zh"]').click()
        page.locator('[data-action="start"]').click()
        page.locator(".puzzle-map").wait_for(timeout=60000)
        page.locator('[data-act="tools"]').wait_for()
        page.locator(".puzzle-loading").wait_for(state="hidden", timeout=60000)
        # A real interaction also waits for the completed mount and map paint.
        click("menu"); click("close")
        page.screenshot(path=str(out / "altay-hard-zh.png"))
        report["freeRegionTitle"] = page.locator(".game-heading").inner_text()
        free_heading = page.locator(".game-heading h2").inner_text()
        report["allRegionRequests"] = sorted(set(url for url in report["requests"] if "/regions/" in url))
        assert len(report["allRegionRequests"]) == 2
        assert any(chosen in url for url in report["allRegionRequests"])
        assert all(chosen in url or "chelyabinskaya_oblast" in url for url in report["allRegionRequests"])
        assert page.locator(".puzzle-map").count() == 1
        assert page.locator(".puzzle-map canvas").count() == 2
        # Replay remains available and returns to the same free game afterwards.
        page.locator('[data-action="tutorial"]').filter(visible=True).click()
        page.locator('[data-act="guide-position"]').wait_for(timeout=60000)
        page.locator(".step-badge").filter(has_text="1/6").wait_for()
        page.locator('[data-action="lobby"]').filter(visible=True).click()
        page.locator(".game-heading h2").filter(has_text=free_heading).wait_for(timeout=60000)
        page.locator(".puzzle-loading").wait_for(state="hidden", timeout=60000)
        page.locator('[data-act="tools"]').wait_for(timeout=60000)
        assert page.locator(".game-heading").inner_text() == report["freeRegionTitle"]
        report["replayTutorialReturnsToFreeGame"] = True
        report["status"] = "fail" if report["errors"] or report["consoleErrors"] else "pass"
    except Exception as error:
        report.update({"status": "fail", "failure": f"{type(error).__name__}: {error}"})
        page.screenshot(path=str(out / "region-switch-failed.png"))
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (out / "region-switch.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    browser.close()
if report["status"] != "pass":
    sys.exit(1)
