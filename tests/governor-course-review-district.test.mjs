import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {G,E,campaign,json} from './helpers/governor-gameplay.mjs';

const game={...G};
const context=vm.createContext({GovernorGame:game});
for(const file of ['locales/zh-Hans','src/i18n','src/world-model','src/campaign-ui']){
  const script=await readFile(new URL('../site/apps/governor/'+file+'.js',import.meta.url),'utf8');
  vm.runInContext(script,context,{filename:file});
}

test('reopened course reviews name the district with the lowest healthcare access in each reviewed year',()=>{
  const finished=campaign('balanced','GAMEPLAY-1','planned','automatic','services');
  const state=E.restoreState(json(finished));
  assert.ok(state?.completed);
  // New Bank and River valley trade places, so looking up the current
  // district instead of the saved annual evidence would mislabel year 10.
  const districts=['suburb','river','suburb','suburb'];
  for(const lang of ['ru','en','zh']){
    const articles=game.CampaignUI.reportHtml(state,lang).match(/<article>[\s\S]+?<\/article>/g);
    assert.equal(articles.length,4);
    for(const [index,review] of state.campaignStrategy.reviews.entries()){
      const observed=state.history[review.year-1].population.after.municipalities;
      const value=observed[districts[index]].healthAccess;
      const place=game.WorldModel.PLACES.find(p=>p.id===districts[index]);
      assert.equal(value,Math.min(...Object.values(observed).map(m=>m.healthAccess)));
      const display=new Intl.NumberFormat(game.I18n.intlLocale(lang),{maximumFractionDigits:1}).format(review.goals[0].value*100);
      assert.ok(articles[index].includes(game.I18n.local(place.name,lang)+': '+display+'%'),lang+' '+review.year);
    }
  }
});

test('exact ties name both districts while missing evidence does not borrow a district from today',()=>{
  const state=campaign('balanced','GAMEPLAY-1','planned','automatic','services');
  const reviewed=state.history[9].population.after.municipalities;
  reviewed.suburb.healthAccess=reviewed.river.healthAccess;
  const article=()=>game.CampaignUI.reportHtml(state,'en').split('<article>')[2].split('</article>')[0];
  assert.match(article(),/River valley, New Bank:/);
  reviewed.suburb.healthAccess+=.000001;
  assert.match(article(),/district · River valley:/);
  delete reviewed.river.healthAccess;
  assert.match(article(),/least served district: /);
});
