/** Reproduce legacy save/rubric compatibility against an immutable Git baseline.
 * Usage: node scripts/test_governor_legacy_compat.mjs [--baseline <commit-sha>] [--output <results.json>]
 * The default is the pre-update release, never the checkout's current HEAD.
 * Scope: 4 scenarios x 2 routes x 2 budget modes, one seed, deferred decisions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assessCampaign} from '../site/apps/governor/platform-contract.js';

const DEFAULT_BASELINE='205d79fd46996318cdeb5cb9ef6f3553f5c06026';
const repository=fileURLToPath(new URL('..',import.meta.url));
let baseline=DEFAULT_BASELINE,output=null;
for(let i=2;i<process.argv.length;i++){
  const argument=process.argv[i];
  if(argument==='--baseline'&&process.argv[i+1])baseline=process.argv[++i];
  else if(argument==='--output'&&process.argv[i+1])output=path.resolve(process.argv[++i]);
  else if(argument==='--help'){
    console.log('Usage: node scripts/test_governor_legacy_compat.mjs [--baseline <commit-sha>] [--output <results.json>]');process.exit(0);
  }else throw new Error('Unknown or incomplete argument: '+argument);
}
if(!/^[a-f0-9]{7,40}$/i.test(baseline))throw new Error('Baseline must be a Git commit SHA (7–40 hexadecimal characters).');
const git=(...args)=>execFileSync('git',args,{cwd:repository,encoding:'utf8',maxBuffer:20*1024*1024});
const baselineCommit=git('rev-parse','--verify',baseline+'^{commit}').trim();
const digest=value=>createHash('sha256').update(value).digest('hex');
const names=['game-data','stage3-data','stage4-data','consolidation-data','agenda','project-state','population',
  'recovery','budget-review','finance','governance-data','governance','stories-data','stories','world-outcomes','state-integrity','engine'];
const currentNames=[...names.slice(0,-2),'campaign-strategy',...names.slice(-2)];
const sourceHashes={baseline:{},current:{}};
async function loadGame(list,legacy){
  const sandbox={console};sandbox.window=sandbox;vm.createContext(sandbox);
  for(const name of list){
    const logical=`site/apps/governor/src/${name}.js`;
    const source=legacy?git('show',`${baselineCommit}:${logical}`):await fs.readFile(path.join(repository,logical),'utf8');
    sourceHashes[legacy?'baseline':'current'][logical]=digest(source);
    vm.runInContext(source,sandbox,{filename:(legacy?baselineCommit+':':'')+logical});
  }
  return sandbox.GovernorGame;
}
const legacyGame=await loadGame(names,true),currentGame=await loadGame(currentNames,false);
const contractPath='site/apps/governor/platform-contract.js';
const legacyContractSource=git('show',`${baselineCommit}:${contractPath}`);
sourceHashes.baseline[contractPath]=digest(legacyContractSource);
sourceHashes.current[contractPath]=digest(await fs.readFile(path.join(repository,contractPath),'utf8'));
const legacyContract=await import('data:text/javascript;base64,'+Buffer.from(legacyContractSource).toString('base64'));
const seed='LEGACY-REVIEW',campaigns=[],failures=[];
let checkedStates=0,restoredStates=0,matchingRubrics=0,pendingBudgetReviews=0;
function check(state,row,phase){
  checkedStates++;row.checkedStates++;
  const label=`${row.scenario}/${row.campaignMode}/${row.budgetMode}/${state.turnIndex}/${phase}`;
  const restored=currentGame.Engine.restoreState(JSON.stringify(state));
  if(!restored){failures.push({label,kind:'restore-rejected'});return;}
  restoredStates++;
  const expected=legacyContract.assessCampaign(state,legacyGame),actual=assessCampaign(restored,currentGame);
  const expectedJSON=JSON.stringify(expected),actualJSON=JSON.stringify(actual);
  const evidence={phase,turnIndex:state.turnIndex,decisions:state.history.length,assessmentVersion:actual.version,
    legacyAssessmentSha256:digest(expectedJSON),restoredAssessmentSha256:digest(actualJSON)};
  row.checkpoints.push(evidence);
  if(expected.version!=='governor-assignment-v1'||actual.version!=='governor-assignment-v1')failures.push({label,kind:'rubric-version',expected:expected.version,actual:actual.version});
  if(expectedJSON!==actualJSON)failures.push({label,kind:'rubric-mismatch',expected,actual});
  else matchingRubrics++;
}
function settle(state,row,phase){
  for(let guard=0;legacyGame.BudgetReview.pending(state)&&!legacyGame.BudgetReview.stopped(state);guard++){
    if(guard>=15)throw new Error('Legacy budget review did not resolve: '+row.scenario);
    pendingBudgetReviews++;check(state,row,phase+'-pending-budget');
    const options=state.budgetReview.pending.event.options;
    const choice=['reserve','grant','loan'].map(id=>options.find(item=>item.id===id&&item.available)).find(Boolean);
    if(choice)legacyGame.Engine.resolveBudgetReview(state,choice.id);else legacyGame.Engine.endUnderSupervision(state);
  }
}
for(const scenario of legacyGame.DATA.scenarios)for(const campaignMode of ['agenda','guided'])for(const budgetMode of ['automatic','decisions']){
  const row={scenario:scenario.id,campaignMode,budgetMode,seed,checkedStates:0,checkpoints:[]};
  const state=legacyGame.Engine.createState({scenarioId:scenario.id,seed,campaignMode,budgetMode});
  check(state,row,'start');
  while(!state.completed&&!legacyGame.BudgetReview.stopped(state)){
    if(legacyGame.Agenda.needsChoice(state))legacyGame.Engine.chooseAgenda(state,legacyGame.Agenda.OPERATIONS.id);
    const mission=legacyGame.Engine.getCurrentMission(state),action=mission.actions.find(item=>item.deferred);
    legacyGame.Engine.commitAction(state,action.id,'treasury');settle(state,row,'commit');check(state,row,'commit');
    if(!legacyGame.BudgetReview.stopped(state)){
      legacyGame.Engine.advanceTurn(state);settle(state,row,'advance');check(state,row,'advance');
    }
  }
  row.completed=state.completed;row.decisions=state.history.length;row.finalPoints=legacyContract.assessCampaign(state,legacyGame).points;
  campaigns.push(row);
}
const report={schema:1,status:failures.length?'fail':'pass',baselineCommit,generatedAt:new Date().toISOString(),
  method:{stateGenerator:'Modules read using git show <baselineCommit>:<path>',restoration:'Current working-tree Engine.restoreState',
    comparison:'Exact JSON.stringify equality of the full v1 assessment, including criteria and explanatory text',
    policy:'Defer every annual decision using the legacy rules; no new projects',seed,
    budgetReviewPreference:['reserve','grant','loan','supervision']},
  summary:{campaigns:campaigns.length,completedCampaigns:campaigns.filter(row=>row.completed).length,checkedStates,restoredStates,matchingRubrics,pendingBudgetReviews,failures:failures.length},
  sourceHashes,campaigns,failures};
if(output){await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,baselineCommit,...report.summary,output},null,2));
}else console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
