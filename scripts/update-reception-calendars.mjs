#!/usr/bin/env node
/** Refresh published calendar DATA only. Does not change content keys, law dates or Firebase. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {calendarYearNow,makeCalendarSnapshot} from '../site/assets/js/calendar-model.js';
import {crossCheckCalendars} from '../site/assets/js/calendar-providers.js';
import {fetchPublishedCalendar,readCalendarFeed,calendarReadText} from '../site/assets/js/calendar-repository.js';
import {BUNDLED_CALENDARS} from '../site/assets/js/calendar-bundled.js';
export async function refreshCalendarFeed({now=new Date(),previous=null,reader=fetchPublishedCalendar}={}){
 const year=calendarYearNow(now),years={},rejectedYears=[],unavailableYears=[],diagnostics=[];
 let old=null;try{if(previous)old=readCalendarFeed(previous);}catch{diagnostics.push('Previous feed invalid; using validated bundled seed where applicable.');}
 for(const y of [year-1,year,year+1]){
  const fallback=old?.years[y]||BUNDLED_CALENDARS.years[y];
  try{years[y]=await reader(y,{checkedAt:new Date(now).toISOString(),timeoutMs:12000,allowConsultant:true});}
  catch(error){
   if(fallback){years[y]=fallback;diagnostics.push(`CACHED ${y}: retained published copy (${fallback.checkedAt}).`);}
   else{unavailableYears.push(y);diagnostics.push(`UNAVAILABLE ${y}: published data not available.`);}
  }
 }
 const snapshot=Object.keys(years).length?makeCalendarSnapshot(years):{schema:'rudn-ru-five-day/1',years:{},id:null};
 return {format:'rudn-calendar-feed-1',policy:'published-educational-v1',generatedAt:new Date(now).toISOString(),...snapshot,rejectedYears,unavailableYears,diagnostics};
}
async function calendarUpdaterMain(){
 const args=process.argv.slice(2),allowed=new Set(['--output','--fixtures','--now','--previous-url']);
 const seen=new Set();for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||seen.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Неверные аргументы обновления календаря.');seen.add(args[i]);}
 const readArg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
 if(readArg('--fixtures')&&!readArg('--output'))throw Error('Для тестовых календарей обязателен отдельный --output.');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(readArg('--output')||path.join(root,'site/assets/data/calendars/current.json'));
 const fixture=readArg('--fixtures'),now=readArg('--now')?new Date(readArg('--now')):new Date();
 let previous=null;try{previous=JSON.parse(await fs.readFile(out,'utf8'));}catch{}
 const previousURL=readArg('--previous-url');
 if(previousURL&&!fixture){try{
  const deployed=readCalendarFeed(await calendarReadText(previousURL,{timeoutMs:12000,allowConsultant:true}));
  if(!previous||Date.parse(deployed.generatedAt)>=Date.parse(previous.generatedAt||''))previous=deployed;
 }catch{console.log('Previous published feed unavailable; repository seed and live providers remain available.');}}
 const reader=fixture?async y=>crossCheckCalendars(await fs.readFile(path.join(fixture,`ru${y}.xml`),'utf8'),await fs.readFile(path.join(fixture,`ru${y}.json`),'utf8'),y,now.toISOString()):fetchPublishedCalendar;
 const result=await refreshCalendarFeed({now,previous,reader});
 if(fixture)result.testFixtureRun=true;
 await fs.mkdir(path.dirname(out),{recursive:true});const temp=out+'.tmp';await fs.writeFile(temp,JSON.stringify(result,null,2)+'\n');await fs.rename(temp,out);
 for(const message of result.diagnostics)console.log(message);
 console.log(`Calendar ${calendarYearNow(now)}: ${result.years[calendarYearNow(now)]?'available':'UNAVAILABLE — new shifts must remain blocked'}. Published years: ${Object.keys(result.years).join(', ')}.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))calendarUpdaterMain().catch(error=>{console.error(error.message);process.exitCode=1;});
