/** Compile preserved source + explicit content reviews + authored translations.
 * No question is activated just because a translation or a key exists.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {availableQuestions,createAttempt,SECTION_IDS} from '../site/assets/js/civil-service-model.mjs';
const root=new URL('../site/data/civil-service/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,root),'utf8'));
const optional=async name=>{try{return await read(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const sourceBytes=await fs.readFile(new URL('mintrud-v4-source.json',root));
const source=JSON.parse(sourceBytes.toString('utf8'));
const sourceBankSha256=createHash('sha256').update(sourceBytes).digest('hex');
if(source.questions.length!==700||source.questions.some((q,i)=>q.number!==i+1))throw Error('The original 700 records must remain complete and sequential.');
const mainReview=await read('mintrud-v4-review.json');
if(mainReview.sourceBank?.sha256!==sourceBankSha256||mainReview.sourceBank?.pdfSha256!==source.source.sha256)throw Error('Content review is bound to a different source bank.');
for(const q of source.questions)for(const asset of q.media){
  if(!asset.path.startsWith('source-assets/mintrud-v4/')||asset.path.includes('..'))throw Error('Invalid source graphic path.');
  const bytes=await fs.readFile(new URL(asset.path,root));
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error(`Source graphic bytes changed: ${asset.path}`);
}
const reviews=new Map(mainReview.questions.map(q=>[q.id,q]));
for(const name of ['mintrud-v4-language-review.json','mintrud-v4-ict-review.json']){
  const supplemental=await optional(name);if(!supplemental)continue;
  if(supplemental.sourceBankSha256!==sourceBankSha256)throw Error(`Supplemental content review is stale: ${name}`);
  const records=Array.isArray(supplemental.questions)?supplemental.questions:Object.entries(supplemental.questions||{}).map(([id,value])=>({id,...value}));
  for(const review of records){const original=source.questions.find(q=>q.id===review.id);if(!original)throw Error(`Unknown reviewed id ${review.id}`);if(!['russian','ict'].includes(original.sectionId))throw Error(`Supplement cannot override a legal review ${review.id}`);reviews.set(review.id,review);}
}
const mediaReview=await optional('mintrud-v4-media-review.json');
if(mediaReview&&(mediaReview.sourceBankSha256!==sourceBankSha256||mediaReview.sourcePdfSha256!==source.source.sha256))throw Error('Graphic acceptance is bound to a different source bank.');
const mediaRecords=Array.isArray(mediaReview?.questions)?Object.fromEntries(mediaReview.questions.map(q=>[q.id,q])):mediaReview?.questions||mediaReview||{};
const translations={en:{},zh:{}};
for(const file of (await fs.readdir(new URL('translations/',root))).filter(file=>/^(en|zh)-.+\.json$/.test(file)).sort()){
  const locale=file.slice(0,2),content=await read('translations/'+file);
  if(content.sourceSha256!==source.source.sha256||content.sourceBankSha256!==sourceBankSha256)throw Error(`Translation source differs: ${file}`);
  for(const [id,entry] of Object.entries(content.entries)){
    if(translations[locale][id])throw Error(`Duplicate translation: ${locale}/${id}`);
    translations[locale][id]=entry;
  }
}
const clean=value=>String(value||'').replace(/\uF05B/g,'[').replace(/\uF05D/g,']').replace(/\uF06C/g,'•');
const labels={
  russian:{ru:'Русский язык',en:'Russian language',zh:'俄语'},
  constitution:{ru:'Конституция и конституционное устройство',en:'Constitution and constitutional system',zh:'宪法与宪法制度'},
  'civil-service':{ru:'Государственная и гражданская служба',en:'State service and civil service',zh:'国家服务与文职公务员制度'},
  'anti-corruption':{ru:'Противодействие коррупции',en:'Anti-corruption',zh:'反腐败'},
  ict:{ru:'Информационные технологии',en:'Information and communication technology',zh:'信息与通信技术'}
};
const questions=source.questions.map(q=>{
  const review=reviews.get(q.id)||{status:'review-needed',reason:'Content has not been reviewed.'};
  const en=translations.en[q.id],zh=translations.zh[q.id];
  const localized=(ru,a,b)=>({ru:clean(ru),en:clean(a),zh:clean(b)});
  const stem=localized(q.stem,en?.stem,zh?.stem);
  const options=q.options.map(option=>({id:option.id,text:localized(option.text,en?.options?.[option.id],zh?.options?.[option.id])}));
  const translationComplete=!!(en&&zh&&stem.en&&stem.zh&&options.every(option=>option.text.en&&option.text.zh));
  const sourceComplete=q.reviewStatus==='source-extracted'||(q.media.length>0&&q.reviewIssues.every(issue=>issue==='question-image-review-required'));
  const graphicsComplete=!q.media.length||mediaReview?.sourcePdfSha256===source.source.sha256&&mediaRecords[q.id]?.status==='verified'&&q.media.every(asset=>mediaRecords[q.id].sourceAssets?.some(accepted=>accepted.path===asset.path&&accepted.sha256===asset.sha256));
  const keyReviewed=Array.isArray(review.checkedCorrectOptionIds)&&review.checkedCorrectOptionIds.length===q.correctOptionIds.length&&q.correctOptionIds.every(id=>review.checkedCorrectOptionIds.includes(id));
  const status=review.status==='retired'?'retired':review.status==='verified'&&translationComplete&&sourceComplete&&graphicsComplete&&keyReviewed?'verified':'review-needed';
  const normUrls=[review.sourceUrl,...(review.sourceUrls||[]),...(review.sourceRefs||[]).map(ref=>mainReview.sources?.[ref.sourceId]?.url)].filter(Boolean);
  const compiled={id:q.id,number:q.number,sectionId:q.sectionId,stem,options,correctOptionIds:q.correctOptionIds,
    sourcePage:q.sourcePage,review:{status,checkedAt:review.checkedAt||null,reason:review.reason,sourceUrls:[`${source.source.url}#page=${q.sourcePage}`,...new Set(normUrls)],contentStatus:review.status,translationComplete,graphicsComplete,sourceComplete,keyReviewed}};
  if(q.media.length){if(q.media.length!==1)throw Error(`Multiple graphic panels require explicit layout: ${q.id}`);compiled.media={src:`data/civil-service/${q.media[0].path}`,sha256:q.media[0].sha256,alt:labels[q.sectionId]};}
  return compiled;
});
const reviewedAt='2026-10-27';
const content={schemaVersion:1,reviewedAt,source:{...source.source,sourceBankSha256,title:{ru:'Минтруд: комплекс тестовых вопросов с ответами',en:'Ministry of Labour: test questions and answers',zh:'劳动部：测试题与答案汇编'},questionCount:700},sections:SECTION_IDS.map(id=>({id,label:labels[id]})),questions};
const digest=createHash('sha256').update(JSON.stringify(content)).digest('hex');
const bank={...content,contentVersion:`mintrud-v4-review-${digest.slice(0,16)}`};
const active=availableQuestions(bank),counts=Object.fromEntries(SECTION_IDS.map(id=>[id,active.filter(q=>q.sectionId===id).length]));
if(!process.argv.includes('--allow-incomplete'))createAttempt(bank,{seed:1,id:'build-validation',startedAt:0});
await fs.writeFile(new URL('mintrud-v4-reviewed.json',root),JSON.stringify(bank)+'\n');
const report={schemaVersion:1,contentVersion:bank.contentVersion,sourceQuestions:700,activeQuestions:active.length,activeBySection:counts,retired:questions.filter(q=>q.review.status==='retired').map(q=>q.number),pending:questions.filter(q=>q.review.status==='review-needed').map(q=>q.number),translated:{en:Object.keys(translations.en).length,zh:Object.keys(translations.zh).length},sha256:digest,auditStatus:mainReview.auditStatus};
await fs.writeFile(new URL('build-review.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
