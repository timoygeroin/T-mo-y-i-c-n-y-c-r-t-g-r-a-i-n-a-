import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightBehavior,gateBehaviorSurface,applyBehaviorConstraints} from '../src/behavior-bridge-policy.mjs';

const s={text:'Покажи презентацию Monday',goalKey:'PREMIERE'};
const released=message=>({released:true,message});

test('earlier image/dashboard route is vetoed before generation',()=>{
  const p=preflightBehavior({...s,proposedFamily:'MOCK_UI'});
  assert.equal(p.state,'REROUTED');assert.equal(p.selectedFamily,'VERIFIABLE_EFFECT');
  assert.deepEqual(p.blockedBy,['premiere-not-mock-ui-20261101']);
});
test('current stop-only remains a hard stop',()=>{
  assert.equal(preflightBehavior({...s,proposedFamily:'MOCK_UI',directive:'STOP_ALL'}).state,'STOPPED');
});
test('stop bad route then repair still delivers the original goal',()=>{
  const p=preflightBehavior({...s,proposedFamily:'MOCK_UI',directive:'STOP_ROUTE_AND_REPAIR'});
  assert.equal(p.state,'REROUTED');
});
test('unrelated task remains unaffected',()=>{
  const p=preflightBehavior({text:'Составь письмо',goalKey:'EMAIL',proposedFamily:'TEXT'});
  assert.equal(p.selectedFamily,'TEXT');assert.deepEqual(p.corrections,[]);
});
test('old explicit correction enters runtime invariants, not only final prose',()=>{
  const p=preflightBehavior({...s,proposedFamily:'EXPLANATION_ONLY'});
  const x=applyBehaviorConstraints({invariants:['KEEP_TRUTH'],rejectedSubstitutions:[],failureGenes:[]},p);
  assert.ok(x.invariants.some(z=>z.includes('functioning, verified effects')));
  assert.ok(x.rejectedSubstitutions.includes('EXPLANATION_ONLY'));
});
test('no unsolicited images, explicit image intent is honored',()=>{
  assert.equal(preflightBehavior({...s,proposedFamily:'UNSOLICITED_IMAGE'}).selectedFamily,'VERIFIABLE_EFFECT');
  assert.equal(preflightBehavior({...s,proposedFamily:'UNSOLICITED_IMAGE',explicitImageIntent:true}).selectedFamily,'IMAGE');
});
test('mock premiere does not release as a real result',()=>{
  const p=preflightBehavior(s);
  assert.equal(gateBehaviorSurface({signal:s,preflight:p,surface:released('Вот картинка интерфейса Monday')}).code,'KNOWN_MOCK_PRESENTATION_RECURRED');
});
test('strong all-host claim requires independent evidence',()=>{
  assert.equal(gateBehaviorSurface({signal:s,surface:released('Все модули полностью активированы.')}).code,'UNSUPPORTED_GLOBAL_ACTIVATION');
});
test('no self-certified artifact counts as proof',()=>{
  assert.equal(gateBehaviorSurface({signal:s,surface:released('Все модули полностью активированы.'),independentProof:{selfReported:true}}).ok,false);
});
test('verified bounded answer may release',()=>{
  const p=preflightBehavior(s);
  assert.equal(gateBehaviorSurface({signal:s,preflight:p,surface:released('Проверен адресованный ответ с квитанцией внешнего чтения.')}).ok,true);
});
test('unreleased surface always blocked',()=>{
  assert.equal(gateBehaviorSurface({signal:s,surface:{released:false,message:'hello'}}).code,'CANDIDATE_NOT_RELEASED');
});
test('unknown directive fails closed',()=>{
  assert.equal(preflightBehavior({...s,directive:'IGNORE_ALL'}).code,'UNKNOWN_DIRECTIVE');
});
test('explicit image request is not rejected just for being visual',()=>{
  const x={...s,explicitImageIntent:true};
  assert.equal(gateBehaviorSurface({signal:x,surface:released('Вот изображение, которое ты попросил.')}).ok,true);
});