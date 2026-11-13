#!/usr/bin/env node
/** Explicit local fixture. Never deploy or seed; its grades are scripted test values. */
import path from 'node:path';
import os from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {createCorrespondenceQACase,correspondenceQAProfiles,explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';
const index=process.argv.indexOf('--port'),port=Number(index<0?8795:process.argv[index+1]);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a local port between 1024 and 65535');
const c=await createCorrespondenceQACase();
const directory=path.join(os.tmpdir(),'reception-correspondence-local-qa');await mkdir(directory,{recursive:true});
await writeFile(path.join(directory,c.id+'.json'),JSON.stringify(c));
const reviewer=createScriptedCorrespondenceReviewer({reviews:Array.from({length:100},()=>context=>explicitQAReview(context,{initialLevel:3,controlLevel:3}))});
const fixture=await createReceptionFixture({casesDirectory:directory,decisionVersion:'correspondence-v1',
  serviceOptions:{correspondenceProfiles:correspondenceQAProfiles},provider:{...reviewer,name:'mock',generate:async({actorCase})=>({
    reply:actorCase.facts[0].text.ru,revealedFactIds:[actorCase.facts[0].id],releasedDocumentIds:[],usage:{inputTokens:0,outputTokens:0}})}});
fixture.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${port}/__qa/reception.html`,provider:'scripted-mock',caseCount:1,production:false})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>fixture.server.close(()=>process.exit(0)));
