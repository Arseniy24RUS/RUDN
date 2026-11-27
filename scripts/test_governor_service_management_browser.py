"""Exercise a service through expiry, restoration and the end of a guest campaign."""
import argparse
import json
import re
import traceback
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

from test_governor_browser import LocalFixtureServer
from test_governor_campaign_browser import LANGUAGES, LOCALES, close_chapter, layout


LATE_TOPICS = (
    "digital-services", "youth-employment", "industrial-transition", "flu-wave",
    "digital-procurement", "health-legacy", "childcare-queue", "generations-city",
    "river-legacy", "industrial-legacy", "public-audit",
)
RESTORE_LABEL = {"ru": "Восстанов", "en": "Restor", "zh": "恢复"}


def choose(control, touch):
    control.wait_for(state="attached")
    summary = control.locator("xpath=ancestor::details[not(@open)][1]/summary")
    if not control.is_visible() and summary.count():
        summary.click()
    if touch:
        control.tap()
    else:
        control.click()


def amount(text):
    return float(re.search(r"\d+(?:[.,]\d+)?", text)[0].replace(",", "."))


def run_management(browser, base, output, width, height, language):
    name = f"service-{browser.browser_type.name}-{width}x{height}-{language}"
    touch = width < 900
    local = urlsplit(base)
    if local.hostname not in {"127.0.0.1", "localhost", "::1"} or local.query != "context=free":
        raise ValueError("A loopback guest game URL is required")
    result = {"name": name, "base": base, "version": browser.version, "annualChoices": [],
              "budgetMode": "automatic",
              "pageErrors": [], "httpErrors": [], "stages": {}}
    ctx = browser.new_context(viewport={"width": width, "height": height}, locale=LOCALES[language],
                              has_touch=touch, reduced_motion="reduce", service_workers="block")
    def restrict_network(route):
        request = route.request
        if urlsplit(request.url).netloc != local.netloc or request.method not in {"GET", "HEAD"}:
            route.abort()
        elif request.resource_type == "document":
            response = route.fetch(max_redirects=0, timeout=15000)
            headers = {**response.headers, "content-security-policy": f"connect-src {local.scheme}://{local.netloc}/RUDN/"}
            route.fulfill(response=response, headers=headers)
        else:
            route.continue_()
    ctx.route("**/*", restrict_network)
    page = ctx.new_page()
    page.set_default_timeout(9000)
    page.on("pageerror", lambda err: result["pageErrors"].append(str(err)))
    page.on("response", lambda r: result["httpErrors"].append([r.status, urlsplit(r.url).path])
            if r.status >= 400 and urlsplit(r.url).netloc == local.netloc else None)

    def click(selector):
        choose(page.locator(selector).first, touch)

    def capture(stage):
        result["stages"][stage] = layout(page)
        page.screenshot(path=output / f"{name}-{stage}.png")

    def mission_topic(topic, action=None):
        click(f'[data-agenda-topic="{topic}"]')
        if topic == "agenda-operations":
            return "operations"
        card = (page.locator(f'[data-action="{action}"]') if action else
                page.locator('#action-cards [data-action]:not(.defer-action):not([aria-disabled="true"])').first)
        action_id = card.get_attribute("data-action")
        choose(card, touch)
        click("#confirm-action")
        if page.locator("#negotiation-dialog[open]").count():
            click("[data-sign-agreement]")
        return action_id

    def resume(year):
        page.reload(wait_until="domcontentloaded")
        click("#continue-campaign")
        close_chapter(page, touch)
        heading = page.locator(".agenda-heading:visible").first
        heading.wait_for()
        assert str(year) in heading.inner_text(), heading.inner_text()

    try:
        page.goto(base, wait_until="domcontentloaded")
        page.locator('html[data-app-ready="true"]').wait_for(state="attached")
        for _ in range(3):
            lang = page.locator("html").get_attribute("lang").split("-")[0]
            if lang == language:
                break
            click("#start-language")
            page.wait_for_function("l=>document.documentElement.lang.split('-')[0]!==l", arg=lang)
        assert page.locator("html").get_attribute("lang").split("-")[0] == language
        result["title"] = page.title()
        result["build"] = page.locator("html").get_attribute("data-release-build")
        assert result["title"] and page.locator("#boot-error").is_hidden()
        click("#campaign-options > summary")
        page.locator("#budget-review-mode").uncheck()
        click('#start-form button[type="submit"]')
        bus_id = restored_year = None
        last_paid = None
        late_measures = []
        review = page.locator("#district-dialog[open] .restore-review")

        for turn in range(1, 21):
            year = 2025 + turn
            close_chapter(page, touch)
            header = page.locator(".agenda-heading:visible").first
            header.wait_for()
            assert str(year) in header.inner_text(), header.inner_text()
            restore = page.locator('.agenda-managed [data-restore-service*="school-bus"]')
            if turn == 1:
                action = mission_topic("school-neighbourhood", "school-bus")
            elif not restored_year and restore.count():
                bus_id = restore.get_attribute("data-restore-service")
                choose(restore, touch)
                assert review.is_visible()
                review_title = review.locator("h3").inner_text()
                price_values = review.locator(".renew-amounts dd").all_inner_texts()
                fee, timely_fee, annual, three_years = map(amount, price_values)
                assert fee > timely_fee > 0 and abs(three_years - 3 * annual) < 0.011, price_values
                costs = review.locator(".renew-amounts").inner_text()
                assert f"{year+1}–{year+3}" in costs, costs
                evidence = review.locator(".restore-evidence").inner_text()
                observations = re.findall(r"(20\d{2})\D+?(\d+(?:[.,]\d+)?)\s*%", evidence)
                assert len(observations) == 2, evidence
                last_paid = int(observations[0][0])
                assert last_paid < year and int(observations[1][0]) == year
                assert amount(observations[0][1]) > amount(observations[1][1]), evidence
                result["contract"] = {"district": review.locator(".dialog-eyebrow").inner_text(),
                                      "service":review_title, "year":year, "open":year+1,
                                      "fee":fee, "timelyFee":timely_fee, "annual":annual, "total":three_years,
                                      "evidence":evidence}
                capture("contract")
                click("[data-restore-cancel]")
                page.locator("#district-dialog").wait_for(state="hidden")
                assert not page.locator("dialog[open]").count(), "Returning should close the proposal"
                header.wait_for()
                choose(restore, touch)
                review.wait_for()
                choose(review.locator("[data-restore-confirm]"), touch)
                review.wait_for(state="hidden")
                restored_year = year
                action = "restore"
            elif turn >= 12:
                topic = next(t for t in LATE_TOPICS if page.locator(f'[data-agenda-topic="{t}"]').count())
                action = mission_topic(topic)
                late_measures.append([year, topic, action])
            else:
                action = mission_topic("agenda-operations")
            result["annualChoices"].append([year, action])
            if turn in (5, 10, 15):
                click("[data-course-close]")
            if restored_year == year:
                resume(year+1)
                click('[data-view="map"]:visible')
                click('#regional-atlas [data-world-place="suburb"]')
                pin = page.locator(f'#regional-atlas [data-world-project="{bus_id}"]')
                assert pin.count() == 1 and "active" in pin.get_attribute("class").split()
                result["mapLabel"] = pin.get_attribute("aria-label")
                assert {"ru":"автобус","en":"bus","zh":"校车"}[language] in result["mapLabel"].lower()
                capture("map")
                click('[data-world-view="residents"]:visible')
                atlas = page.locator(".resident-atlas")

                def check_district(district):
                    assert atlas.locator('[data-world-place][aria-pressed="true"]').get_attribute("data-world-place") == district
                    assert page.locator(".resident-story").get_attribute("data-district") == district
                    assert atlas.locator(".world-selection-copy strong").inner_text() in page.locator(".resident-place").inner_text()

                check_district("suburb")
                panel = page.locator("#secondary-stage")
                assert panel.evaluate("el => el.scrollWidth <= el.clientWidth + 1"), "Residents panel overflows horizontally"
                assert atlas.locator(".world-toolbar").evaluate("el => el.scrollWidth <= el.clientWidth + 1")
                choose(atlas.locator('[data-world-place="north"]'), touch)
                check_district("north")
                choose(atlas.locator(".world-inspect"), touch)
                assert page.locator(".resident-place h3").evaluate("el => el === document.activeElement")
                check_district("north")
                choose(atlas.locator(".world-accessible > summary"), touch)
                choose(atlas.locator('[data-world-access="river"]'), touch)
                check_district("river")
                choose(atlas.locator('[data-world-period="before"]'), touch)
                choose(atlas.locator('[data-world-tool="reset"]'), touch)
                check_district("river")
                capture("resident-district")
                click('[data-view="mission"]:visible')
        page.locator("#end-dialog[open]").wait_for()
        assert len(late_measures) >= 5 and late_measures[-1][0] == 2045
        result["lateMeasures"] = late_measures
        assert restored_year and last_paid, "no restoration observed"
        capture("ending")
        page.reload(wait_until="domcontentloaded")
        click("#continue-campaign")
        page.locator("#end-dialog[open]").wait_for()
        comparison = page.locator("#end-summary details.campaign-report")
        choose(comparison.locator("summary"), touch)
        compared_years = [text.split()[0] for text in comparison.locator("tbody th").all_inner_texts()]
        assert compared_years == [str(y) for y in (2030,2035,2040,2045) for _ in range(2)]
        actual_last, reference_last = comparison.locator("tbody tr").all_inner_texts()[-2:]
        result["northernCare"] = [actual_last, reference_last]
        table = comparison.locator(".report-table")
        assert table.evaluate("el=>el.scrollWidth <= el.clientWidth + 1")
        table.scroll_into_view_if_needed()
        capture("comparison")
        choose(comparison.locator("summary"), touch)
        click("#end-summary [data-learning-report]")
        report = page.locator("#learning-report[open]")
        assert "20/20" in report.locator(".report-heading").inner_text()
        register = report.locator(".report-table").nth(2).locator("tbody tr")
        assert register.count() == 20
        row = register.nth(restored_year-2026).locator("th,td").all_inner_texts()
        assert row[0] == str(restored_year) and RESTORE_LABEL[language].lower() in row[2].lower(), row
        assert amount(row[4]) == result["contract"]["fee"], row
        assert RESTORE_LABEL[language].lower() in row[5].lower() or language == "en" and "restoration" in row[5].lower(), row
        result["registerRow"] = row
        capture("report")
        assert not result["pageErrors"], result["pageErrors"]
        assert not result["httpErrors"], result["httpErrors"]
        result["status"] = "pass"
    except Exception:
        result["status"] = "fail"
        result["failure"] = traceback.format_exc()
        result["lastScreen"] = page.locator("body").inner_text()[-6000:]
        page.screenshot(path=output/f"{name}-failure.png", timeout=4000)
    finally:
        ctx.close()
        (output/f"{name}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(result["status"], name, flush=True)
    if result.get("failure"):
        print(result["failure"].rstrip(), flush=True)
    return result["status"] == "pass"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", help="Guest URL of a release on loopback")
    parser.add_argument("--engine", choices=["chromium","webkit","firefox"], default="chromium")
    parser.add_argument("--lang", choices=LANGUAGES, default="ru")
    parser.add_argument("--size", default="390x844")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    width, height = map(int,args.size.split("x"))
    with sync_playwright() as pw:
        b = getattr(pw,args.engine).launch()
        if args.base:
            success = run_management(b,args.base,args.output,width,height,args.lang)
        else:
            with LocalFixtureServer() as s:
                success = run_management(b,s.base+"apps/governor/index.html?context=free",
                                         args.output,width,height,args.lang)
        b.close()
    raise SystemExit(0 if success else 1)
