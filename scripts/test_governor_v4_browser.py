"""Real-browser acceptance of the four-term Governor campaign on loopback."""
from argparse import ArgumentParser
from math import ceil
from pathlib import Path
import json
import time

from playwright.sync_api import sync_playwright
from test_governor_browser import LocalFixtureServer, Suite, STUDENT_A
from test_governor_v3_browser import READY, WAIT, click, course_entry, data, fit, visible


def load_record(page, profile=None):
    return data(page, profile, 'course' if profile else 'free', edition='v4')


def choose_event(page):
    click(page, '[data-v3-tab="decisions"]')
    click(page, '[data-v3-action="event"]')
    click(page, '[data-v3-option="base"]')
    click(page, '[data-v3-action="save-event"]')


def set_locale(page, locale):
    if locale == 'ru':
        return
    click(page, '#v3-menu-toggle')
    visible(page, '[name="language"]').select_option(locale)
    page.wait_for_function("document.querySelector('#governor-v3').getAttribute('aria-busy') !== 'true'")
    click(page, '#v3-menu-toggle')


def plan_year(page):
    click(page, '[data-v3-action="advance"]')
    ok = visible(page, '[data-v3-action="commit"]')
    assert ok.is_enabled(), page.locator('#v3-main').inner_text()
    click(page, '[data-v3-action="commit"]')


def screenshot(page, root, name):
    page.screenshot(path=root / (name + '.png'), animations='disabled')


def assert_fit(page):
    size = fit(page)
    assert size['body'] <= size['width'] + 1, size


def first_year(page, profile, output):
    assert_fit(page)
    for _ in range(3):
        click(page, '[data-v3-action="welcome-next"]')
    choose_event(page)
    click(page, '[data-anchor="measure.select"]')
    assert page.locator('.v4-catalog [data-v3-measure]').count() == 22
    click(page, '[data-v3-measure="school-campus"]')
    click(page, '[data-v3-action="sites"]')
    district_map = page.locator('[data-v4-map-key="district:suburb"]')
    assert district_map.is_visible()
    click(page, '[data-v4-camera="in"]')
    click(page, '[data-v4-camera="reset"]')
    district_map.locator('[data-v3-site="bridge"]').click()
    page.wait_for_function("document.querySelector('[data-v3-action=accept-site]')?.dataset.siteId === 'bridge'")
    screenshot(page, output, 'site-choice')
    click(page, '[data-v3-action="accept-site"]')
    assert load_record(page, profile)['state']['draft']['measures'][0]['siteId'] == 'bridge'
    click(page, '[data-v3-tab="decisions"]')
    click(page, '[data-anchor="measure.select"]')
    click(page, '[data-v3-measure="school-bus"]')
    click(page, '[data-v3-action="v4-add"]')
    assert len(load_record(page, profile)['state']['draft']['measures']) == 2
    screenshot(page, output, 'year-plan')
    click(page, '[data-v3-tab="budget"]')
    slider = visible(page, '#v4-tax-rate')
    trial_cash = page.locator('#v4-tax-readout').inner_text()
    slider.press('ArrowRight')
    page.wait_for_function("document.querySelector('#v4-tax-value')?.textContent === '101%' && document.querySelector('#v3-tax-practice')")
    assert page.locator('#v4-tax-readout').inner_text() != trial_cash
    assert load_record(page, profile)['state']['draft']['taxRate'] == 101
    screenshot(page, output, 'tax-preview')
    assert page.locator('[data-v3-action="advance"]').and_(page.get_by_role('button')).count() == 1
    click(page, '[data-v3-action="loan"]')
    visible(page, '[name="loan-principal"]').fill('2800')
    click(page, '[data-v3-action="save-loan"]')
    assert load_record(page, profile)['state']['draft']['loan']['principal'] == 2800
    click(page, '[data-v3-action="loan"]')
    click(page, '[data-v3-action="remove-loan"]')
    click(page, '[data-v3-action="v4-fund"]')
    visible(page, '[name="investment-principal"]').fill('1000')
    visible(page, '[name="investment-term"]').select_option('3')
    assert '2029' in page.locator('#v4-investment-preview').inner_text()
    screenshot(page, output, 'fund-preview')
    click(page, '[data-v3-action="v4-save-fund"]')
    click(page, '[data-v3-tab="stats"]')
    goals = page.locator('.v4-goals').first
    assert goals.is_visible() and goals.locator('li').count() == 12
    assert '2030' in goals.inner_text()
    screenshot(page, output, 'first-term-targets')
    options = page.locator('[data-v3-action="tutorial-kpi"][data-v3-value="91"]')
    assert options.is_visible(), page.locator('[data-v3-school-question]').inner_text()
    options.click()
    plan_year(page)
    record = load_record(page, profile)
    assert record['state']['year'] == 2027
    assert len(record['state']['history'][-1]['measures']) == 2
    assert record['state']['history'][-1]['finance']['investmentContribution'] == 1000
    assert record['state']['history'][-1]['campaignKpis']
    assert_fit(page)
    click(page, '[data-v3-action="result-next"]')
    recent = record['state']['stats']['kpis']['school']['value']
    initial = record['state']['initialStats']['kpis']['school']['value']
    outcome = 'higher' if round(recent, 1) > round(initial, 1) else 'lower' if round(recent, 1) < round(initial, 1) else 'same'
    click(page, f'[data-v3-action="tutorial-kpi-change"][data-v3-value="{outcome}"]')
    click(page, '[data-v3-tab="map"]')
    visible(page, '[data-v3-district="suburb"]').click()
    campus = next(row for row in record['state']['projects'] if row['measureId'] == 'school-campus')
    click(page, '[data-v3-object="' + campus['id'] + '"]')
    assert page.locator('.v4-map-inspector').is_visible()
    return campus['id']


def full_campaign(page, profile, output, campus, locale):
    stages = []
    checkpoints = []
    for year in range(2027, 2046):
        choose_event(page)
        if year == 2029:
            assert page.locator('[data-v4-expiring] [data-v3-measure^="renew:"]').count() >= 1
        plan_year(page)
        record = load_record(page, profile)
        state = record['state']
        row = state['history'][-1]
        assert row['year'] == year and len(row['campaignKpis']) == 12
        finance = row['finance']
        assert finance['cashEnd'] == finance['cash'] + finance['totalIn'] - finance['totalOut']
        if year == 2029:
            assert finance['investmentPrincipal'] == 1000 and finance['investmentIncome'] == 120
        if year <= 2030:
            stages.append(next(project['status'] for project in row['projects'] if project['id'] == campus))
        if year in (2030, 2035, 2040):
            goals = page.locator('.v4-goals').first
            assert str(year) in goals.inner_text()
            screenshot(page, output, f'checkpoint-{year}')
            page.reload()
            page.locator(READY).wait_for(state='attached', timeout=WAIT)
            assert str(year) in page.locator('.v4-goals').first.inner_text()
            click(page, '[data-v3-action="result-next"]')
            click(page, '[data-anchor="measure.select"]')
            counts = page.locator('.v4-catalog [data-v3-measure]').count()
            # Finished services can add renewal and restoration actions outside chapter quotas.
            assert counts >= {2030: 22, 2035: 23, 2040: 22}[year]
            checkpoints.append({'year': year, 'visible_measures_including_maintenance': counts})
        elif year < 2045:
            click(page, '[data-v3-action="result-next"]')
    assert stages == ['frame', 'frame', 'finishing', 'open'], stages
    assert state['completed'] and len(state['history']) == 20 and state['year'] == 2045
    assert page.locator('[data-v3-action="advance"]').count() == 0
    assert page.locator('.v4-goals').first.is_visible()
    screenshot(page, output, 'final')
    score = record['submission']['governor']['assessment']
    assert abs(score['points'] - max(score['paths'].values())) < .011
    journal_score = None
    if profile:
        # This seeded campaign must exercise a fractional result end to end.
        assert score['points'] != ceil(score['points'])
        journal_score = ceil(score['points'])
        assert record['submission']['points'] == journal_score
        page.wait_for_function("Object.keys(JSON.parse(localStorage.getItem('rudn.grades.v2')||'{}')).length === 1")
        grades = page.evaluate("student => JSON.parse(localStorage.getItem('rudn.grades.v2'))[student]", profile['studentKey'])
        assert grades['seminar-7']['points'] == journal_score
        label = {'ru': 'Балл в журнале', 'en': 'Gradebook score', 'zh': '成绩册分数'}[locale]
        row = page.locator('.v3-line').filter(has_text=label)
        assert row.locator('strong').inner_text() == f'{journal_score} / 5'
        assert float(page.locator('.v3-score').evaluate('element => element.firstChild.textContent').replace(',', '.')) == score['points']
    first_attempt = state['attemptId']
    click(page, '[data-v3-action="v4-restart"]')
    assert load_record(page, profile)['state']['attemptId'] != first_attempt
    choose_event(page)
    assert load_record(page, profile)['state']['draft']['eventChoice'] == 'base'
    return {'years': 20, 'checkpoints': checkpoints, 'construction': stages, 'score': score['points'],
            'scores': score['paths'], 'journal_score': journal_score, 'replay_first_decision': True}


def main():
    parser = ArgumentParser()
    parser.add_argument('--engine', choices=['chromium', 'webkit', 'firefox'], default='chromium')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--full', action='store_true')
    parser.add_argument('--first-year', action='store_true')
    parser.add_argument('--locale', choices=['ru', 'en', 'zh'], default='ru')
    args = parser.parse_args()
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with sync_playwright() as pw, LocalFixtureServer() as server:
        browser = getattr(pw, args.engine).launch()
        suite = Suite(browser, server, output)
        profile = STUDENT_A if args.full else None
        context = suite.context(390 if args.full else 320, 844 if args.full else 568, profile=profile)
        # Touch pointer and real keyboard remain available together.
        page = context.new_page()
        if profile:
            course_entry(page, server, edition='v4')
        else:
            page.goto(server.base + 'apps/governor/index.html?context=free')
            page.locator(READY).wait_for(state='attached', timeout=WAIT)
            click(page, '[data-v3-action="start"]')
        set_locale(page, args.locale)
        campus = first_year(page, profile, output)
        report = full_campaign(page, profile, output, campus, args.locale) if args.full else {'years': 1}
        assert not suite.current.get('page_errors'), suite.current
        report.update(status='pass', browser=browser.version, engine=args.engine, seconds=round(time.monotonic()-started, 2),
                      locale=args.locale, profile='synthetic local student' if profile else 'guest')
        (output / 'receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(report)
        browser.close()


if __name__ == '__main__':
    main()
