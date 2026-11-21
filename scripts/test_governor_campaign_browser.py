"""Governor in real browser engines, driving only rendered game controls."""
import argparse
import json
import re
import traceback
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from test_governor_browser import LocalFixtureServer

SIZES = [(320, 568), (390, 844), (430, 932), (844, 390), (1440, 900)]
LANGUAGES = ("ru", "en", "zh")
LOCALES = {"ru": "ru-RU", "en": "en-US", "zh": "zh-CN"}
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
CASES = {1: ("rural-healthcare", "train-staff"),
         2: ("school-neighbourhood", None),
         3: ("digital-services", None),
         4: ("flood-preparedness", None),
         5: ("youth-employment", None)}


def visible(page, selector):
    return page.locator(selector).first


def tap(page, selector, touch):
    control = visible(page, selector)
    if touch:
        control.tap()
    else:
        control.click()


def close_chapter(page, touch):
    if visible(page, "[data-enter-chapter]:visible").count():
        tap(page, "[data-enter-chapter]:visible", touch)


def layout(page):
    metrics = page.evaluate("""() => ({
      width: innerWidth, body: document.documentElement.scrollWidth,
      dialogs: [...document.querySelectorAll('dialog[open]')].map(d => {
        const r = d.getBoundingClientRect();
        return {id: d.id, left: r.left, right: r.right,
          client: d.clientWidth, scroll: d.scrollWidth};
      })
    })""")
    assert metrics["body"] <= metrics["width"] + 1, metrics
    for d in metrics["dialogs"]:
        assert d["left"] >= -1 and d["right"] <= metrics["width"] + 1, metrics
        assert d["scroll"] <= d["client"] + 1, metrics
    return metrics


def image_ok(page, css):
    return visible(page, css).evaluate("""async image => {
        await image.decode();
        return {width: image.naturalWidth, height: image.naturalHeight};
    }""")


def run(browser, base, output, width, height, language, full=False):
    name = f"{browser.browser_type.name}-{width}x{height}-{language}" + ("-full" if full else "")
    touch = width <= 430 or width == 844
    result = {"name": name, "touch": touch, "engineVersion": browser.version,
              "pageErrors": [], "networkErrors": [], "consoleErrors": [], "stages": {}}
    context = browser.new_context(viewport={"width": width, "height": height},
                                  locale=LOCALES[language], has_touch=touch,
                                  reduced_motion="reduce", service_workers="allow")
    origin = urlsplit(base).netloc
    context.route("**/*", lambda route: route.continue_() if
                  urlsplit(route.request.url).netloc == origin else route.abort("blockedbyclient"))
    page = context.new_page()
    page.set_default_timeout(10000)
    page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
    page.on("response", lambda response: result["networkErrors"].append(
        {"path": urlsplit(response.url).path, "status": response.status,
         "type": response.request.resource_type}) if response.status >= 400 and
        urlsplit(response.url).netloc == origin else None)
    page.on("console", lambda message: result["consoleErrors"].append(
        {"text": message.text, "url": message.location["url"]}) if message.type == "error" else None)
    page.on("dialog", lambda dialog: dialog.accept())
    snap = lambda stage: page.screenshot(path=str(output / f"{name}-{stage}.png"), full_page=False)
    try:
        page.goto(base, wait_until="domcontentloaded")
        visible(page, "html[data-app-ready='true']").wait_for(state="attached")
        visible(page, "#start-form").wait_for()
        for _ in range(3):
            if page.locator("html").get_attribute("lang").split("-")[0] == language:
                break
            tap(page, "#start-language", touch)
        assert page.locator("html").get_attribute("lang").split("-")[0] == language
        result["title"] = page.title()
        assert result["title"] and ("RUDN" in result["title"] or "РУДН" in result["title"])
        assert visible(page, "#boot-error").is_hidden()
        assert visible(page, "#platform-rubric").is_hidden()
        assert visible(page, "#player-group").is_hidden()
        assert "grade" not in visible(page, ".privacy-note").inner_text().lower()
        result["stages"]["start"] = layout(page)
        result["startImage"] = image_ok(page, "#start-screen figure img")
        snap("start")
        tap(page, '#start-form button[type="submit"]', touch)
        close_chapter(page, touch)
        visible(page, "#agenda-heading").wait_for()
        result["stages"]["agenda"] = layout(page)
        result["agendaHeading"] = visible(page, "#agenda-heading").inner_text()
        assert bool(CYRILLIC.search(result["agendaHeading"])) == (language == "ru")
        if height >= 568:
            first_issue = visible(page, ".agenda-topic-list .agenda-topic")
            assert first_issue.evaluate("element => element.getBoundingClientRect().top") < height - 70
        tap(page, "[data-agenda-course]", touch)
        visible(page, "#campaign-course-dialog[open]").wait_for()
        tap(page, "[data-course-close]", touch)
        snap("agenda")

        for year in range(1, 21 if full else 2):
            close_chapter(page, touch)
            topic, action = CASES.get(year, ("agenda-operations", None))
            choice = visible(page, f'[data-agenda-topic="{topic}"]')
            if not choice.count():
                topic = "agenda-operations"
                choice = visible(page, f'[data-agenda-topic="{topic}"]')
            disclosure = choice.locator("xpath=ancestor::details[1]/summary")
            if not choice.is_visible() and disclosure.count():
                disclosure.click()
            tap(page, f'[data-agenda-topic="{topic}"]', touch)
            if year == 1:
                result["topicImage"] = image_ok(page, "#agenda-focus img")
            tap(page, f'[data-agenda-explore="{topic}"]', touch)
            visible(page, "#mission-panel[data-mission-id]").wait_for()
            if year == 1:
                visible(page, "#main-world canvas").wait_for(state="attached")
                result["stages"]["mission"] = layout(page)
                tap(page, "#campaign-course-shortcut", touch)
                visible(page, "#campaign-course-dialog[open]").wait_for()
                course = visible(page, "#campaign-course-dialog").inner_text()
                if language != "ru":
                    assert not CYRILLIC.search(course), course
                result["stages"]["course"] = layout(page)
                if not touch:
                    page.keyboard.press("Escape")
                    assert visible(page, "#campaign-course-dialog").is_hidden()
                else:
                    tap(page, "[data-course-close]", touch)
            selector = f'[data-action="{action}"]' if action else (
                "#action-cards .defer-action" if topic == "agenda-operations"
                else "#action-cards [data-action]:not(.defer-action):not([disabled])")
            tap(page, selector, touch)
            if year == 1:
                assert ".." not in visible(page, ".people-preview").inner_text()
                snap("project")
            tap(page, "#confirm-action", touch)
            if visible(page, "#negotiation-dialog[open]").count():
                if year == 1:
                    result["stages"]["negotiation"] = layout(page)
                    snap("negotiation")
                tap(page, "[data-sign-agreement]", touch)
            visible(page, "#resolution-dialog[open]").wait_for()
            assert visible(page, "#resolution-content > .campaign-result").is_visible()
            if year == 1:
                result["stages"]["annualResult"] = layout(page)
                snap("result")
            tap(page, "#continue-turn", touch)
            if year < 20:
                close_chapter(page, touch)
                visible(page, "#agenda-heading").wait_for()
                if year == 1 and width > 900:
                    assert visible(page, "#secondary-stage").evaluate("node=>node.scrollTop") <= 2
            if year in (1, 5):
                page.reload(wait_until="domcontentloaded")
                tap(page, "#continue-campaign", touch)
                close_chapter(page, touch)
                visible(page, "#agenda-heading").wait_for()
                header = visible(page, ".agenda-heading").inner_text()
                assert str(2026 + year) in header, header
                result[f"resumeAfter{year}"] = header
            result["completedTurns"] = year

        if full:
            visible(page, "#end-dialog[open]").wait_for()
            assert visible(page, "#end-summary .campaign-report").locator("article").count() == 4
            result["stages"]["ending"] = layout(page)
            result["final"] = visible(page, "#end-summary .campaign-report").inner_text()
            if language != "ru":
                assert not CYRILLIC.search(result["final"]), result["final"]
            snap("ending")
            with page.expect_download() as download:
                tap(page, "#download-report-end", touch)
            result["reportDownload"] = download.value.suggested_filename
            download.value.save_as(output / f"{name}-report.html")
        assert not result["pageErrors"], result["pageErrors"]
        failed_assets = [e for e in result["networkErrors"] if e["type"] in ("image", "script", "stylesheet")]
        assert not failed_assets, failed_assets
        result["status"] = "pass"
    except Exception:
        result["status"] = "fail"
        result["failure"] = traceback.format_exc()
        try:
            result["visible"] = page.locator("body").inner_text()[-5500:]
            snap("failure")
        except Exception:
            pass
    finally:
        context.close()
        (output / f"{name}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
        print(result["status"], name, result.get("failure", "").splitlines()[-1:], flush=True)
    return result["status"] == "pass"


def run_matrix(args, base):
    engine_no = ["chromium", "webkit", "firefox"].index(args.engine)
    with sync_playwright() as playwright:
        browser = getattr(playwright, args.engine).launch()
        sizes = [(i, size) for i, size in enumerate(SIZES) if args.single is None or args.single == i]
        results = [run(browser, base, args.output, *size, language)
                   for i, size in sizes
                   for language in (LANGUAGES if args.all_languages else (LANGUAGES[(i + engine_no) % 3],))]
        if args.full:
            results.extend(run(browser, base, args.output, 390, 844, language, full=True)
                           for language in (LANGUAGES if args.all_languages else (LANGUAGES[engine_no],)))
        browser.close()
        return 0 if all(results) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="Loopback release URL including ?context=free; defaults to a local QA fixture")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--engine", choices=["chromium", "webkit", "firefox"], required=True)
    parser.add_argument("--single", type=int)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--all-languages", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.base:
        if urlsplit(args.base).hostname not in ("127.0.0.1", "localhost", "::1"):
            parser.error("Only a loopback QA URL is supported")
        raise SystemExit(run_matrix(args, args.base))
    with LocalFixtureServer() as server:
        raise SystemExit(run_matrix(args, server.base + "apps/governor/index.html?context=free"))
