// Deterministic regression for the release-blocking trees-other-site reply.
// Real compiled catalogs and grading; no random assignment or test-only locale.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CASE_TEMPLATES, CONTENT_VERSION, hydrateTemplates, requireTemplate, instantiateCase} from '../js/content-library.js';
import {newCase, evaluateCase, deadlineFor} from '../js/engine.js';
import {evidenceTask} from '../js/evidence.js';
import {requiredActionPlan} from '../js/documents.js';
import {aliases} from './compiled/evidence-aliases.js';
import {registerEvidenceLocaleAliases} from '../js/evidence-locale-aliases.js';
import {createReceptionCatalogLoader, createReceptionTranslator} from './runtime.js';
import {localizedReplyParts} from './presentation.js';
import {approvedEvidenceLiterals, unapprovedCyrillic} from './validation.js';

const family=CASE_TEMPLATES.filter(template=>template.id.startsWith('trees-')).map(template=>template.id);
await hydrateTemplates(family);
const template=requireTemplate('trees-other-site'),canonical=JSON.stringify(template);
const inventory=JSON.parse(await readFile(new URL('source/inventory.json',import.meta.url),'utf8'));
const labelRows=inventory.entries.filter(entry=>entry.contexts.some(context=>context.startsWith('cases:CASE_TEMPLATES[trees-other-site].'))&&/(?<![\p{L}\p{N}_])[АБ](?![\p{L}\p{N}_])/u.test(entry.ru));
assert.equal(labelRows.length,9,'Cover every distinct plot-labelled authored case string');
const loader=createReceptionCatalogLoader({cacheStorage:null,fetch:async url=>new Response(await readFile(url))});
registerEvidenceLocaleAliases(aliases);
const results=[];
for(const locale of ['en','zh']){
  const loaded=await loader.load(locale,{templateIds:family,contentVersion:CONTENT_VERSION});
  const translator=createReceptionTranslator({locale,...loaded});
  for(const row of labelRows){
    const actual=translator.translate(row.ru);
    const expectedLabels=[...row.ru.matchAll(/(?<![\p{L}\p{N}_])[АБ](?![\p{L}\p{N}_])/gu)].map(match=>match[0]==='А'?'A':'B');
    const actualLabels=[...actual.matchAll(/(?:plot |地块)([AB])|([AB])\/([AB])/gu)].flatMap(match=>match.slice(1).filter(Boolean));
    assert.deepEqual(actualLabels,expectedLabels,locale+'/'+row.id+': same A/B labels across documents, facts, route and follow-up');
    assert.doesNotMatch(actual,/[А-Яа-яЁё]/,locale+'/'+row.id+': no Cyrillic plot glyphs');
    assert.deepEqual(approvedEvidenceLiterals(row),[],'Plot display labels require no Cyrillic exemption');
    assert.equal(unapprovedCyrillic(row.ru,actual.replace(/[AB]/g,letter=>letter==='A'?'А':'Б')),true,'The original defect is still rejected');
  }
  for(const pack of template.datePacks){
    const c=instantiateCase(template,pack.id,{year:2026}),task=evidenceTask(c),p=newCase();
    Object.assign(p,{asked:c.questions.map(row=>row.id),opened:c.documents.map(row=>row.id),fact:c.factTask.correct[0],factEvidence:c.factTask.evidence[0],
      procedure:c.correctProcedure[0],route:c.correctRoutes[0],trap:c.trap.correct,followup:c.followup.correct,followupConfirmed:true,
      knowledge:{lawNumber:c.knowledge.number,actDate:c.knowledge.actDate,article:c.knowledge.articles[0],application:c.knowledge.correct,url:'https://example.test/plot-label-regression'},
      evidence:{...task.bindings[0],extracted:translator.translate(task.extracted.accepted[0]),finding:task.correctFinding},
      calendar:{anchor:c.calendar.anchor,rule:c.calendar.correctRule,start:c.calendar.startPolicy,shift:c.calendar.lastDayPolicy,answer:deadlineFor(c).finalDate}});
    const plan=requiredActionPlan(c,p.route),left=new Set(plan.requiredActions);
    while(left.size){const next=[...left].find(id=>!plan.order.some(([before,after])=>after===id&&left.has(before)));assert(next);p.actions.push(next);left.delete(next);}
    const before=JSON.stringify(p),reply=localizedReplyParts(c,p,translator).map(parts=>parts.map(part=>part.text).join(''));
    for(const line of reply){assert.doesNotMatch(line,/[А-Яа-яЁё]/);assert.equal(translator.translate(line),line,'A second presentation pass stays clean');}
    if(locale==='en'){
      assert(reply.includes('Selected route: Clarify the boundaries and the document for plot A, and forward the materials to the competent vegetation protection authority.'));
      assert(reply.includes('Included in the draft: Compare the work location with the document and map; Identify the specialist authority for the territory and type of work; Prepare to forward the submission, identifying the mismatch between the plots; Notify the applicant without a premature finding of guilt; Check that the response concerns plot A specifically.'));
    }
    assert.equal(evaluateCase(c,p).total,100,locale+'/'+pack.id+': localized B evidence retains the original full score');
    assert.equal(JSON.stringify(p),before,'Localization never rewrites stored answer IDs or values');
    results.push({locale,datePack:pack.id,score:100,reply});
  }
  assert.deepEqual(translator.missing(),[]);
}
assert.equal(JSON.stringify(template),canonical,'Canonical Russian case and grading keys stay unchanged');
console.log(JSON.stringify({plotLabelRegression:{case:'trees-other-site',family,authoredLabelStrings:labelRows.length,results,canonicalUnchanged:true}},null,2));
