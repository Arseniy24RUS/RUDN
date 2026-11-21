"""ZH touch regression: an earned notice must not move a pending tap target."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from test_governor_browser import LocalFixtureServer


def first_award(page, base):
    page.goto(base, wait_until="domcontentloaded")
    page.locator("html[data-app-ready=true]").wait_for(state="attached")
    for _ in range(3):
        lang = page.locator("html").get_attribute("lang")
        if lang.startswith("zh"):
            break
        page.locator("#start-language").tap()
        page.wait_for_function("old => document.documentElement.lang !== old", arg=lang)
    assert page.locator("html").get_attribute("lang").startswith("zh")
    page.locator('#start-form button[type="submit"]').tap()
    page.locator('[data-agenda-topic="school-neighbourhood"]').tap()
    page.locator('[data-action="school-campus"]').tap()
    page.locator("#confirm-action").tap()
    if page.locator("#negotiation-dialog[open]").count():
        page.locator("[data-sign-agreement]").tap()
    year = page.locator(".agenda-heading p")
    assert "第2年" in year.inner_text()
    notice = page.locator("#toast-region .toast")
    notice.wait_for()
    notice_text = notice.inner_text()
    assert "新" in notice_text, notice_text
    return year, notice, notice_text


def run(browser, base, output):
    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True,
                                  is_mobile=True, locale="zh-CN", service_workers="block")
    try:
        origin = urlsplit(base).netloc
        context.route("**/*", lambda route: route.continue_()
                      if urlsplit(route.request.url).netloc == origin else route.abort())
        page = context.new_page()
        page.set_default_timeout(7000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        year, notice, notice_text = first_award(page, base)
        advance = page.locator('[data-agenda-topic="agenda-operations"]')
        advance.evaluate("button => button.scrollIntoView({block:'center',behavior:'instant'})")
        hit = """button => {
          const r = button.getBoundingClientRect(), x = r.x+r.width/2, y = r.y+r.height/2;
          return {x,y,width:r.width,height:r.height,hit:button.contains(document.elementFromPoint(x,y))};
        }"""
        before = advance.evaluate(hit)
        assert before["hit"], before
        page.screenshot(path=output / "notice-before.png")
        page.wait_for_timeout(3800)
        after = advance.evaluate(hit)
        page.screenshot(path=output / "notice-after.png")
        result = {"language": page.locator("html").get_attribute("lang"), "width": 390, "height": 844,
                  "engine": browser.browser_type.name, "engineVersion": browser.version, "notice": notice_text,
                  "before": before, "after": after, "delayMs": 3800, "noticeRetained": notice.is_visible()}
        (output / "notice.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
        assert after["hit"] and abs(after["x"]-before["x"]) <= 1 and abs(after["y"]-before["y"]) <= 1, result
        assert notice.is_visible() and notice.inner_text() == notice_text, result
        assert page.locator("#toast-region").get_attribute("aria-live") == "polite"
        assert notice.locator("button").get_attribute("aria-label")
        page.touchscreen.tap(before["x"], before["y"])
        assert "第3年" in year.inner_text()
        assert page.locator(".agenda-more[open]").count() == 0
        # Check manual dismissal in another fresh campaign, independently of the tap above.
        second = browser.new_context(viewport={"width":390, "height":844}, has_touch=True,
                                     is_mobile=True, locale="zh-CN", service_workers="block")
        try:
            second.route("**/*", lambda route: route.continue_()
                         if urlsplit(route.request.url).netloc == origin else route.abort())
            another = second.new_page()
            another.on("pageerror", lambda error: errors.append(str(error)))
            _, second_notice, _ = first_award(another, base)
            second_notice.locator(".toast-close").tap()
            assert not second_notice.count()
        finally:
            second.close()
        assert not errors, errors
        result.update(status="pass", advancedByTouch=True, manualDismiss=True)
        (output / "notice.json").write_text(json.dumps(result, indent=2, ensure_ascii=False))
        print(json.dumps(result, ensure_ascii=False), flush=True)
    finally:
        context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--engine", choices=("chromium", "webkit"), default="chromium")
    parser.add_argument("--base", help="Optional loopback URL of a built Governor free-play release")
    args = parser.parse_args()
    if args.base and urlsplit(args.base).hostname not in ("localhost", "127.0.0.1", "::1"):
        parser.error("Only loopback is supported")
    args.output.mkdir(parents=True, exist_ok=True)
    with LocalFixtureServer() as server, sync_playwright() as playwright:
        browser = getattr(playwright, args.engine).launch()
        try:
            run(browser, args.base or server.base + "apps/governor/index.html?context=free", args.output)
        finally:
            browser.close()
