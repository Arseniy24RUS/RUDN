"""Exercise Governor commitments and the tax lesson through actual mobile browser input."""
from argparse import ArgumentParser
from pathlib import Path
from time import monotonic
import json

from playwright.sync_api import sync_playwright
from test_governor_browser import LocalFixtureServer, Suite
from test_governor_v3_browser import READY, WAIT, click
from test_governor_v4_browser import choose_event, construction_catalogue, load_record, set_locale


def negotiate(page, height):
    section = page.locator('[data-v4-negotiation]')
    assert section.locator('[data-v4-neg-actor]').count() == 3
    assert section.locator('[data-v4-neg-offer]').count() == 2
    controls = page.evaluate("""() => {
      const scroller=document.querySelector('.v3-content');
      const bounds=scroller.getBoundingClientRect();
      return [...scroller.querySelectorAll('[data-v4-neg-offer], [data-v4-neg-confirm]')].map(control=>{
        const r=control.getBoundingClientRect();
        const visible=r.top>=bounds.top&&r.bottom<=bounds.bottom;
        return {visible,unobstructed:control.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))};
      });
    }""")
    if height >= 844:
        assert all(item['visible'] and item['unobstructed'] for item in controls), controls
    else:
        right_offer = section.locator('[data-v4-neg-offer]').nth(1)
        # One normal viewport movement is enough to reach the second offer.
        if not controls[1]['visible']:
            page.locator('.v3-content').evaluate('node => node.scrollBy(0, node.clientHeight * .75)')
        assert right_offer.evaluate("""node=>{
          const rect=node.getBoundingClientRect();
          return node.contains(document.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2));
        }""")
    for selector in ('[data-v4-neg-actor="finance"]', '[data-v4-neg-offer]:not([disabled])', '[data-v4-neg-confirm]'):
        section.locator(selector).first.tap()
        page.wait_for_function("""!document.querySelector('[data-v4-negotiation]') ||
          document.querySelector('[data-v4-negotiation]').getAttribute('aria-busy')!=='true'""")
    assert not section.count()
    pledge = load_record(page)['state']['draft']['measures'][0]['promise']
    assert pledge['type'] == 'reserve', pledge
    assert page.locator('.v4-neg-summary').is_visible()
    assert page.locator('#governor-v3').get_attribute('data-v3-tab') == 'map'
    return controls, pledge


def tax_tap(page):
    click(page, '[data-v3-tab="budget"]')
    slider = page.locator('#v4-tax-rate')
    slider.scroll_into_view_if_needed()
    before = load_record(page)['state']['draft']['taxRate']
    box = slider.bounding_box()
    assert before == 100 and box and box['width'] > 160
    page.touchscreen.tap(box['x'] + box['width'] * .79, box['y'] + box['height'] * .49)
    assert int(slider.input_value()) > before
    # An immediate touch on Tutorial must retain the previewed value, even if
    # the browser has not dispatched a conventional change event for the range.
    page.locator('[data-v3-action="advance"]').tap()
    page.wait_for_function("document.querySelector('#governor-v3').dataset.v3Tab==='stats'")
    record = load_record(page)
    assert record['state']['draft']['taxRate'] > before and record['ui']['tutorialStep'] == 6
    return record['state']['draft']['taxRate']


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['chromium','webkit'], default='chromium')
    parser.add_argument('--locale', choices=['ru','en','zh'], default='ru')
    parser.add_argument('--viewport', choices=['320x568','390x844'], default='390x844')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    width, height = map(int,args.viewport.split('x'))
    started = monotonic()
    with sync_playwright() as pw, LocalFixtureServer() as server:
        browser = getattr(pw,args.engine).launch()
        suite = Suite(browser,server,args.output)
        context = browser.new_context(viewport={'width':width,'height':height},has_touch=True,
                                      is_mobile=True,locale='ru-RU',reduced_motion='reduce')
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(server.origin+'/') else route.abort())
        context.on('page',suite.observe)
        page = context.new_page()
        page.goto(server.base+'apps/governor/index.html?context=free')
        page.locator(READY).wait_for(state='attached',timeout=WAIT)
        click(page,'[data-v3-action="start"]')
        set_locale(page,args.locale)
        for _ in range(3):
            click(page,'[data-v3-action="welcome-next"]')
        choose_event(page)
        construction_catalogue(page)
        click(page,'[data-v3-measure="school-campus"]')
        click(page,'[data-v3-action="sites"]')
        page.locator('[data-v4-map-key="district:suburb"] [data-v3-site="bridge"]').click()
        click(page,'[data-v3-action="accept-site"]')
        click(page,'[data-v3-action="negotiate"]')
        page.locator('[data-v4-neg-back]').tap()
        assert page.locator('#governor-v3').get_attribute('data-v3-tab') == 'map'
        assert not load_record(page)['state']['draft']['measures'][0]['promise']
        click(page,'[data-v3-action="negotiate"]')
        page.screenshot(path=args.output/'meeting.png')
        controls, pledge = negotiate(page,height)
        after = tax_tap(page)
        page.screenshot(path=args.output/'statistics-after-tax-touch.png')
        assert not suite.current.get('page_errors'),suite.current
        report = {'status':'pass','engine':args.engine,'browser':browser.version,'locale':args.locale,'viewport':[width,height],
                  'real_touch_count_to_accept':3,'controls_at_entry':controls,'draft_commitment':pledge,
                  'retained_tax_rate':after,'seconds':round(monotonic()-started,2)}
        (args.output/'receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        context.unroute_all(behavior='wait')
        context.close()
        browser.close()


if __name__=='__main__':
    main()
