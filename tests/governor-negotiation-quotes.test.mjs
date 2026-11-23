import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {G,E,fresh} from './helpers/governor-gameplay.mjs';

function offers(dialog) {
  return new Map([...dialog.innerHTML.matchAll(/<button type="button" class="gov-term [^"]*" data-term="([^"]+)" ([\s\S]*?)<\/button>/g)]
    .map(([,id,html])=>[id,html]));
}

const source=new URL('../site/apps/governor/',import.meta.url);
const scripts=await Promise.all(['src/i18n.js','locales/zh-Hans.js','src/governance-ui.js'].map(file=>readFile(new URL(file,source),'utf8')));

test('meeting receipts and every selectable alternative quote the same package the engine will sign',()=>{
  const state=fresh();
  E.chooseAgenda(state,'rural-healthcare');
  const nodes=new Map();
  const node=key=>{if(!nodes.has(key))nodes.set(key,{focus(){}});return nodes.get(key);};
  const actors=G.Governance.CONFIG.actors.map(actor=>({dataset:{participant:actor.id}}));
  const dialog={innerHTML:'',showModal(){},setAttribute(){},querySelector:node,
    querySelectorAll:key=>key==='[data-participant]'?actors:[]};
  const ctx={GovernorGame:{...G,icon:()=>''},document:{getElementById:()=>dialog},Intl};
  ctx.window=ctx;vm.createContext(ctx);
  scripts.forEach(script=>vm.runInContext(script,ctx));
  const ui=ctx.GovernorGame.GovernanceUI;
  ui.init({getState:()=>state,getLanguage:()=>'en',save(){}});
  const terms=G.Governance.CONFIG.terms;
  const money=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(x)+' bn RUB';
  const delta=(a,b)=>Math.round((a-b)*100)/100;
  const signed=x=>(x>0?'+':'')+money(x);
  const own=p=>p.treasuryCost+p.firstYearOpex;
  for(const mode of ['cofinance','treasury']){
    const quote=ids=>E.previewAction(state,'mobile-units',mode,null,ids);
    const valid=terms.filter(t=>!t.requires||t.requires===mode);
    const packages=[[],...valid.map(t=>[t.id]),...valid.flatMap((t,i)=>valid.slice(i+1).filter(u=>u.actor!==t.actor).map(u=>[t.id,u.id]))];
    assert.equal(packages.length,mode==='cofinance'?19:14);
    for(const ids of packages){
      const v=quote(ids);
      E.setAgreementTerms(state,'mobile-units',mode,v.placement?.id,ids);
      ui.openMeeting('mobile-units',mode,v.placement?.id);
      assert.ok(dialog.innerHTML.includes('<strong>'+money(own(v.plan))+'</strong>'));
      assert.ok(dialog.innerHTML.includes('Planned opening <strong>'+(2026+v.project.startsIn)+'</strong>'));
      assert.ok(dialog.innerHTML.includes(v.agreement.positions.filter(p=>p.stance==='support').length+' of 3 support'));
      if(v.agreement.delay)assert.ok(dialog.innerHTML.includes('Coordination +1 year · support -1.5'));
      for(const p of v.agreement.promises)assert.ok(dialog.innerHTML.includes('data-remove-term="'+p.termId+'"'));
      for(const actor of actors){
        actor.onclick();
        const shown=offers(dialog);
        assert.equal(shown.size,2);
        for(const [id,html] of shown){
          const t=G.Governance.termFor(id),others=ids.filter(x=>G.Governance.termFor(x).actor!==t.actor);
          if((t.requires&&t.requires!==mode)||others.length===2){assert.match(html,/disabled/);continue;}
          assert.doesNotMatch(html,/disabled/);
          const base=quote(others),withTerm=quote([...others,id]);
          const p=withTerm.agreement.promises.find(p=>p.termId===id);
          assert.ok(html.includes(String(2025+p.dueTurn)));
          assert.ok(html.includes('Treasury now '+signed(delta(own(withTerm.plan),own(base.plan)))));
          if(mode==='cofinance')assert.ok(html.includes('Project cost '+signed(delta(withTerm.plan.totalCost,base.plan.totalCost))));
          if(t.opex)assert.ok(html.includes(signed(t.opex)+'/operating year'));
          if(p.conditionalGrant)assert.ok(html.includes('Repay '+money(p.conditionalGrant)+' if unreported'));
          if(p.kind==='reserve')assert.ok(html.includes(money(p.floor)));
          if(t.id==='delivery-team')assert.equal(p.dueTurn,2+withTerm.project.startsIn);
        }
      }
    }
  }
});
