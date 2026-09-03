import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const forms=[
  {slug:'final',id:'6942211eeb614611ffe23a2f',activity:'seminar-8',title:'Итоговый тест'},
  {slug:'seminar1',id:'68c075f9e010db424bd32329',activity:'seminar-1',title:'Ветви и уровни власти'},
  {slug:'seminar1-short',id:'68c02222d04688cf22bd64b2',activity:null,title:'Короткая копия первого квиза'},
  {slug:'seminar4',id:'68f77ecf6d2d7306fb5dffeb',activity:'seminar-4',title:'Нормативные правовые акты'},
  {slug:'seminar5',id:'690a364949af472a6ee7642c',activity:'seminar-5',title:'Обращения граждан'},
  {slug:'lecture1',id:'68c06d9ef47e7342d327d326',activity:'lecture-1',title:'Лекция 1'},
  {slug:'lecture2',id:'68e78afe90fa7b71d6fd67af',activity:'lecture-2',title:'Лекция 2'},
  {slug:'lecture3',id:'68e78d6c5056908215e08c66',activity:'lecture-3',title:'Лекция 3'},
  {slug:'lecture4',id:'68e78f3502848fa2f6ec2755',activity:'lecture-4',title:'Лекция 4'},
  {slug:'lecture5',id:'691f1d9595add564a410cc25',activity:'lecture-6',title:'Документооборот и делопроизводство (старая нумерация: лекция 5)'}
];

const root=path.resolve('site');
await fs.mkdir(path.join(root,'data','source-forms'),{recursive:true});
await fs.mkdir(path.join(root,'media','forms'),{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({locale:'ru-RU'});
const questions=[];const inventory=[];const seen=new Set();

const textOf=v=>{if(v==null)return'';if(typeof v==='string')return v.trim();if(typeof v==='number')return String(v);if(Array.isArray(v))return v.map(textOf).filter(Boolean).join(' ');if(typeof v==='object'){for(const k of ['label','title','text','name','value','caption','description']){const t=textOf(v[k]);if(t)return t}}return''};
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const idOf=(obj,fallback)=>String(obj?.id||obj?.uuid||obj?.key||fallback);
const isPrivatePrompt=s=>/фио|фамили|имя студента|номер группы|учебн.*групп|student name|full name/i.test(s);
const imageUrl=image=>{const links=image?.links||image?.image?.links||{};return links['2560x']||links['1280x']||links['720x']||links['360x']||links['324x180']||Object.values(links)[0]||''};
function findArrays(obj,trail=[],out=[]){if(!obj||typeof obj!=='object')return out;if(Array.isArray(obj)){if(obj.length&&obj.length<=40&&obj.every(x=>typeof x==='string'||typeof x==='number'||(x&&typeof x==='object')))out.push({trail,arr:obj});obj.forEach((x,i)=>findArrays(x,[...trail,String(i)],out));return out}for(const [k,v] of Object.entries(obj)){if(['pages','items'].includes(k))continue;findArrays(v,[...trail,k],out)}return out}
function optionsFrom(item){const direct=[item.options,item.answers,item.variants,item.choices,item.data?.options,item.data?.answers,item.params?.options,item.settings?.options].find(Array.isArray);const arrays=direct?[{trail:['direct'],arr:direct}]:findArrays(item);let best=[];for(const cand of arrays){const opts=cand.arr.map((v,i)=>{if(typeof v==='string'||typeof v==='number')return{id:String(i),text:String(v),correct:false};const text=clean(textOf(v));if(!text)return null;let correct=Boolean(v.correct||v.isCorrect||v.is_correct);for(const k of ['weight','score','fraction','points','valueScore']){if(v[k]!=null&&!Number.isNaN(Number(v[k]))&&Number(v[k])>0)correct=true}return{id:idOf(v,i),text,correct}}).filter(Boolean);if(opts.length>=2&&opts.length>best.length)best=opts}const explicit=item.correctAnswers||item.correct_answers||item.answerKey||item.correctAnswer;if(explicit!=null){const vals=(Array.isArray(explicit)?explicit:[explicit]).map(x=>String(typeof x==='object'?(x.id??x.value??textOf(x)):x));for(const o of best)if(vals.includes(o.id)||vals.includes(o.text))o.correct=true}return best}
function typeOf(item,options){const raw=String(item.type||item.widget||item.kind||'').toLowerCase();if(/checkbox|multi/.test(raw))return'multiple';if(/radio|select|choice/.test(raw)&&options.length)return'single';if(/textarea|essay|long/.test(raw))return'essay';if(/input|text|short/.test(raw))return'short';return options.length?'single':'short'}
async function downloadMedia(url,slug,key){if(!url)return'';try{const r=await context.request.get(url,{timeout:60000});if(!r.ok())throw new Error(`HTTP ${r.status()}`);const b=await r.body(),ct=r.headers()['content-type']||'';const ext=ct.includes('png')?'.png':ct.includes('webp')?'.webp':ct.includes('gif')?'.gif':'.jpg';const dir=path.join(root,'media','forms',slug);await fs.mkdir(dir,{recursive:true});const file=`${key}${ext}`;await fs.writeFile(path.join(dir,file),b);return`./media/forms/${slug}/${file}`}catch(e){console.warn('media',slug,key,String(e));return''}}

for(const form of forms){const page=await context.newPage();let survey=null,error='';try{const wait=page.waitForResponse(r=>r.url().includes('/gateway/root/form/getSurvey')&&r.status()===200,{timeout:70000});await page.goto(`https://forms.yandex.ru/cloud/${form.id}/`,{waitUntil:'domcontentloaded',timeout:90000});survey=await (await wait).json();await fs.writeFile(path.join(root,'data','source-forms',`${form.slug}.json`),JSON.stringify(survey,null,2))}catch(e){error=String(e);console.warn(form.slug,error)}
  if(!survey){inventory.push({...form,ok:false,error});await page.close();continue}
  let count=0,mediaCount=0;
  for(let pi=0;pi<(survey.pages||[]).length;pi++){
    const pg=survey.pages[pi]||{};const pageTitle=clean(textOf(pg.title||pg.name||pg.label));
    for(let ii=0;ii<(pg.items||[]).length;ii++){
      const item=pg.items[ii]||{};const prompt=clean(textOf(item));if(!prompt||isPrivatePrompt(prompt))continue;
      const options=optionsFrom(item);const qtype=typeOf(item,options);if(!options.length&&qtype==='short'&&prompt.length<3)continue;
      const fingerprint=crypto.createHash('sha1').update(`${form.slug}|${pi}|${prompt}|${options.map(o=>o.text).join('|')}`).digest('hex').slice(0,16);if(seen.has(fingerprint))continue;seen.add(fingerprint);
      const image=imageUrl(item.image||item);const localImage=await downloadMedia(image,form.slug,`${String(pi+1).padStart(3,'0')}-${String(ii+1).padStart(2,'0')}`);if(localImage)mediaCount++;
      count++;questions.push({id:`${form.slug}-${fingerprint}`,activity:form.activity,type:qtype,prompt:{ru:prompt,en:prompt,zh:prompt},options:options.map(o=>({id:o.id,text:{ru:o.text,en:o.text,zh:o.text},correct:o.correct})),media:localImage?{photo:localImage}:{},metadata:{sourceFormId:form.id,sourceForm:form.title,page:pi+1,pageTitle,item:ii+1,sourceItemId:item.id||null}})
    }
  }
  inventory.push({...form,ok:true,pages:(survey.pages||[]).length,questions:count,media:mediaCount});await page.close();
}
await browser.close();
await fs.writeFile(path.join(root,'data','questions.json'),JSON.stringify(questions,null,2));
await fs.writeFile(path.join(root,'data','forms-inventory.json'),JSON.stringify(inventory,null,2));
console.log(JSON.stringify({questions:questions.length,forms:inventory},null,2));
