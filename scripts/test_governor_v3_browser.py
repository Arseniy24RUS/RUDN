"""Drive Governor V3 through its existing section 7 and free-play entry points."""
from argparse import ArgumentParser
from pathlib import Path
import json

from playwright.sync_api import sync_playwright
from test_governor_browser import LocalFixtureServer, STUDENT_A, STUDENT_B, Suite

HOST = '#governor-v3'
READY = 'html[data-app-ready=true]'
WAIT = 15000


def visible(page, css):
    return page.locator(HOST + ' ' + css + ':visible').first


def click(page, css):
    button = visible(page, css)
    button.click(timeout=WAIT)
    page.wait_for_function("document.querySelector('#governor-v3').getAttribute('aria-busy') !== 'true'", timeout=WAIT)


def data(page, profile, context, edition="v3"):
    owner = 'student:' + profile['studentKey'] if profile else 'guest:governor'
    return page.evaluate("""([owner,context,edition])=>new Promise((resolve,reject)=>{
      const req=indexedDB.open('rudn-governor-v3',1);
      req.onupgradeneeded=()=>{req.result.createObjectStore('attempts')};
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction('attempts','readonly');
        const get=tx.objectStore('attempts').get(JSON.stringify([owner,context,'governor-'+edition]));
        get.onsuccess=()=>resolve(get.result??null);
        get.onerror=()=>reject(get.error);
        tx.oncomplete=()=>db.close();
      };
    })""", [owner,context,edition])


def fit(page):
    return page.evaluate("""()=>{
      const root=document.documentElement, host=document.querySelector('#governor-v3');
      return {width:root.clientWidth, body:root.scrollWidth, playWidth:host.getBoundingClientRect().width,
              playHeight:host.getBoundingClientRect().height};
    }""")


def course_entry(page, server, edition="v3"):
    page.goto(server.base + '#activity/seminar-7', wait_until='domcontentloaded')
    link=page.get_by_role('link',name='Открыть симулятор',exact=True)
    assert link.get_attribute('target') != '_blank'
    assert link.evaluate('node=>node.href')==server.base+'apps/governor/index.html'
    cover=page.locator('#app .governor-seminar .activity-header img')
    assert cover.evaluate("async image=>{await image.decode();return image.naturalWidth>0&&getComputedStyle(image).objectFit==='contain'}")
    if edition == "v3":
        page.goto(link.get_attribute("href") + "?edition=v3")
    else:
        link.click()
    page.locator(READY).wait_for(state='attached',timeout=WAIT)


def toggle_menu_return(page, return_to):
    toggle='.v3-header [data-v3-action=menu]'
    click(page,toggle)
    visible(page,toggle+'[aria-expanded="true"]').wait_for(timeout=WAIT)
    click(page,toggle)
    visible(page,toggle+'[aria-expanded="false"]').wait_for(timeout=WAIT)
    visible(page,return_to).wait_for(timeout=WAIT)


def complete_welcome(page, profile, context, output, reload_welcome=False):
    before=data(page,profile,context)
    for step in range(1,4):
        if step==2 and reload_welcome:
            page.reload(wait_until='domcontentloaded')
            page.locator(READY).wait_for(state='attached',timeout=WAIT)
        screen=visible(page,f'[data-v3-welcome="{step}"]')
        screen.wait_for(timeout=WAIT)
        assert not visible(page,'[data-v3-action="event"]').count()
        assert not visible(page,'.v3-navigation').count()
        if reload_welcome:
            if step==1:
                toggle_menu_return(page,'[data-v3-welcome="1"]')
            page.screenshot(path=output/f'welcome-step-{step}.png')
        click(page,'[data-v3-action="welcome-next"]')
    visible(page,'[data-v3-action="event"]').wait_for(timeout=WAIT)
    after=data(page,profile,context)
    assert after['ui']['welcomeStep']==4
    assert before['state']==after['state'] and before['draws']==after['draws']
    if reload_welcome:
        click(page,'[data-v3-action="menu"]')
        click(page,'[data-v3-action="welcome-replay"]')
        for step in range(1,4):
            visible(page,f'[data-v3-welcome="{step}"]').wait_for(timeout=WAIT)
            click(page,'[data-v3-action="welcome-next"]')
        visible(page,'[data-v3-action="welcome-replay"]').wait_for(timeout=WAIT)
        click(page,'[data-v3-action="back"]')
        assert data(page,profile,context)['state']==before['state']
    return {'steps':3,'savedStep':after['ui']['welcomeStep'],'reloaded':reload_welcome}


def validate_year(row):
    finance=row['finance']
    assert finance['cashEnd']==finance['cash']+finance['totalIn']-finance['totalOut']
    assert finance['cashEnd']>=0
    assert len({x['id'] for x in finance['operations']})==len(finance['operations'])
    assert row['year']==row['event']['year']


def main():
    parse=ArgumentParser(description=__doc__)
    parse.add_argument('--engine', choices=['chromium','firefox','webkit'], default='chromium')
    parse.add_argument('--output', type=Path, required=True)
    parse.add_argument('--first-year', action='store_true')
    parse.add_argument('--offline-final', action='store_true')
    parse.add_argument('--lost-receipt', action='store_true')
    parse.add_argument('--first-measure',choices=['school-campus','school-bus','second-shift','outreach','defer'],default='school-campus')
    args=parse.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    receipts={}
    with sync_playwright() as pw, LocalFixtureServer() as server:
        browser=getattr(pw,args.engine).launch()
        suite=Suite(browser,server,args.output)
        contexts=[]
        try:
            for profile in (STUDENT_A, STUDENT_B):
                ctx=suite.context(390,844,profile=profile);contexts.append(ctx)
                if args.lost_receipt and profile is STUDENT_A:
                    def inject(route):
                        response=route.fetch()
                        route.fulfill(response=response,body=response.text()+'''
                        const saveV3ForTest=backend.saveAttempt.bind(backend);
                        backend.saveAttempt=async attempt=>{
                          const saved=await saveV3ForTest(attempt);
                          if(attempt.draftMode==='governor-v3'&&!sessionStorage.getItem('qa-lost-v3-receipt')){
                            sessionStorage.setItem('qa-lost-v3-receipt','yes');
                            throw new Error('test: connection lost after durable result');
                          }
                          return saved;
                        };
                        ''')
                    ctx.route('**/assets/js/backend.js*',inject)
                p=ctx.new_page()
                course_entry(p,server)
                record=data(p,profile,'course')
                assert record and record['state']['event']['eventId']==record['draws'][0]['eventId']
                assert p.locator('body.governor-v3-active').count()==1
                rect=fit(p)
                assert rect['body']<=rect['width']+1,rect
                assert p.locator(HOST+' svg.v3-map').count()==0
                p.screenshot(path=args.output/(profile['studentKey']+'-entry.png'))
                receipts[profile['studentKey']]={'firstEvent':record['draws'][0]['eventId'],'owner':record['owner'],
                    'chosenBeforeReveal':record['recordRevision'], 'view':rect,'economy':record['state']['finance'],'initial':record['state']['initialStats']}
                if profile is STUDENT_B:continue
                course=p
            left,right=receipts.values()
            assert left['economy']==right['economy'] and left['initial']==right['initial']
            first_saved=data(course,STUDENT_A,'course')
            assert first_saved['state']['draft']['eventChoice'] is None
            receipts['courseWelcome']=complete_welcome(course,STUDENT_A,'course',args.output,reload_welcome=True)
            click(course,'[data-v3-tab=advisor]')
            click(course,'[data-v3-action=ask-navigation]')
            course.get_by_text('Сначала ответьте на ситуацию года.',exact=False).wait_for(timeout=WAIT)
            click(course,'[data-v3-tab=decisions]')
            play(course,args.first_year,args.output,data,STUDENT_A,'course',offline_final=args.offline_final,first_measure=args.first_measure)
            if not args.first_year:
                final=data(course,STUDENT_A,'course')
                receipts['courseFinal']=verify_completed(course,final,STUDENT_A)
                if args.lost_receipt:
                    assert course.evaluate("sessionStorage.getItem('qa-lost-v3-receipt')")== 'yes'
                    receipts['lostReceiptInjected']=True
                if args.offline_final:
                    assert not course.evaluate('navigator.onLine')
                    course.context.set_offline(False)
                course.reload(wait_until='domcontentloaded')
                course.locator(READY).wait_for(state='attached')
                receipts['afterReopen']=verify_completed(course,data(course,STUDENT_A,'course'),STUDENT_A)
                assert receipts['afterReopen']==receipts['courseFinal']
                course.screenshot(path=args.output/'course-final.png')
                ctx=suite.context(390,844,profile=None);contexts.append(ctx)
                guest=ctx.new_page()
                guest.goto(server.base+'apps/governor/index.html?context=free&edition=v3')
                guest.locator(READY).wait_for(state='attached')
                toggle_menu_return(guest,'[data-v3-action="start"]')
                click(guest,'[data-v3-action=start]')
                receipts['guestWelcome']=complete_welcome(guest,None,'free',args.output)
                click(guest,'[data-v3-tab=advisor]')
                click(guest,'[data-v3-action=ask-compare]')
                guest.get_by_text('У проектов сравните цену запуска',exact=False).wait_for(timeout=WAIT)
                click(guest,'[data-v3-tab=decisions]')
                play(guest,False,args.output,data,None,'free')
                receipts['guestFinal']=verify_completed(guest,data(guest,None,'free'),None)
                guest.screenshot(path=args.output/'guest-final.png')
            receipts['closedYears']=len(data(course,STUDENT_A,'course')['state']['history'])
            receipts['browserVersion']=browser.version
            if not args.first_year:
                receipts['gates']=access_gates(suite,server)
            assert not suite.current.get('page_errors'),suite.current
        finally:
            for ctx in contexts:ctx.close()
            browser.close()
    (args.output/'receipt.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2)+'\n')


def access_gates(suite, server):
    url=server.base+'apps/governor/index.html?edition=v3'
    checks=[]
    for kind,profile,role,access in (
        ('guest',None,'student','open'),
        ('closed',STUDENT_A,'student','closed'),
        ('instructor',None,'teacher','open'),
    ):
        ctx=suite.context(390,844,profile=profile,role=role,access=access)
        try:
            page=ctx.new_page();page.goto(url,wait_until='domcontentloaded')
            if kind=='instructor':
                page.locator(READY).wait_for(state='attached')
                assert page.locator(HOST).is_visible()
                assert page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rudn.attempt.v2:')).length")==0
            else:
                loading=page.locator('#platform-loading-text')
                text='Войдите в существующий профиль' if kind=='guest' else 'Раздел 7 закрыт преподавателем.'
                page.wait_for_function("text=>document.querySelector('#platform-loading-text').textContent.includes(text)",arg=text)
                assert loading.is_visible() and not page.locator(HOST).is_visible()
            checks.append(kind)
        finally:ctx.close()
    return checks


def verify_completed(page, record, profile):
    state=record['state']
    assert state['completed'] and state['year']==2045
    page.locator(HOST+' .v3-score').wait_for(state='visible')
    assert page.get_by_role('button',name='К играм' if profile is None else 'Выйти в семинар').is_visible()
    assert len(record['draws'])==len(state['history'])==20
    assert len({r['eventId'] for r in record['draws']})==20
    if profile:
        page.wait_for_function("(id)=>Object.entries(localStorage).some(([k,v])=>k.startsWith('rudn.attempt.v2:')&&JSON.parse(v).id===id)",arg=state['attemptId'],timeout=WAIT)
    mirror=page.evaluate('''() => ({
      attempts:Object.entries(localStorage).filter(([k])=>k.startsWith('rudn.attempt.v2:')).map(([,v])=>JSON.parse(v)),
      grades:JSON.parse(localStorage.getItem('rudn.grades.v2')||'{}')
    })''')
    cohort=[a for a in mirror['attempts'] if a['activitySlug']=='seminar-7']
    if profile:
        assert len(cohort)==1 and cohort[0]['id']==state['attemptId']
        report=cohort[0]['governor']
        criteria=report['assessment']['criteria']
        assert len(criteria)==5 and abs(sum(c['points'] for c in criteria)-cohort[0]['points'])<1e-8
        assert mirror['grades'][profile['studentKey']]['seminar-7']['points']==cohort[0]['points']
        assert cohort[0]['studentKey']==profile['studentKey']
    else:
        assert not cohort and not mirror['grades']
    return {'attemptId':state['attemptId'],'closedYears':len(state['history']),'journalRecords':len(cohort),
            'score':record['submission']['points'],'checks':len(record['submission']['governor']['assessment']['criteria'])}


def play(page, first_year, out, snapshot, profile, context, offline_final=False, first_measure='school-campus'):
    """Close years by exercising the same review and confirmation controls as a player."""
    number=1 if first_year else 20
    def current(): return snapshot(page,profile,context)
    for index in range(number):
        if offline_final and index==19:
            click(page,'[data-v3-action=menu]')
            page.locator('html[data-platform-offline=ready]').wait_for(state='attached',timeout=120000)
            assert page.locator("#offline-status").count() == 0
            click(page,'[data-v3-action=back]')
            page.context.set_offline(True)
        close_year(page,index,out,first_measure,current)
        record=current()
        assert len(record['state']['history'])==index+1,record['state']['year']
        year=record['state']['history'][-1]
        validate_year(year)
        if index==0 and first_measure=='outreach':
            assert year['measure']['measureId']=='outreach' and year['measure']['districtId']=='river'


def school_percent(page, stats):
    value=stats['kpis']['school']['value']
    return page.evaluate('(value)=>Number(value.toFixed(1))',value)


def practice_budget_and_stats(page, out, current):
    click(page,'[data-v3-tab=budget]')
    before=current()
    original=before['state']['draft']['taxMode']
    change='high' if original!='high' else 'moderate'
    click(page,f'[data-v3-tax="{original}"]')
    assert current()['ui']['tutorialStep']==5
    click(page,f'[data-v3-tax="{change}"]')
    after=current()
    assert after['state']['draft']['taxMode']==change and after['ui']['tutorialStep']==6
    exercise=after['ui']['taxPractice']
    assert exercise['from']==original and exercise['to']==change
    assert exercise['taxesBefore']!=exercise['taxesAfter'] and exercise['cashBefore']!=exercise['cashAfter']
    page.screenshot(path=out/'first-budget.png')
    click(page,'[data-v3-action="restore-tutorial-tax"]')
    assert current()['state']['draft']['taxMode']==original

    click(page,'[data-v3-tab=stats]')
    assert current()['ui']['tutorialStep']==6
    percentage=school_percent(page,before['state']['initialStats'])
    answer='[data-v3-action="tutorial-kpi"]'
    click(page,answer+f':not([data-v3-value="{percentage:g}"])')
    assert current()['ui']['tutorialStep']==6
    click(page,answer+f'[data-v3-value="{percentage:g}"]')
    assert current()['ui']['tutorialStep']==7
    page.screenshot(path=out/'first-stats-practice.png')


def close_year(page, index, out, first_measure, current=None):
    click(page,'[data-v3-action=event]')
    click(page,'[data-v3-option=base]')
    if index==0:
        toggle_menu_return(page,'[data-v3-option="base"][aria-pressed="true"]')
    click(page,'[data-v3-action=save-event]')
    click(page,'[data-v3-action=measures]')
    measure=first_measure if index==0 else 'defer'
    if measure=='outreach':
        page.get_by_role('heading',name='Район · Речная долина',exact=True).wait_for(timeout=WAIT)
    click(page,'[data-v3-action=defer]' if measure=='defer' else '[data-v3-measure='+measure+']')
    if index == 0:
        current=current or (lambda: data(page,None,'free'))
        if measure!='defer':
            before_menu=current()
            toggle_menu_return(page,'.v3-project-art')
            after_menu=current()
            assert after_menu['ui']['panel']=='project' and before_menu['state']==after_menu['state']
        assert not visible(page,'[data-v3-action=budget]').count()
        if measure=='school-campus':
            click(page,'[data-v3-tab=map]')
            click(page,'[data-v3-object=old-school]')
            incomplete=current()
            assert incomplete['ui']['tutorialStep']==4 and incomplete['state']['draft']['siteId'] is None
            click(page,'[data-v3-action=advance]')
            assert not visible(page,'[data-v3-action=commit]').is_enabled()
            click(page,'[data-v3-fix=site-required]')
            click(page,'[data-v3-site=yard]')
            click(page,'[data-v3-action=accept-site]')
        else:
            click(page,'[data-v3-tab=map]')
            click(page,'[data-v3-action=tutorial-school]' if measure=='outreach' else '[data-v3-object=old-school]')
        practice_budget_and_stats(page,out,current)
    click(page,'[data-v3-action=advance]')
    if index == 0:
        page.screenshot(path=out/'first-review.png')
    if index==0:
        visible(page,'[data-v3-action=commit]').dblclick(timeout=WAIT)
        page.wait_for_function("document.querySelector('#governor-v3').getAttribute('aria-busy') !== 'true'",timeout=WAIT)
    else:
        click(page,'[data-v3-action=commit]')
    if index == 0:
        report=current()
        toggle_menu_return(page,'.v3-year-result')
        assert current()['state']==report['state']
        page.screenshot(path=out/'first-result.png')
    if index < 19:
        click(page,'[data-v3-action=result-next]')
        if index==0:
            after=current()
            state=after['state']
            previous=school_percent(page,state['initialStats'])
            actual=school_percent(page,state['history'][-1]['stats'])
            direction='higher' if actual>previous else 'lower' if actual<previous else 'same'
            assert after['ui']['tutorialStep']==9
            click(page,f'[data-v3-action="tutorial-kpi-change"][data-v3-value="{direction}"]')
            assert current()['ui']['tutorialStep']==10
            click(page,'[data-v3-tab=map]')
            if measure=='outreach':
                project_id=state['history'][-1]['measure']['id']
                click(page,f'[data-v3-object="{project_id}"]')
            else:
                click(page,'[data-v3-object=old-school]')
        click(page,'[data-v3-tab=decisions]')


if __name__=='__main__':main()
