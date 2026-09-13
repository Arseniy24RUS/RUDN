/* Display-only localisation. Never mutates a campaign, a content ID or a source dictionary. */
(function(root){
  'use strict';
  const G=root.GovernorGame||(root.GovernorGame={});
  // Authored labels from already-saved reports; not added to live game data.
  const legacyReportLabels=[
    {ru:'Не запускать новую меру в этом году',en:'Do not launch a new measure this year'},
    {ru:'Работать силами действующих служб',en:'Work through existing services'},
    {ru:'Досрочная передача финансового управления: этот критерий равен 0.',en:'Early financial handover: this criterion earns 0.'},
    {ru:'Нормированный запас долга {0}; прогнозных лет с покрытием {1}/3.',en:'Normalised debt headroom {0}; projected years with funding {1}/3.'}
  ];
  let language='ru',catalog=null,exact=new Map(),patterns=[],authoredExact=new Map(),authoredPatterns=[];
  const normalize=value=>value==='zh'||value==='zh-Hans'?'zh':value==='en'?'en':'ru';
  const intlLocale=value=>({ru:'ru-RU',en:'en-US',zh:'zh-CN'}[normalize(value)]);
  const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function prepare(){
    if(catalog===G.ChineseCatalog)return;
    catalog=G.ChineseCatalog||[];exact=new Map();patterns=[];authoredExact=new Map();authoredPatterns=[];
    for(const entry of catalog){
      // A separate bidirectional index is used only for known authored fields
      // in historical reports. The normal UI translation contract stays intact.
      const legacy=legacyReportLabels.find(row=>row.ru===entry.ru);
      const authoredEntry=legacy?{...entry,en:entry.en??legacy.en}:entry;
      for(const source of [authoredEntry.ru,authoredEntry.en,authoredEntry.zh].filter(value=>typeof value==='string'&&value)){
        if(!authoredExact.has(source))authoredExact.set(source,authoredEntry);
        const weight=source.replace(/\{\d+\}/g,'').length;
        if(!weight||!/\{\d+\}/.test(source))continue;
        const ids=[];
        const expression=source.split(/(\{\d+\})/).map(part=>{
          const token=/^\{(\d+)\}$/.exec(part);
          if(!token)return escapeRegex(part);
          ids.push(Number(token[1]));return '([\\s\\S]*?)';
        }).join('');
        authoredPatterns.push({re:new RegExp('^'+expression+'$'),ids,entry:authoredEntry,weight});
      }
      exact.set(entry.ru,entry.zh);
      // English is also indexed for legacy display-only arrays. Russian remains
      // the canonical key, so changing language never changes saved content.
      if(entry.en&&!exact.has(entry.en))exact.set(entry.en,entry.zh);
      for(const source of [entry.ru,entry.en].filter(Boolean)){
        if(!/\{\d+\}/.test(source))continue;
        const ids=[];
        const expression=source.split(/(\{\d+\})/).map(part=>{
          const token=/^\{(\d+)\}$/.exec(part);
          if(!token)return escapeRegex(part);
          ids.push(Number(token[1]));return '([\\s\\S]*?)';
        }).join('');
        patterns.push({re:new RegExp('^'+expression+'$'),ids,value:entry.zh,weight:source.replace(/\{\d+\}/g,'').length});
      }
    }
    patterns.sort((a,b)=>b.weight-a.weight);
    authoredPatterns.sort((a,b)=>b.weight-a.weight);
  }
  function authored(value,locale=language){
    if(Array.isArray(value))return value.map(item=>authored(item,locale));
    if(typeof value!=='string')return value;
    prepare();
    const lang=normalize(locale),direct=authoredExact.get(value);
    if(direct)return direct[lang]??value;
    for(const pattern of authoredPatterns){
      const match=pattern.re.exec(value);if(!match)continue;
      const variables=new Map();let consistent=true;
      pattern.ids.forEach((id,i)=>{
        if(variables.has(id)&&variables.get(id)!==match[i+1])consistent=false;
        variables.set(id,match[i+1]);
      });
      const target=pattern.entry[lang];
      if(!consistent||typeof target!=='string')continue;
      if([...target.matchAll(/\{(\d+)\}/g)].some(token=>!variables.has(Number(token[1]))))continue;
      // This one published rubric template embeds another authored criterion
      // sentence, not student input. No other captured slot is translated.
      if(pattern.entry.id==='45f464beb931'&&variables.has(0))variables.set(0,authored(variables.get(0),lang));
      return target.replace(/\{(\d+)\}/g,(_,id)=>variables.get(Number(id)));
    }
    // Unknown authored revisions and user-entered strings remain byte-for-byte unchanged.
    return value;
  }
  function translate(value){
    if(Array.isArray(value))return value.map(translate);
    if(value==null)return '';
    if(typeof value!=='string')return value;
    prepare();
    if(exact.has(value))return exact.get(value);
    for(const pattern of patterns){
      const match=pattern.re.exec(value);if(!match)continue;
      const variables=new Map(pattern.ids.map((id,i)=>[id,match[i+1]]));
      // Insert captured values verbatim: names, IDs, amounts and HTML are not translated.
      return pattern.value.replace(/\{(\d+)\}/g,(token,id)=>variables.get(Number(id))??token);
    }
    return value;
  }
  function choose(locale,ru,en){
    const lang=normalize(locale),selected=lang==='en'?en:ru;
    const value=typeof selected==='function'?selected():selected;
    return lang==='zh'?translate(value):value;
  }
  function local(value,locale=language){
    const lang=normalize(locale);
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      if(lang==='zh')return value.zh??value['zh-Hans']??translate(value.ru??value.en??'');
      return value[lang]||value.ru||value.en||'';
    }
    const text=value==null?'':String(value);
    return lang==='zh'?translate(text):text;
  }
  function install(data){
    if(!data?.ui||Object.hasOwn(data.ui,'zh'))return;
    Object.defineProperty(data.ui,'zh',{enumerable:true,value:new Proxy(Object.create(null),{
      get:(_,key)=>typeof key==='string'?translate(data.ui.ru[key]??data.ui.en[key]):undefined,
      ownKeys:()=>Reflect.ownKeys(data.ui.ru),
      getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})
    })});
  }
  const ready=()=>Array.isArray(G.ChineseCatalog)&&G.ChineseCatalog.length>=2031&&G.ChineseCatalog.every(entry=>entry.zh);
  const api={normalize,intlLocale,choose,local,translate,authored,install,ready,setLanguage:value=>(language=normalize(value)),getLanguage:()=>language};
  G.I18n=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
