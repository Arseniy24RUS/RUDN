/** Local acceptance fixture only. Uses an authored public story and the actual
 * execution profile; never represents a downloaded production Firebase dossier. */
import {createCorrespondenceQACase,explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {getCorrespondenceProfile,publicCorrespondenceProfile} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {ROUTING_RECIPIENTS} from '../firebase/functions/reception-ai/routing-cases.mjs';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';

export const executionQAIdentity={uid:'execution-acceptance',studentKey:'12345678'};
export const executionQAProfiles={
  private:c=>getCorrespondenceProfile(c.id),
  public:(c,locale)=>publicCorrespondenceProfile(c.id,locale),
};
export async function createExecutionQA({store=createMemoryStore(),reviews,assertContext,config={},context}={}){
  const c=await createCorrespondenceQACase();
  const profile=getCorrespondenceProfile(c.id);
  if(profile?.control?.workflow?.version!=='execution-v1')throw Error('Generate the authored execution profiles before running this fixture.');
  const reviewer=createScriptedCorrespondenceReviewer({
    reviews:reviews||[ctx=>explicitQAReview(ctx,{initialLevel:3}),ctx=>explicitQAReview(ctx,{controlLevel:3})],assertContext,
  });
  const provider={...reviewer,name:'mock',generate:async()=>({reply:'Обстоятельства изложены в материалах дела.',revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:0,outputTokens:0}})};
  const service=createReceptionService({store,cases:[c],provider,correspondenceProfiles:executionQAProfiles,config,requireGameplay:Boolean(context)});
  const decision={deadline:c.rubric.deadline,workbook:{referralDeadline:'',registrationTimely:true,routing:{recipientIds:ROUTING_RECIPIENTS[c.id][0]}},
    correspondence:{version:1,kind:'reply',subject:'О дорожке и проверке прежнего ответа',
      sections:{facts:'В обращении два вопроса: состояние дорожки и достоверность прежнего ответа. Результаты необходимо установить раздельно.',
        legalBasis:'Жалоба на прежний ответ требует самостоятельного рассмотрения в пределах компетенции.',
        resolution:'Организовать проверку состояния дорожки и независимое рассмотрение доводов жалобы. Установить результаты по каждому предмету.',
        nextSteps:'Проверить подтверждающие документы и сообщить заявительнице отдельный результат по каждому вопросу.'},
      citations:c.documents.slice(0,2).map((doc,i)=>({id:'source-'+i,kind:'document',section:'facts',sourceId:doc.id,quote:doc.text.ru})),
      orders:[{id:'complaint-order',issue:profile.control.workflow.issues[1].id,kind:'review',recipientIds:['independent-review'],instruction:'Провести независимую проверку доводов жалобы.',dueDate:'2026-11-19',expectedResult:'Мотивированное заключение по каждому доводу.',citationIds:[]}],
    }};
  const start=async({requestId='start-execution',controlVersion='execution-v1'}={})=>(await service.handle({op:'start',mode:'training',locale:'ru',requestId,
    decisionVersion:'correspondence-v1',workbookVersion:2,...(controlVersion?{controlVersion}:{}),...(context?{context}:{})},executionQAIdentity)).view;
  const open=async view=>{
    let current=view;
    for(const doc of c.documents)current=(await service.handle({op:'document',sessionId:view.id,documentId:doc.id,requestId:'open-'+doc.id},executionQAIdentity)).view;
    return current;
  };
  const decide=async view=>(await service.handle({op:'decide',sessionId:view.id,requestId:'initial-review',expectedRevision:view.revision,decision},executionQAIdentity)).view;
  const apply=async(view,action,requestId='step-'+view.revision)=>(await service.handle({op:'control-action',sessionId:view.id,requestId,expectedRevision:view.revision,action},executionQAIdentity)).view;
  return {c,profile,store,reviewer,provider,service,start,open,decide,apply,decision};
}
export function executionQAAction(profile,kind,issueId,evidenceSourceIds,changes={}){
  const definition=profile.control.workflow;
  const all=definition.issues.flatMap(issue=>[issue,...(issue.newIssue?[issue.newIssue]:[])]);
  const issue=all.find(issue=>issue.id===issueId);
  return {issueId,kind,reason:'Проверяется результат именно по указанному самостоятельному предмету обращения.',
    instruction:'Сопоставить представленный материал с предметом и объёмом поручения; отдельно установить, что подтверждено и что требует продолжения работы.',
    recipientIds:issue?.acceptedRecipientSets?.[0]||[],dueDate:'2026-11-19',expectedResult:'Относимое подтверждение установленного результата и мотивированное сообщение заявительнице.',
    evidenceSourceIds,...changes};
}
