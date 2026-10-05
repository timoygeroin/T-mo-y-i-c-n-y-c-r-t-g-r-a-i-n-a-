import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWorkReadiness } from '../src/work-readiness.mjs';
import statusHandler from '../api/status.mjs';

test('phone-only work can use host tools without declaring the read server an executor',()=>{
  const out=describeWorkReadiness({env:{MONDAYID_WORLDLINE_URL:'https://state.invalid'}});
  assert.equal(out.humanInterface.userComputerRequired,false);
  assert.equal(out.humanInterface.nativeAppRequiredForHostWork,false);
  assert.equal(out.hostWork.requiresCustomMcp,false);
  assert.equal(out.controlPlane.generalTaskExecutor,false);
  assert.equal(out.standaloneChat.state,'MODEL_EXECUTION_DISABLED');
  assert.equal(out.wholeProductComplete,false);
});

test('configuration alone cannot prove a paid model, shared write, or iPhone acceptance',()=>{
  const env={MONDAYID_MODEL_EXECUTION_ENABLED:'true',MONDAYID_API_SPEND_ENABLED:'true',OPENAI_API_KEY:'test-secret',MONDAYID_HOST_TOKEN:'test-secret',MONDAYID_WORLDLINE_URL:'https://state.invalid',MONDAYID_WORLDLINE_WRITER_TOKEN:'test-secret'};
  const out=describeWorkReadiness({env});
  assert.equal(out.standaloneChat.configured,true);
  assert.equal(out.standaloneChat.verified,false);
  assert.equal(out.sharedWrite.verified,false);
  assert.equal(out.physicalIphoneAcceptance,'NOT_OBSERVED_BY_SERVER');
  assert.equal(JSON.stringify(out).includes('test-secret'),false);
  assert.equal(describeWorkReadiness({env:{...env,MONDAYID_API_SPEND_ENABLED:'false'}}).standaloneChat.state,'API_SPEND_NOT_AUTHORIZED');
});

test('live status separates a healthy transport from unverified Work delivery',async()=>{
  const headers={}; const res={setHeader:(k,v)=>headers[k]=v,status(code){this.code=code;return this;},json(value){this.body=value;}};
  await statusHandler({method:'GET'},res);
  assert.equal(res.code,200);
  assert.equal(res.body.ok,true);
  assert.equal(res.body.work.controlPlane.generalTaskExecutor,false);
  assert.equal(res.body.work.hostWork.availability,'DISCOVER_IN_CURRENT_TURN');
  assert.equal(res.body.work.wholeProductComplete,false);
  assert.equal(headers['Cache-Control'],'no-store');
});
