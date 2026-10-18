// Receipt queues for new five-task attempts have their own durable draft scope.
export function legalLabSaveMode(attempt={}){
  if(['legal-lab-workspace','legal-lab-assessment'].includes(attempt.draftMode))return attempt.draftMode;
  return /-r-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.id||'')?'legal-lab-assessment':'legal-lab-workspace';
}
export function legalLabSaveMessageKey(state){
  if(state==='device-only')return 'device';
  return ['pending','unsafe','conflict','saved'].includes(state)?state:'unknown';
}
