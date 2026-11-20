// Offline verification. --blind writes only what a student can read before selecting a route.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateCase, localized, actorCase, hash } from '../firebase/functions/reception-ai/schema.mjs';
import { withSeminarStory, SEMINAR_STORY_VERSION } from '../firebase/functions/reception-ai/seminar-stories.mjs';
import { storiesA } from '../firebase/functions/reception-ai/semstory-a.mjs';
import { storiesB } from '../firebase/functions/reception-ai/semstory-b.mjs';
import { MFC_SEMINAR_VERSION } from '../firebase/functions/reception-ai/mfc-seminar.mjs';
import { createMemoryStore } from '../firebase/functions/reception-ai/store.mjs';
import { createReceptionService } from '../firebase/functions/reception-ai/service.mjs';
import { publicMfcRouting, mfcRoutingAlternatives, evaluateMfcRouting } from '../firebase/functions/reception-ai/mfc-routing.mjs';
import { privateCorrespondenceProfile } from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import { requiredSeminarActs } from '../firebase/functions/reception-ai/normative-acts.mjs';
import { RECEPTION_AUTHORITIES, RECEPTION_MFC_AUTHORITY_IDS } from '../site/apps/reception/ai/authority-directory.js';
import { gameCopy } from '../site/apps/reception/localization/game-copy.js';

const actDirectory=JSON.parse(await readFile(new URL('../firebase/functions/reception-ai/normative-acts-data.json',import.meta.url),'utf8'));
const [sourceDir, ...flags] = process.argv.slice(2);
if (!sourceDir) throw Error('Supply a frozen Reception dossier directory');
const option = name => flags.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const blindDir = option('blind'), answersDir = option('reviews');
const receiptIndex = async file => file
  ? new Map(JSON.parse(await readFile(file,'utf8')).cases.map(row => [row.code, row]))
  : new Map();
const adjudications = await receiptIndex(option('adjudications'));
const rechecks = await receiptIndex(option('rechecks'));
const amendments = await receiptIndex(option('amendments'));
const originalPackets = option('original-packets');
const digest = value => createHash('sha256').update(value).digest('hex');
const routeKey = ids => [...ids].sort().join('|');
const languages = ['ru', 'en', 'zh'];
const files = (await readdir(sourceDir)).filter(name => name.endsWith('.json')).sort();
const cases = await Promise.all(files.map(async name => JSON.parse(await readFile(join(sourceDir,name),'utf8'))));
const publicCode = id => createHash('sha256').update('mfc-2026-public-record/' + id).digest('hex').slice(0, 6);
const failures = [];
const counts = {cases:0, variants:0, projections:0, blindFiles:0, reviewed:0};
const availableStories = {...storiesA, ...storiesB};
const partial = flags.includes('--partial');
if (!partial) {
  assert.equal(files.length,178);
  assert.deepEqual(Object.keys(availableStories).sort(),cases.map(c=>c.id).sort());
  assert.equal(Object.keys(storiesA).length + Object.keys(storiesB).length, files.length);
}

async function firstScreen(c) {
  const store = createMemoryStore();
  const identity = {uid:'read-only-fixture',studentKey:'99000042'};
  const example = c.id === 'complaint-routing';
  if (!example) await store.transaction('seminarProgress/' + hash('student:'+identity.studentKey),
    () => ({storyJourney:{example:{completed:true},mentor:{completed:true}}}));
  const fixedPack = {...c};
  delete fixedPack.dateVariants;
  const service = createReceptionService({store,cases:[fixedPack],guidedSeminarCore:true,requireGameplay:true,
    canStartAssessment:async()=>true, provider:{name:'offline',ready:true,generate(){assert.fail('Unexpected chat')},reviewDecision(){assert.fail('Unexpected review')}}});
  const {view} = await service.handle({op:'start',requestId:'read-initial',locale:'ru',context:'seminar',
    journeyStage:example?'example':'independent',mode:example?'training':'independent',
    coreStepsVersion:MFC_SEMINAR_VERSION,seminarStoryVersion:SEMINAR_STORY_VERSION,
    workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1'},identity);
  assert.equal(view.seminarStoryVersion,SEMINAR_STORY_VERSION);
  if (!example) assert.equal(view.guidance,undefined);
  const clean = txt => gameCopy(txt,'ru');
  return {citizen:view.case.citizen.name, title:view.case.title, opening:clean(view.case.opening),
    documents:view.documents.map(d=>({title:clean(d.title),text:clean(d.text)})),
    events:view.case.workbook.events.map(({label,date})=>({label,date})),
    eventLocation:view.case.workbook.site, correspondenceAddress:view.case.workbook.origin,
    laws:view.case.normativeActs.map(({id,title,number})=>({title,number,url:actDirectory[id]?.sourceUrl}))};
}

if (blindDir) {
  await mkdir(blindDir,{recursive:true});
  const directory = RECEPTION_AUTHORITIES.filter(a=>RECEPTION_MFC_AUTHORITY_IDS.has(a.id))
    .map(a=>[a.id, a.name, a.shortName||'', (a.territoryIds||[]).join(',')].join('\t')).join('\n');
  await writeFile(join(blindDir,'directory.tsv'),directory+'\n');
}
for (const c of cases) {
  if (partial && !availableStories[c.id]) continue;
  try {
    const base = validateCase(c);
    for (const chosen of [base,...(base.dateVariants||[])]) {
      const variant = {...chosen};
      delete variant.dateVariants;
      const original = JSON.stringify(variant);
      const authored = validateCase(withSeminarStory(variant),{allowSeminarStory:true});
      assert.equal(JSON.stringify(variant),original);
      assert.equal(authored.seminarStory.version,SEMINAR_STORY_VERSION);
      assert.deepEqual(authored.provenance,variant.provenance);
      const alternatives = mfcRoutingAlternatives(authored);
      assert.ok(alternatives?.length);
      for (const alternative of alternatives) {
        assert.ok(alternative.every(row=>row && RECEPTION_MFC_AUTHORITY_IDS.has(row.id)));
        assert.ok(evaluateMfcRouting(authored,{disposition:'forward',recipientIds:alternative.map(a=>a.id)}).correct);
      }
      const publicRoute=publicMfcRouting(authored);
      assert.deepEqual(publicRoute.routingPolicy,{allowInternal:false});
      assert.equal(publicRoute.sharedReply, mfcRoutingAlternatives(c.id).some(rows=>rows.length>1));
      assert.equal(new Set(alternatives.map(rows=>routeKey(rows.map(a=>a.id)))).size,alternatives.length);
      assert.ok(requiredSeminarActs(authored).length);
      assert.ok(authored.seminarStory.authoritySources?.length,'missing official authority source');
      assert.ok(authored.seminarStory.authoritySources.every(url=>/^https:\/\//i.test(url)));
      for (const language of languages) {
        const dossier=localized(authored,language);
        const ctx=actorCase(authored,language);
        assert.ok(!ctx.rubric && !ctx.seminarStory && !ctx.followup && !ctx.recipients);
        assert.equal(ctx.opening,dossier.public.opening);
        assert.equal(ctx.actor.goal,dossier.seminarStory.participant.purpose);
        assert.equal(ctx.participantContext.conversationalBackground.priorContact,dossier.seminarStory.participant.priorContact);
        assert.ok(privateCorrespondenceProfile(authored,language)?.provenance.frozenSourceMatched);
        const doc=dossier.documents.find(d=>d.id===authored.seminarStory.routeDocumentId);
        assert.ok(doc?.text.trim().length>=15);
        assert.ok(!/\{\{/.test([doc.text,dossier.public.opening,dossier.actor.background,dossier.actor.goal,...dossier.documents.map(d=>d.text)].join(' ')));
        counts.projections++;
      }
      counts.variants++;
    }
    if (blindDir || answersDir) {
      const packet=await firstScreen(c), code=publicCode(c.id);
      if (blindDir) {
        await writeFile(join(blindDir,code+'.json'),JSON.stringify(packet,null,2)+'\n');
        counts.blindFiles++;
      }
      if (answersDir) {
        const answer=JSON.parse(await readFile(join(answersDir,code+'.json'),'utf8'));
        const signature=digest(JSON.stringify(packet,null,2)+'\n');
        const ruling=adjudications.get(code);
        if (adjudications.size) {
          assert.equal(ruling?.id,c.id,'absent adjudication');
          assert.equal(ruling.packetSha256,answer.packetSha256);
          assert.ok(ruling.reason);
          assert.deepEqual(ruling.evidence.originalRecipientSets,[answer.recipients,...(answer.alternatives || [])]);
        }
        let finalQuotes=answer.quotes;
        if (answer.packetSha256!==signature) {
          const recheck=rechecks.get(code);
          assert.ok(originalPackets && recheck,'public materials changed since review');
          if(!recheck.confirmed){
            const amendment=amendments.get(code);
            assert.ok(amendment?.accepted && amendment.id===c.id && amendment.afterSha256===signature && amendment.reason,
              'revised solution requires adjudication');
            assert.ok(evaluateMfcRouting(withSeminarStory(c),{disposition:'forward',recipientIds:amendment.recipientIds}).correct,
              'final reviewed route rejected');
          }
          const original=await readFile(join(originalPackets,code+'.json'),'utf8');
          assert.equal(digest(original),answer.packetSha256);
          assert.equal(recheck.beforeSha256,answer.packetSha256);
          assert.equal(recheck.afterSha256,signature);
          assert.ok(answer.quotes.every(q=>JSON.parse(original).documents.some(d=>d.text.includes(q))));
          finalQuotes=recheck.quotes;
        }
        if(answer.blockedReason)assert.ok(ruling?.clarification,answer.blockedReason);
        assert.ok(answer.request?.length>=10 && answer.action?.length>=12,'missing substantive decision');
        assert.ok(finalQuotes?.length,'missing corroborating quotes');
        for (const quote of finalQuotes) assert.ok(quote.length>=8 && packet.documents.some(d=>d.text.includes(quote)),'quote absent in visible records');
        const projected=withSeminarStory(c);
        const accepted=mfcRoutingAlternatives(projected).map(rows=>routeKey(rows.map(a=>a.id))).sort();
        if(ruling)assert.deepEqual(accepted,ruling.acceptedRecipientSets.map(routeKey).sort(),'case-specific route adjudication');
        for (const recipients of [answer.recipients, ...(answer.alternatives || [])]) {
          if(evaluateMfcRouting(projected,{disposition:'forward',recipientIds:recipients}).correct)continue;
          const rejected=ruling?.rejectedBlindRecipientSets.find(row=>routeKey(row.recipients)===routeKey(recipients));
          assert.ok(rejected?.reason,'unresolved reviewer route '+recipients);
        }
        counts.reviewed++;
      }
    }
    counts.cases++;
  } catch (error) {
    failures.push({case:c.id,code:publicCode(c.id),error:error.storyDetail||error.message||error.code,at:error.stack?.split('\n').find(s=>s.includes('story-audit.mjs:'))?.trim()});
  }
}
console.log(JSON.stringify({version:SEMINAR_STORY_VERSION,counts,failures},null,2));
if(failures.length)process.exitCode=1;
