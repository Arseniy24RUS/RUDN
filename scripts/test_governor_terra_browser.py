"""Check the Governor advisor's browser round trip with local synthetic identities."""
import json

from playwright.sync_api import sync_playwright
from test_governor_browser import LocalFixtureServer, STUDENT_A
from test_governor_v3_browser import READY, WAIT, click, visible


def configure_context(browser, server, role):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True,
                                  locale='ru-RU', service_workers='block')
    profile = STUDENT_A if role == 'student' else None
    context.add_init_script(
        "localStorage.setItem('qa.native.local-only'," + json.dumps(json.dumps({'role': role})) + ");"
        "localStorage.setItem('rudn.profile.v1'," + json.dumps(json.dumps(profile)) + ");"
        "localStorage.setItem('rudn.locale','ru');"
    )
    posted = []
    endpoint = server.origin + '/RUDN/qa/advisor'

    def use_fixture(route):
        url = route.request.url
        if url == endpoint:
            assert route.request.headers.get('authorization') == 'Bearer synthetic-advisor-fixture'
            posted.append(route.request.post_data_json)
            if role == 'student' and len(posted) == 1:
                route.fulfill(status=503, json={'error': {'code': 'provider-unavailable'}})
            else:
                route.fulfill(json={'model': 'gpt-6.1-terra', 'intent': 'unknown',
                                    'answer': 'Сравните доступность услуг до и после решения.'})
        elif not url.startswith(server.origin + '/'):
            route.abort()
        elif '/assets/js/config.js?' in url:
            response = route.fetch()
            original = response.text()
            start = original.index('governorAdvisorUrl:')
            end = original.index(',', start)
            result = original[:start] + 'governorAdvisorUrl: ' + json.dumps(endpoint) + original[end:]
            route.fulfill(response=response, body=result)
        elif '/assets/js/backend.js?' in url:
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + """
                const qaAdvisorInit = backend.init;
                backend.init = async () => {
                  const result = await qaAdvisorInit();
                  backend.user.getIdToken = async () => 'synthetic-advisor-fixture';
                  return result;
                };
            """)
        else:
            route.continue_()

    context.route('**/*', use_fixture)
    return context, posted


def open_advisor(context, server):
    page = context.new_page()
    page.goto(server.base + 'apps/governor/index.html?context=free')
    page.locator(READY).wait_for(state='attached', timeout=WAIT)
    click(page, '[data-v3-action="start"]')
    for _ in range(3):
        click(page, '[data-v3-action="welcome-next"]')
    click(page, '[data-v3-tab="advisor"]')
    return page


def ask(page, question):
    visible(page, '#v3-question').fill(question)
    click(page, '#v3-chat button[type=submit]')


def main():
    question = 'Как понять, удаётся ли сократить разницу между районами?'
    reply = 'Сравните доступность услуг до и после решения.'
    with sync_playwright() as playwright, LocalFixtureServer() as server:
        browser = playwright.chromium.launch()
        for role in ('student', 'teacher', 'guest'):
            context, posted = configure_context(browser, server, role)
            page = open_advisor(context, server)
            ask(page, question)
            if role == 'guest':
                page.locator('.v3-chat-answer').get_by_text('Для беседы с ИИ-советником', exact=False).wait_for(timeout=WAIT)
                assert not posted
            else:
                if role == 'student':
                    click(page, '[data-v3-advice-retry="0"]')
                    page.get_by_text(reply, exact=True).wait_for(timeout=WAIT)
                    first, second = posted
                    assert first['requestId'] != second['requestId']
                    assert {k: v for k, v in first.items() if k != 'requestId'} == {
                        k: v for k, v in second.items() if k != 'requestId'
                    }
                    assert second['studentKey'] == STUDENT_A['studentKey']
                else:
                    page.get_by_text(reply, exact=True).wait_for(timeout=WAIT)
                    assert len(posted) == 1 and posted[0]['studentKey'] is None
                assert posted[-1]['question'] == question and posted[-1]['gameContext']
                ask(page, 'Что сравнить первым?')
                page.get_by_text(reply, exact=True).last.wait_for(timeout=WAIT)
                page.wait_for_function("document.querySelectorAll('.v3-chat-answer > p').length === 2")
                assert posted[-1]['history'] == [{'question': question, 'answer': reply}]
                assert visible(page, '[data-v3-advice-retry="0"]').count() == 0
            context.close()
        browser.close()
    print('Governor advisor browser round trip passed for student, instructor, and guest.')


if __name__ == '__main__':
    main()
