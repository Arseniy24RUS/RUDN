/** Presentation policy is shared by all screens and exports, not just result banners. */
export const MODES = Object.freeze({
 practice:Object.freeze({label:'Обучение',feedback:true,score:false,repairs:true,grade:false}),
 assessment:Object.freeze({label:'Самостоятельная работа',feedback:false,score:true,repairs:false,grade:true}),
 demo:Object.freeze({label:'Самостоятельная смена',feedback:false,score:true,repairs:false,grade:false})
});
export function modePolicy(mode){if(!MODES[mode])throw Error('Неизвестный режим');return MODES[mode];}
export function isIndependent(mode){return !modePolicy(mode).feedback;}
