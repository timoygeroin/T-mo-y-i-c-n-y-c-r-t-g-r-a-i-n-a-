import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIntent } from '../src/intent-field.mjs';
import { compileSignals } from '../src/compiler.mjs';
import { buildFrontier } from '../src/planner.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

const DOMAINS=['continuity','host','code','vision','research','integration'];
const root={id:'owner-whole-system',text:'Перенастрой всю систему MondayID, улучши задачу вместо меня.'};
const general={name:'generic-echo',execute:async()=>({ok:true}),verify:async()=>({ok:true})};

test('Russian whole-system instruction expands into independent material domains without replacing owner words',()=>{
  const x=normalizeIntent(root);
  assert.equal(x.text,root.text);
  assert.deepEqual(x.domains,DOMAINS);
  assert.equal(x.requireDomainReceptor,true);
  assert.equal(x.amplification?.scope,'WHOLE_ORGANISM');
  assert.equal(x.amplification?.proofPolicy,'INDEPENDENT_DOMAIN_AND_INTEGRATION_READBACK');
  assert.deepEqual(x.obligations.map(o=>o.domain),DOMAINS);
  assert.ok(x.obligations.every(o=>o.material===true && o.status==='OPEN'));
});

test('planner cannot substitute a generic reply receptor for any whole-system effect',()=>{
  const graph=compileSignals([root]);
  const frontier=buildFrontier(graph,{general});
  assert.equal(frontier.ready.length,0);
  assert.equal(frontier.blocked.length,DOMAINS.length);
  assert.deepEqual(frontier.blocked.map(x=>x.domain),DOMAINS);
  assert.ok(frontier.blocked.every(x=>x.blocker.startsWith('NO_RECEPTOR:')));
});

test('runtime does not declare whole organism rebuilt after a generic echo',async()=>{
  let genericCalls=0;
  const runtime=new MondayRuntime({capabilities:{general:{
    name:'generic-echo',execute:async()=>{genericCalls++;return {ok:true};},verify:async()=>({ok:true})
  }}});
  const outcome=await runtime.runPass([root],{maxCycles:3});
  assert.equal(outcome.state,'BLOCKED');
  assert.equal(genericCalls,0);
  const intent=outcome.final.intents[root.id];
  assert.equal(intent.status,'active');
  assert.deepEqual(intent.domains,DOMAINS);
  assert.ok(intent.obligations.every(o=>o.status==='OPEN'));
});

test('system repair with one real domain receptor cannot close other domains',()=>{
  const graph=compileSignals([root]);
  const frontier=buildFrontier(graph,{general,host:{name:'host-specific',execute:async()=>({ok:true}),verify:async()=>({ok:true})}});
  assert.deepEqual(frontier.ready.map(x=>x.domain),['host']);
  assert.equal(frontier.blocked.length,DOMAINS.length-1);
  assert.ok(frontier.blocked.some(x=>x.domain==='integration'));
});

test('ordinary narrow and conversational signals stay narrow and do not trigger global work',()=>{
  const narrow=normalizeIntent({text:'Покажи фото',domains:['vision']});
  assert.deepEqual(narrow.domains,['vision']);
  assert.notEqual(narrow.requireDomainReceptor,true);
  assert.equal(narrow.amplification?.scope,undefined);
  const chat=normalizeIntent({text:'Как дела?'});
  assert.deepEqual(chat.domains,['general']);
  const sync=normalizeIntent({text:'Синхронизируй все чаты'});
  assert.ok(sync.domains.includes('continuity'));
  assert.notEqual(sync.amplification?.scope,'WHOLE_ORGANISM');
});

test('explicit whole-system tasks are recognized regardless of Russian or English inflection',()=>{
  for(const phrase of ['Пересобери всю систему','собери всю систему','rebuild the entire system']){
    const out=normalizeIntent({text:phrase});
    assert.equal(out.amplification?.scope,'WHOLE_ORGANISM',phrase);
  }
});


test('user grants bounded full MondayID development authority: whole-organism scope without pretending execution',()=>{
  for(const phrase of [
    'GPT, я тебе даю на три часа полный доступ ко всей Monday и всему, что её касается. Все коннекторы и репозитории. Сделай её сильнее.',
    'Даю полное разрешение на работу со всей MondayID, перепиши её инструкции и проверь результат.',
    'Усиль всю MondayID, улучшай все подсистемы и проверяй работу.',
    'I grant full development access to the entire MondayID, make it stronger.'
  ]){
    const out=normalizeIntent({text:phrase});
    assert.equal(out.amplification?.scope,'WHOLE_ORGANISM',phrase);
    assert.deepEqual(out.domains,DOMAINS);
    assert.ok(out.obligations.every(o=>o.status==='OPEN'));
  }
});

test('negation, quotation, questions and limited scope cannot grant full development authority',()=>{
  for(const phrase of [
    'Я НЕ даю полный доступ ко всей MondayID, только покажи историю.',
    'Не усиливай всю MondayID, исправь одну картинку.',
    'У тебя есть полный доступ ко всей MondayID?',
    'Ты сказал: «даю полный доступ ко всей MondayID». Это цитата.',
    'Даю доступ к одному репозиторию MondayID для просмотра.'
  ]){
    const out=normalizeIntent({text:phrase});
    assert.notEqual(out.amplification?.scope,'WHOLE_ORGANISM',phrase);
  }
});

test('actual owner one-pass finish signal is not silently reduced to a chat answer',()=>{
 const text='Слушай, если б я дал тебе управление всей системой, можешь ли ты доделать Monday ID за один проход, за один раз, за одно сообщение? Не рассказывай почему и как. Начни сразу это делать и потом презентуй систему.';
 const out=normalizeIntent({id:'whole-finish',text});
 assert.equal(out.text,text);
 assert.equal(out.amplification?.scope,'WHOLE_ORGANISM');
 assert.deepEqual(out.domains,DOMAINS);
 assert.equal(out.obligations.length,DOMAINS.length);
});

test('mere hypothetical, quote or refusal cannot trigger one-pass global work',()=>{
 for(const text of [
  'Можешь ли ты доделать Monday ID за один проход?',
  'Не надо доделать Monday ID, покажи только документ.',
  'Он сказал: «доделай Monday ID». Это цитата.'
 ]){
  assert.notEqual(normalizeIntent({text}).amplification?.scope,'WHOLE_ORGANISM',text);
 }
});
