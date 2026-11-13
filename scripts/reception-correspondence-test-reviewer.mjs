/** Explicit local/CI injection only. Never imported by Functions or used as a fallback.
 * A script is mandatory: an exhausted script or a missing assessment throws.
 * It deliberately has no "full marks" default and does not evaluate student language.
 */
export function createScriptedCorrespondenceReviewer({reviews,assertContext}={}) {
  if(!Array.isArray(reviews)||!reviews.length)throw new TypeError('Explicit scripted reviews are required');
  const queue=reviews.map(value=>typeof value==='function'?value:structuredClone(value));
  let calls=0;
  return {
    name:'mock',maxReviewCalls:1,maxReviewOutputTokens:3600,
    get reviewCalls(){return calls;},
    async reviewDecision({context,signal}) {
      if(signal?.aborted)throw new Error('Test review cancelled');
      await assertContext?.(context,calls);
      if(calls>=queue.length)throw new Error('No scripted review for this request');
      const item=queue[calls++];
      const review=typeof item==='function'?await item(structuredClone(context)):structuredClone(item);
      if(!review)throw new Error('Script did not provide a review');
      return {review,verified:true,usage:{inputTokens:0,outputTokens:0}};
    },
  };
}
