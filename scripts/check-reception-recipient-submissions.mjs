/** Offline exhaustive submit-context contract. No model or cloud operations.
 * Recipient suitability is deliberately outside this rendering/crash audit.
 * The only reported error values are public recipient IDs, locales and codes.
 */
import {ROUTING_AUTHORITY_IDS, ROUTING_AUTHORITIES, ROUTING_AUTHORITY_ALIASES} from '../firebase/functions/reception-ai/routing-directory.mjs';
import {privateCorrespondenceProfile} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {validateCorrespondence, resolveCorrespondenceCitations, buildCorrespondenceReview} from '../firebase/functions/reception-ai/correspondence.mjs';
import {resolveLegalCitation} from '../firebase/functions/reception-ai/correspondence-legal-sources.mjs';

const locales=['ru','en','zh'];
const local=(value,locale)=>typeof value==='string'?value:value?.[locale]||value?.ru||'';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Inputs are copied; results never contain dossier text or thrown messages.
 * buildDecision(caseData,view,locale,{recipientIds:[id]}) supplies the submission.
 * Async only because the existing pinned local citation resolver reads files.
 */
export async function checkRecipientSubmissionContexts({caseData,view,buildDecision}={}) {
  const ids=[...ROUTING_AUTHORITY_IDS];
  const report={status:'FAIL',counts:{recipientIds:ids.length,locales:locales.length,
    expectedContexts:ids.length*locales.length,attemptedContexts:0,validatedContexts:0,reviewContexts:0,errorCount:0},errors:[],errorsTruncated:false};
  const add=(recipientId,locale,code)=>{
    report.counts.errorCount++;
    if(report.errors.length<100)report.errors.push({recipientId,locale,code});
    else report.errorsTruncated=true;
  };
  let c,v,profile,state;
  try {
    c=structuredClone(caseData);v=structuredClone(view);
    if(typeof buildDecision!=='function')throw Error();
    profile=privateCorrespondenceProfile(c);
    if(!profile)throw Error();
    state={knownFactIds:[...(v.knownFactIds||c.facts.map(row=>row.id))],
      openedDocumentIds:[...(v.openedDocumentIds||[])],messages:structuredClone(v.messages||[]),correspondenceEvidence:[]};
  }catch{
    add(null,null,'invalid_audit_input');return report;
  }
  for(const locale of locales){
    // Resolve identical citations once per locale, while validating every order.
    const citationCache=new Map();
    for(const recipientId of ids){
      report.counts.attemptedContexts++;
      let decision,validated;
      try{
        decision=buildDecision(c,v,locale,{recipientIds:[recipientId]});
        validated=validateCorrespondence(decision.correspondence,c,state,locale);
        if(validated.orders.length!==1||!same(validated.orders[0].recipientIds,[recipientId])
          ||!same(decision.correspondence.orders[0].recipientIds,[recipientId])){
          add(recipientId,locale,'recipient_id_changed');continue;
        }
        report.counts.validatedContexts++;
      }catch{add(recipientId,locale,'order_validation_failed');continue;}
      let resolvedCitations;
      try{
        const key=JSON.stringify(validated.citations);
        if(!citationCache.has(key))citationCache.set(key,await resolveCorrespondenceCitations(c,state,validated,locale,{resolveLegalCitation}));
        resolvedCitations=citationCache.get(key);
      }catch{add(recipientId,locale,'citation_resolution_failed');continue;}
      try{
        const reviewedDecision={...decision,correspondence:validated};
        const review=buildCorrespondenceReview(c,{...state,decision:reviewedDecision},reviewedDecision,locale,{profile,resolvedCitations});
        report.counts.reviewContexts++;
        const canonical=ROUTING_AUTHORITY_ALIASES[recipientId]||recipientId;
        const name=local((ROUTING_AUTHORITIES[recipientId]||ROUTING_AUTHORITIES[canonical])?.name,locale);
        const orders=review.sections?.orders;
        if(typeof orders!=='string'||!orders.trim()||!name||!orders.includes(name))add(recipientId,locale,'recipient_name_missing');
        if(typeof orders==='string'&&orders.includes('undefined'))add(recipientId,locale,'undefined_order_text');
        if(!same(validated.orders[0].recipientIds,[recipientId])||!same(decision.correspondence.orders[0].recipientIds,[recipientId]))add(recipientId,locale,'recipient_id_changed');
      }catch{add(recipientId,locale,'review_context_failed');}
    }
  }
  report.status=report.counts.errorCount===0&&report.counts.reviewContexts===report.counts.expectedContexts?'PASS':'FAIL';
  return report;
}
