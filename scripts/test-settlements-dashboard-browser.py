"""Bounded component test: extracted current renderDashboard and real receipt helper.

Backend, durable store, access context and course catalogue are synthetic fixtures.
This is NOT a live site, Firebase check or student evidence. Browser plugin/browser
skill not available; project-authorized ordinary Playwright fallback. No installs.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import argparse, hashlib, json, subprocess, sys, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--channel',default=None,help='Use an existing browser channel without downloading dependencies')
args=parser.parse_args()
OUT=ROOT/'artifacts/settlements-course-status'
OUT.mkdir(parents=True,exist_ok=True)
FILES=['site/assets/js/main.js','site/assets/js/settlements-course-status.js','site/assets/js/settlements-leaderboard.js','site/apps/settlements/copy.mjs']
def hashes():return {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in FILES}
source=(ROOT/FILES[0]).read_text(encoding='utf-8')
renderer=source[source.index('function bestCourseQuizAttempt('):source.index('\nconst gradeItems=')]
assert 'async function renderDashboard()' in renderer and 'data-settlements-course-status' in renderer
css_path=ROOT/'site/assets/css/site.css'
css=css_path.read_text(encoding='utf-8') if css_path.exists() else subprocess.check_output(['git','show','HEAD:site/assets/css/site.css'],cwd=ROOT).decode('utf-8')
fixture=r"""
import {readSettlementsCourseDrafts,settlementsCourseStatus,settlementsCourseMessage,mountSettlementsCourseReceipt} from '/assets/js/settlements-course-status.js';
const app=document.querySelector('#app'),owner='student:dashboard-fixture';let locale='ru',currentCleanup=null;
const render=async()=>renderDashboard();
const result={terminal:true,reason:'complete',coverageNp:100,coveragePopulation:100,turns:10,spentMillionRub:3};
const f=window.fixture={grades:{},party:{owner,activitySlug:'seminar-3',mode:'settlements-assessment',saveStatus:{state:'pending'},state:{status:'completion-pending',difficulty:'hard',result}},tutorial:null};
const backend={getProfile:()=>({fullName:'Синтетический участник',group:'TEST'}),getGrades:async()=>structuredClone(f.grades),getAttempts:async()=>[],isAdmin:()=>false};
const durableStore={loadDraft:async({activitySlug})=>structuredClone(activitySlug==='seminar-3'?f.party:f.tutorial)};
const attemptOwner=()=>owner,getLocale=()=>locale,number=value=>Number(value)||0;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loc=(value,key,fallback)=>value[key]||fallback||'',ui=key=>({dashboardLead:'Проверка компонента главной',continuous:'Текущая успеваемость',examination:'Экзамен',currentGroup:'Группа',fullName:'ФИО',learningPath:'Учебный план',seminarWord:'Семинар',lectureWord:'Лекция',openActivity:'Открыть',currentScore:'общий балл',completedCount:'завершено',notPassed:'не пройдено',perfectResult:'Отличный результат'}[key]||key),t=ui;
const accessText=key=>({academicYear:'Учебный год',currentWeek:'Неделя',scheduleLead:'Синтетическое расписание'}[key]||key);
const accessSnapshot=()=>({context:{startYear:2026,endYear:2027,week:5},overrides:{},now:0}),topicGate=()=>({open:true}),lectureTestGate=()=>({open:true}),accessAllowed=gate=>gate.open,gateStatus=()=> 'Открыто';
const officialTicket=()=>'',openAuthDialog=()=>{};
const data={course:{title:'Компонент главной: ожидание оценки',programme:'Синтетические данные; база не подключена',topics:[{number:3,title:'Система расселения',summary:'Проверка сохранения результата',lecture:{slug:'lecture-3',title:'Лекция 3'},seminar:{slug:'seminar-3',title:'Семинар 3 · Игра на оценку'}}]}};
"""
fixture+=renderer+r"""
window.renderFixture=async next=>{locale=next||locale;await renderDashboard();};
document.querySelector('#confirm').onclick=async()=>{f.grades={'seminar-3':{points:5,max:5}};f.party.state.status='completed';f.party.saveStatus.state='saved';await renderDashboard();};
await renderDashboard();document.documentElement.dataset.ready='true';
"""
html='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dashboard receipt component fixture</title><link rel="stylesheet" href="/fixture.css"><aside style="padding:12px">COMPONENT TEST · synthetic backend/store · not live <button id="confirm">Смоделировать подтверждение</button></aside><main id="app"></main><script type="module" src="/fixture.mjs"></script>'''
report={'kind':'actual renderDashboard component; synthetic backend/store; NOT live/cloud evidence','status':'running','viewport':[390,844], 'browserFallback':'Browser plugin not available; project-authorized Playwright','hashesBefore':hashes(),'rendererSha256':hashlib.sha256(renderer.encode()).hexdigest(),'checks':[],'errors':[]}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,**({'channel':args.channel} if args.channel else {}))
  report['browserChannel']=args.channel or 'bundled-chromium';report['browserVersion']=browser.version
  context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
  assets={'/fixture.html':('text/html',html),'/fixture.mjs':('text/javascript',fixture),'/fixture.css':('text/css',css)}
  def serve(route):
   from urllib.parse import urlparse
   kind,body=assets[urlparse(route.request.url).path];route.fulfill(content_type=kind,body=body)
  for asset in assets:context.route('**'+asset,serve)
  context.route('**/favicon.ico',lambda route:route.fulfill(status=204,body=''))
  page=context.new_page();page.on('pageerror',lambda error:report['errors'].append(str(error)))
  page.on('console',lambda msg:report['errors'].append(msg.text) if msg.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/fixture.html');page.wait_for_function("document.documentElement.dataset.ready==='true'")
  assert page.title()=='Dashboard receipt component fixture'
  badge=page.locator('[data-settlements-course-status="pending"]')
  for locale in ['ru','en','zh']:
   page.evaluate('locale=>window.renderFixture(locale)',locale)
   assert badge.count()==1 and badge.inner_text().startswith('5/5 · ')
   assert page.locator('.score-ring strong').inner_text()=='0'
   assert page.locator('.stats-grid .stat-card').first.locator('strong').inner_text()=='0/80'
   primary=badge.locator('..').evaluate("node=>node.firstChild.textContent.trim()")
   assert primary=='5/5',primary
   badge.scroll_into_view_if_needed();box=badge.bounding_box()
   assert box['x']>=0 and box['x']+box['width']<=391,'pending receipt outside viewport'
   first_line=badge.locator('..').evaluate("node=>{const range=document.createRange();range.selectNode(node.firstChild);const r=range.getBoundingClientRect();return {bottom:r.bottom}}")
   assert box['y']>=first_line['bottom']-1,'pending caption overlaps the primary result line'
   report['checks'].append(f'{locale}: primary 5/5 with separate pending receipt; no confirmed grade; total 0; coursework 0/80')
  page.evaluate("window.renderFixture('ru')")
  page.screenshot(path=str(OUT/'dashboard-pending.png'),full_page=True)
  page.locator('#confirm').click()
  assert page.locator('[data-settlements-course-status]').count()==0
  assert page.locator('.score-ring strong').inner_text()=='5'
  assert page.locator('.stats-grid .stat-card').first.locator('strong').inner_text()=='5/80'
  seminar=page.locator('.activity-mini').filter(has=page.locator('a[href="#activity/seminar-3"]'))
  assert '5/5' in seminar.locator('.grade').inner_text()
  report['checks'].append('confirmation interaction: pending receipt removed; seminar 5/5; total 5; coursework 5/80')
  page.screenshot(path=str(OUT/'dashboard-confirmed.png'),full_page=True)
  assert not report['errors'],report['errors']
  context.close();browser.close()
 report['status']='pass'
except Exception:
 report['status']='fail';report['failure']=traceback.format_exc()
finally:
 server.shutdown();server.server_close()
 report['hashesAfter']=hashes();report['sourceStable']=report['hashesBefore']==report['hashesAfter']
 if not report['sourceStable']:report['status']='fail'
 (OUT/'dashboard-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=True,indent=2))
sys.exit(0 if report['status']=='pass' else 1)
