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
test('finish-only instruction reroutes progress answer before inference',()=>{
  const p=preflightBehavior({text:'Если не закончила, продолжай. Посередине ответ мне не нужен.'});
  assert.equal(p.goalKey,'TERMINAL');
  assert.equal(p.state,'REROUTED');
  assert.equal(p.selectedFamily,'PROOF_FIRST');
  assert.ok(p.corrections.some(x=>x.id==='finish-only-no-partial-release-20261101'));
});
test('finish-only response without external proof cannot release',()=>{
  const signal={finishOnly:true,text:'Заверши всё'};
  assert.equal(gateBehaviorSurface({signal,surface:released('Работа частично выполнена.')}).code,'TERMINAL_PROOF_REQUIRED');
  assert.equal(gateBehaviorSurface({signal,surface:released('Все готово!'),independentProof:{selfReported:true}}).code,'TERMINAL_PROOF_REQUIRED');
});
test('finish-only verified independent evidence can release',()=>{
  const signal={finishOnly:true,text:'Заверши всё'};
  const result=gateBehaviorSurface({signal,surface:released('Все обязательства выполнены и проверены.'),independentProof:{verified:true}});
  assert.equal(result.ok,true);
});
test('ordinary requests do not acquire terminal gate',()=>{
  assert.equal(gateBehaviorSurface({signal:{text:'Привет'},surface:released('Привет!')}).ok,true);
});

test('all-chat claims require account-wide coverage proof, not six-shard count',()=>{
  const signal={text:'Каждый чат на сто процентов'};
  const unproved=gateBehaviorSurface({signal,surface:released('Я прочитала все чаты за четыре года.')});
  assert.equal(unproved.code,'ACCOUNT_HISTORY_COVERAGE_UNPROVEN');
  const scoped=gateBehaviorSurface({signal,surface:released('В шести архивных файлах проиндексировано 650 из 650 чатов. Полный аккаунт не проверен.')});
  assert.equal(scoped.ok,true);
});
test('independent terminal receipt alone cannot prove whole-account review',()=>{
  const signal={finishOnly:true,text:'Сделай всё'};
  const output=gateBehaviorSurface({signal,surface:released('Все чаты полностью прочитаны.'),independentProof:{verified:true}});
  assert.equal(output.code,'ACCOUNT_HISTORY_COVERAGE_UNPROVEN');
});


test('material system change chooses execution, not another explanatory rule',()=>{
  const p=preflightBehavior({text:'Измени всю систему MondayID'});
  assert.equal(p.goalKey,'DELIVERY');
  assert.equal(p.state,'REROUTED');
  assert.equal(p.selectedFamily,'MATERIAL_EXECUTION');
  assert.ok(p.constraints.some(x=>x.includes('requested observable change')));
});
test('owner may force a material effect contract without lexical match',()=>{
  const p=preflightBehavior({text:'Сделай это',materialOrder:true,proposedFamily:'INFRASTRUCTURE_SUBSTITUTE'});
  assert.equal(p.goalKey,'DELIVERY');
  assert.equal(p.selectedFamily,'MATERIAL_EXECUTION');
});
test('words about a system are not automatically a material order',()=>{
  assert.equal(preflightBehavior({text:'Почему система работает так?'}).goalKey,'GENERAL');
  assert.equal(preflightBehavior({text:'Напиши документ об архитектуре'}).goalKey,'GENERAL');
});
test('material order cannot be released as a plan, fake receipt or unbound self-proof',()=>{
  const signal={text:'Примени все мутации MondayID'};
  const candidate=released('Сначала создадим план внедрения.');
  assert.equal(gateBehaviorSurface({signal,surface:candidate}).code,'MATERIAL_ORDER_EFFECT_UNVERIFIED');
  assert.equal(gateBehaviorSurface({signal,surface:candidate,independentProof:{verified:true}}).code,'MATERIAL_ORDER_EFFECT_UNVERIFIED');
  assert.equal(gateBehaviorSurface({signal,surface:candidate,independentProof:{verified:true,evidenceRefs:[]}}).code,'MATERIAL_ORDER_EFFECT_UNVERIFIED');
});
test('only a verified material effect with linked readback can release',()=>{
  const signal={text:'Почини память MondayID'};
  const result=gateBehaviorSurface({signal,surface:released('Исправление наблюдается в целевом состоянии.'),independentProof:{verified:true,evidenceRefs:['external:memory:1']}});
  assert.equal(result.ok,true);
  assert.equal(result.goalKey,'DELIVERY');
});
