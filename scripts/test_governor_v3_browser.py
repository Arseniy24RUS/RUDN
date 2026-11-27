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


def data(page, profile, context):
    owner = 'student:' + profile['studentKey'] if profile else 'guest:governor'
    return page.evaluate("""([owner,context])=>new Promise((resolve,reject)=>{
      const req=indexedDB.open('rudn-governor-v3',1);
      req.onupgradeneeded=()=>{req.result.createObjectStore('attempts')};
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction('attempts','readonly');
        const get=tx.objectStore('attempts').get(JSON.stringify([owner,context,'governor-v3']));
        get.onsuccess=()=>resolve(get.result??null);
        get.onerror=()=>reject(get.error);
        tx.oncomplete=()=>db.close();
      };
    })""", [owner,context])


def fit(page):
    return page.evaluate("""()=>{
      const root=document.documentElement, host=document.querySelector('#governor-v3');
      return {width:root.clientWidth, body:root.scrollWidth, playWidth:host.getBoundingClientRect().width,
              playHeight:host.getBoundingClientRect().height};
    }""")


def course_entry(page, server):
    page.goto(server.base + '#activity/seminar-7', wait_until='domcontentloaded')
    link=page.get_by_role('link',name='Открыть симулятор',exact=True)
    assert link.get_attribute('target') != '_blank'
    assert link.evaluate('node=>node.href')==server.base+'apps/governor/index.html'
    link.click()
    page.locator(READY).wait_for(state='attached',timeout=WAIT)


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
    parse.add_argument('--first-measure',choices=['school-campus','school-bus','second-shift','defer'],default='school-campus')
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
                guest.goto(server.base+'apps/governor/index.html?context=free')
                guest.locator(READY).wait_for(state='attached')
                click(guest,'[data-v3-action=start]')
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
    url=server.base+'apps/governor/index.html'
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
    for index in range(number):
        if offline_final and index==19:
            click(page,'[data-v3-action=menu]')
            page.locator('#offline-status[data-platform-offline=ready]').wait_for(timeout=120000)
            click(page,'[data-v3-action=back]')
            page.context.set_offline(True)
        close_year(page,index,out,first_measure)
        record=snapshot(page,profile,context)
        assert len(record['state']['history'])==index+1,record['state']['year']
        validate_year(record['state']['history'][-1])


def close_year(page, index, out, first_measure):
    click(page,'[data-v3-action=event]')
    click(page,'[data-v3-option=base]')
    click(page,'[data-v3-action=save-event]')
    click(page,'[data-v3-action=measures]')
    measure=first_measure if index==0 else 'defer'
    click(page,'[data-v3-action=defer]' if measure=='defer' else '[data-v3-measure='+measure+']')
    if index == 0:
        if measure=='school-campus':
            click(page,'[data-v3-action=sites]')
            click(page,'[data-v3-site=yard]')
            click(page,'[data-v3-action=accept-site]')
        else:
            click(page,'[data-v3-tab=map]')
            click(page,'[data-v3-object=old-school]')
        click(page,'[data-v3-tab=budget]')
        page.screenshot(path=out/'first-budget.png')
        click(page,'[data-v3-tab=stats]')
    click(page,'[data-v3-action=advance]')
    if index == 0:
        page.screenshot(path=out/'first-review.png')
    if index==0:
        visible(page,'[data-v3-action=commit]').dblclick(timeout=WAIT)
        page.wait_for_function("document.querySelector('#governor-v3').getAttribute('aria-busy') !== 'true'",timeout=WAIT)
    else:
        click(page,'[data-v3-action=commit]')
    if index == 0:
        page.screenshot(path=out/'first-result.png')
    if index < 19:
        click(page,'[data-v3-action=result-next]')
        if index==0:
            click(page,'[data-v3-tab=map]')
            click(page,'[data-v3-object=old-school]')
        click(page,'[data-v3-tab=decisions]')


if __name__=='__main__':main()
