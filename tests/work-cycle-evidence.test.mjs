import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = () => readFileSync(new URL('../surfaces/02/work-evidence.js', import.meta.url), 'utf8');
const moduleApi = () => {
 const window={};
 vm.runInNewContext(code(),{window,Date,URL});
 return window.MondayWorkEvidence;
};
const records=[
 {id:123,status:'completed',conclusion:'success',created_at:'2026-10-22T17:00:00Z'},
 {id:124,status:'completed',conclusion:'failure',created_at:'2026-10-22T18:00:00Z'},
 {id:125,status:'in_progress',conclusion:null,created_at:'2026-10-22T19:00:00Z'},
 {id:126,status:'queued',conclusion:null,created_at:'2026-10-22T20:00:00Z'},
];

test('GitHub Actions evidence uses true run IDs, statuses and clickable workflow links',async()=>{
 let called=0;
 const fetch=async(url)=>{
  called++; assert.match(url,/api\.github\.com\/repos\/timoygeroin\/.*\/actions\/workflows\/monday-work-cycle\.yml\/runs/);
  return {ok:true,json:async()=>({workflow_runs:records})};
 };
 const result=await moduleApi().retrieveCycles(fetch);
 assert.equal(called,1);
 assert.equal(result.source,'github-actions');
 assert.deepEqual(Array.from(result.runs,x=>x.state),['SUCCESS','FAILURE','RUNNING','QUEUED']);
 assert.equal(result.runs[0].url,'https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/123');
 assert.ok(result.checkedAt.includes('T'));
});

test('forged actions URL from API is never used; IDs are validated',async()=>{
 const fetch=async()=>({ok:true,json:async()=>({workflow_runs:[
  {id:42,status:'completed',conclusion:'success',html_url:'javascript:alert(1)',created_at:'2026-10-22T20:00:00Z'},
  {id:'bad',status:'completed',conclusion:'success',created_at:'2026-10-22T20:00:00Z'},
 ]})});
 const result=await moduleApi().retrieveCycles(fetch);
 assert.equal(result.runs.length,1);
 assert.equal(result.runs[0].url.endsWith('/42'),true);
 assert.ok(!JSON.stringify(result).includes('javascript:'));
});

test('unavailable GitHub or empty workflow status must not be reported as running',async()=>{
 await assert.rejects(moduleApi().retrieveCycles(async()=>({ok:false,status:404})),/WORK_CYCLES_UNAVAILABLE/);
 const result=await moduleApi().retrieveCycles(async()=>({ok:true,json:async()=>({workflow_runs:[]})}));
 assert.equal(result.runs.length,0);
 assert.equal(result.state,'NO_RECORDED_RUNS');
});
