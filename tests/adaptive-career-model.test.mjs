import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildQuestionBank,validAnswers,nextQuestion,rankVacancies,shouldFinish,makeCompletionRecord,MIN_ANSWERS,MAX_ANSWERS} from '../site/apps/career/assets/adaptive-model.mjs';
import {completedCareerRecord} from '../site/assets/js/career-course.js';

const text = value => ({ru:value,en:value,'zh-Hans':value});
const taxonomy = {schemaVersion:1,version:'test-2',facets:Array.from({length:31},(_,index)=>({id:'f'+index,label:text('Function '+index),questions:Array.from({length:5},(_,q)=>({id:`f${index}_q${q}`,broad:q===0,text:text(`Work ${index}.${q}`)}))}))};
const core = (values={}) => taxonomy.facets.map(f=>({questionId:f.id+'_q0',value:values[f.id]??3}));
const row = (id,features,changes={}) => ({id,title:'Specialist '+id,department:'Department '+id,employerName:'Same ministry',regionId:'ru-77',location:'Moscow',features,evidenceLevel:'duties',sourceURL:'https://example.org/'+id,...changes});
const candidates=[row('budget',{f0:1,f0_q1:1}),row('recruitment',{f1:1,f1_q1:1}),row('contract',{f2:1,f2_q1:1}),row('inspection',{f2:1,f2_q2:1})];
const completeAnswers = value => [...core(Object.fromEntries(taxonomy.facets.map(f=>[f.id,value]))),...buildQuestionBank(taxonomy).filter(q=>!q.broad).slice(0,MIN_ANSWERS-taxonomy.facets.length).map(q=>({questionId:q.id,value}))];

test('the shipped question bank agrees with the course completion contract in every language',()=>{
  const actual=JSON.parse(readFileSync(new URL('../site/apps/career/data/adaptive-taxonomy.json',import.meta.url),'utf8'));
  const questions=buildQuestionBank(actual);
  assert.equal(actual.version,'2.0.0');assert.equal(actual.facets.length,31);assert.equal(questions.length,158);
  assert.equal(questions.filter(question=>question.broad).length,31);
  for(const facet of actual.facets){
    assert.equal(facet.questions.filter(question=>question.broad).length,1);
    for(const lang of ['ru','en','zh-Hans'])assert.ok(facet.label[lang]?.trim());
  }
  for(const question of questions)for(const lang of ['ru','en','zh-Hans'])assert.ok(question.text[lang]?.trim());
  const answers=[...questions.filter(q=>q.broad),...questions.filter(q=>!q.broad).slice(0,MIN_ANSWERS-31)].map(q=>({questionId:q.id,value:3}));
  const ranking=rankVacancies({taxonomy:actual,answers,candidates:[]});
  const record=makeCompletionRecord({taxonomy:actual,answers,ranking,indexVersion:'question-bank-contract',recordId:'functional-real-taxonomy-contract'});
  assert.equal(completedCareerRecord(record),true);
});

test('the unit of recommendation is a vacancy: different departments in one employer rank differently',()=>{
  assert.equal(rankVacancies({taxonomy,answers:core({f0:5,f1:1}),candidates}).matches[0].id,'budget');
  assert.equal(rankVacancies({taxonomy,answers:core({f0:1,f1:5}),candidates}).matches[0].id,'recruitment');
  const renamed=candidates.map(r=>({...r,employerName:'Budget recruitment ministry'}));
  assert.deepEqual(rankVacancies({taxonomy,answers:core({f0:5,f1:1}),candidates}).matches.map(r=>r.id),rankVacancies({taxonomy,answers:core({f0:5,f1:1}),candidates:renamed}).matches.map(r=>r.id));
});

test('specific functional answers distinguish roles within one broad family',()=>{
  const answers=[...core({f2:5}),{questionId:'f2_q1',value:1},{questionId:'f2_q2',value:5}];
  assert.equal(rankVacancies({taxonomy,answers,candidates}).matches[0].id,'inspection');
  const changed=[...core({f2:5}),{questionId:'f2_q1',value:5},{questionId:'f2_q2',value:1}];
  assert.equal(rankVacancies({taxonomy,answers:changed,candidates}).matches[0].id,'contract');
});

test('unknown, neutral and negative-only responses never manufacture a best match',()=>{
  for(const value of [0,1,2,3]){
    const answers=core(Object.fromEntries(taxonomy.facets.map(f=>[f.id,value])));
    const result=rankVacancies({taxonomy,answers,candidates});assert.equal(result.resultStatus,'no-preference');assert.deepEqual(result.matches,[]);
  }
  const unknown=rankVacancies({taxonomy,answers:[...core({f0:5}),{questionId:'f0_q1',value:0}],candidates});
  const unanswered=rankVacancies({taxonomy,answers:core({f0:5}),candidates});
  assert.deepEqual(unknown.matches,unanswered.matches);
});

test('changed preferences reopen every candidate instead of irreversibly pruning the archive',()=>{
  const disliked=rankVacancies({taxonomy,answers:core({f0:1,f1:5}),candidates});
  assert.ok(!disliked.matches.some(r=>r.id==='budget'));
  assert.equal(rankVacancies({taxonomy,answers:core({f0:5,f1:1}),candidates}).matches[0].id,'budget');
  assert.equal(candidates.length,4);
});

test('reusing an answer array never reuses an obsolete recommendation after editing a value',()=>{
  const answers=core({f0:5,f1:1});
  assert.equal(rankVacancies({taxonomy,answers,candidates}).matches[0].id,'budget');
  nextQuestion({taxonomy,answers,candidates});
  answers.find(answer=>answer.questionId==='f0_q0').value=1;
  answers.find(answer=>answer.questionId==='f1_q0').value=5;
  assert.equal(rankVacancies({taxonomy,answers,candidates}).matches[0].id,'recruitment');
  assert.equal(nextQuestion({taxonomy,answers,candidates}).facetId,'f1');
});

test('adaptive questions follow answers and real task evidence, with no volume bias from repeated competitions',()=>{
  const a=nextQuestion({taxonomy,answers:core({f0:5,f1:1}),candidates});
  const b=nextQuestion({taxonomy,answers:core({f0:1,f1:5}),candidates});
  assert.equal(a.facetId,'f0');assert.equal(b.facetId,'f1');assert.notEqual(a.id,b.id);
  const many=[...candidates,...Array.from({length:1500},(_,i)=>({...candidates[1],id:'copy-'+i}))];
  assert.equal(nextQuestion({taxonomy,answers:core({f0:5,f1:1}),candidates:many}).id,a.id);
});

test('exhausting the leading profiles explores another evidenced task before an unsupported question',()=>{
  const leaders=Array.from({length:160},(_,index)=>row('leading-'+index,{f0:.8+index/1000,f0_q1:1}));
  const roles=[...leaders,row('outside-leading-set',{f1:1,f1_q1:1})];
  const answers=[...core({f0:5}),{questionId:'f0_q1',value:5}];
  assert.equal(nextQuestion({taxonomy,answers,candidates:roles}).id,'f1_q1');
  assert.equal(nextQuestion({taxonomy,answers,candidates:roles}).id,'f1_q1');
});

test('adaptive length is bounded, questions do not repeat, and no completion precedes the broad pass',()=>{
  for(const value of [0,1,3,5]){
    const answers=[];
    while(!shouldFinish({taxonomy,answers,candidates})){
      const q=nextQuestion({taxonomy,answers,candidates});assert.ok(q);assert.ok(!answers.some(a=>a.questionId===q.id));answers.push({questionId:q.id,value});
      assert.ok(answers.length<=MAX_ANSWERS);
    }
    assert.ok(answers.length>=MIN_ANSWERS);assert.ok(taxonomy.facets.every(f=>answers.some(a=>a.questionId===f.id+'_q0')));
  }
  assert.equal(shouldFinish({taxonomy,answers:core(),candidates}),false);
});

test('malformed and duplicate answers are not counted as evidence or questionnaire completion',()=>{
  assert.deepEqual(validAnswers(taxonomy,[{questionId:'f0_q0',value:5},{questionId:'f0_q0',value:1},{questionId:'evil',value:5},{questionId:'f1_q0',value:'5'},{questionId:'f2_q0',value:-1}]),[{questionId:'f0_q0',value:5}]);
  assert.throws(()=>makeCompletionRecord({taxonomy,answers:core(),ranking:rankVacancies({taxonomy,answers:core(),candidates}),indexVersion:'v1'}));
});

test('the new completed record unlocks only the matching course flow and never contains psychological answers',()=>{
  const answers=completeAnswers(3);
  const ranking=rankVacancies({taxonomy,answers,candidates});
  const record=makeCompletionRecord({taxonomy,answers,regionIds:['ru-77'],ranking,indexVersion:'source-v1',recordId:'functional-complete-123456'});
  assert.equal(completedCareerRecord(record),true);assert.equal(record.ranking.length,0);
  for(const changes of [{completed:false},{answerCount:20},{answeredQuestionIds:[]},{broadQuestionIds:[]},{resultKind:'authority'},{resultStatus:'matched'},{modelVersion:'8.1.0'},{regionIds:['ru-00','ru-00']},{recordId:'demo-record-12345'}]) assert.equal(completedCareerRecord({...record,...changes}),false);
  assert.ok(!JSON.stringify(record).includes('personality'));assert.ok(!('roleProfile' in record));assert.ok(!('answers' in record));
});

test('record validation rejects a recommendation outside explicitly selected territories',()=>{
  const answers=completeAnswers(5);
  const ranking=rankVacancies({taxonomy,answers,candidates});
  assert.throws(()=>makeCompletionRecord({taxonomy,answers,regionIds:['ru-13'],ranking,indexVersion:'source-v1'}));
});

test('explicit territory and role preferences filter individual vacancies and never fall back nationwide',()=>{
  const roles=[row('junior',{f0:1},{regionId:'ru-13',responsibilityLevel:'specialist'}),row('minister',{f0:1},{regionId:'ru-13',responsibilityLevel:'leadership'}),row('unknown',{f0:1},{regionId:null,responsibilityLevel:'unspecified'}),row('moscow',{f0:1},{regionId:'ru-77',responsibilityLevel:'specialist'})];
  const answers=core({f0:5});
  assert.deepEqual(rankVacancies({taxonomy,answers,candidates:roles,regionIds:['ru-13'],responsibilityPreference:'specialist'}).matches.map(r=>r.id),['junior']);
  assert.deepEqual(rankVacancies({taxonomy,answers,candidates:roles,regionIds:['ru-13'],responsibilityPreference:'leadership'}).matches.map(r=>r.id),['minister']);
  assert.deepEqual(rankVacancies({taxonomy,answers,candidates:roles,regionIds:['ru-13','ru-77'],responsibilityPreference:'specialist'}).matches.map(r=>r.id).sort(),['junior','moscow']);
  assert.deepEqual(rankVacancies({taxonomy,answers,candidates:roles,regionIds:['ru-02'],responsibilityPreference:'specialist'}).matches,[]);
});

test('titles and department labels alone cannot become functional recommendations in model v2',()=>{
  const weak=[row('title-only',{f0:1},{evidenceLevel:'title'}),row('department-only',{f0:1},{evidenceLevel:'department'})];
  const result=rankVacancies({taxonomy,answers:core({f0:5}),candidates:weak});
  assert.equal(result.resultStatus,'no-matches');assert.equal(result.considered,0);assert.deepEqual(result.matches,[]);
});

test('identical titles and departments retain genuinely different published work profiles',()=>{
  const common={title:'Главный специалист',department:'Общий отдел',employerName:'Один работодатель'};
  const roles=[row('same-a',{f0:1,f0_q1:1},common),row('same-b',{f0:1,f0_q2:1},common)];
  const answers=[...core({f0:5}),{questionId:'f0_q1',value:5},{questionId:'f0_q2',value:5}];
  assert.equal(rankVacancies({taxonomy,answers,candidates:roles}).matches.length,2);
  const switched=[...core({f0:5}),{questionId:'f0_q1',value:1},{questionId:'f0_q2',value:5}];
  assert.equal(rankVacancies({taxonomy,answers:switched,candidates:roles}).matches[0].id,'same-b');
});

test('several specific matching tasks outrank an isolated weak domain mention',()=>{
  const answers=[...core({f0:5}),{questionId:'f0_q1',value:5},{questionId:'f0_q2',value:5}];
  const roles=[row('weak',{f0:.45},{evidenceLevel:'knowledge'}),row('specific',{f0:.45,f0_q1:.45,f0_q2:.45},{evidenceLevel:'knowledge'})];
  const matches=rankVacancies({taxonomy,answers,candidates:roles}).matches;
  assert.equal(matches[0].id,'specific');assert.ok(matches[0].score>matches[1].score);
  const renamed=roles.map(r=>({...r,title:'Другое название '+r.id,department:'Отдел цифровой трансформации',employerName:'Налоговое ведомство'}));
  assert.deepEqual(rankVacancies({taxonomy,answers,candidates:renamed}).matches.map(r=>[r.id,r.score]),matches.map(r=>[r.id,r.score]));
});

test('display evidence refers only to positively answered source features, with specific tasks first',()=>{
  const roles=[row('combined',{f0:1,f0_q1:1,f0_q2:1,f1:1,f1_q1:1})];
  const answers=[...core({f0:5,f1:3}),{questionId:'f0_q1',value:5},{questionId:'f0_q2',value:2},{questionId:'f1_q1',value:0}];
  const match=rankVacancies({taxonomy,answers,candidates:roles}).matches[0];assert.ok(match);
  assert.equal(match.matchedFeatures[0].id,'f0_q1');assert.equal(match.matchedFeatures[0].specific,true);
  assert.ok(match.matchedFeatures.every(item=>item.interest>0&&item.strength>0&&item.weight>0));
  assert.ok(!match.matchedFeatures.some(item=>['f0_q2','f1','f1_q1'].includes(item.id)));
});

test('a specific interest after an unknown broad answer never invents a liking for neighbouring tasks',()=>{
  const roles=[row('desired',{f0:1,f0_q1:1}),row('neighbour',{f0:1,f0_q2:1})];
  const answers=[...core({f0:0}),{questionId:'f0_q1',value:5}];
  const result=rankVacancies({taxonomy,answers,candidates:roles});
  assert.deepEqual(result.matches.map(match=>match.id),['desired']);
  assert.deepEqual(result.matches[0].matchedFeatures.map(feature=>feature.id),['f0_q1']);
  assert.equal(nextQuestion({taxonomy,answers,candidates:roles}).facetId,'f0');
});

test('a large archive is fully considered while identical profiles never multiply adaptive weight',()=>{
  const large=Array.from({length:150000},(_,i)=>({...candidates[i%4],id:'archive-'+String(i).padStart(6,'0')}));
  const answers=core({f0:5,f1:1,f2:4});
  const result=rankVacancies({taxonomy,answers,candidates:large});
  assert.equal(result.considered,150000);assert.equal(result.functionalProfilesConsidered,4);
  assert.equal(result.matches[0].features.f0,1);
  assert.equal(nextQuestion({taxonomy,answers,candidates:large}).id,nextQuestion({taxonomy,answers,candidates}).id);
});

test('the v2 course record declares its source-content basis while valid historical results remain usable',()=>{
  const answers=completeAnswers(3),ranking=rankVacancies({taxonomy,answers,candidates});
  const record=makeCompletionRecord({taxonomy,answers,ranking,indexVersion:'source-v2',recordId:'functional-v2-complete-123456'});
  assert.equal(record.modelVersion,'functional-2.0.0');assert.equal(record.featureBasis,'published-source-content');
  assert.equal(completedCareerRecord(record),true);
  assert.equal(completedCareerRecord({...record,featureBasis:undefined}),false);
  const legacyCore=record.broadQuestionIds.slice(0,20);
  const legacyAnswers=[...legacyCore,...record.answeredQuestionIds.filter(id=>!record.broadQuestionIds.includes(id)).slice(0,12)];
  assert.equal(completedCareerRecord({...record,modelVersion:'functional-1.0.0',featureBasis:undefined,answerCount:32,broadQuestionIds:legacyCore,answeredQuestionIds:legacyAnswers}),true);
});
