import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLocalIntent,applyLocalIntent,LOCAL_INTENT_SCHEMA} from '../src/local-intent-compiler.mjs';
const ID='test-safe-001',AT=1792586000000;
const invoke=(text,state={})=>applyLocalIntent(state,compileLocalIntent(text),{id:ID,at:AT});

test('explicit correction is effective without a model or sign-in',()=>{
  const act=compileLocalIntent('запомни: Не выдавать черновик за завершённую Monday');
  assert.equal(act.kind,'remember');
  const out=applyLocalIntent({},act,{id:ID,at:AT});
  assert.equal(out.code,'LOCAL_CORRECTION_SAVED');
  assert.equal(out.state.corrections[0].status,'active');
  assert.equal(out.receipt.verified,false);
  assert.equal(out.externalEffect,false);
  assert.equal(out.state.corrections[0].rule,'Не выдавать черновик за завершённую Monday');
});

test('owner intent styles /remember and Russian polite variants',()=>{
  for(const text of ['/remember MondayID is one worldline','запомни, пожалуйста: Не терять историю','сохрани правило: Не повторять ошибки']){
    assert.equal(compileLocalIntent(text).kind,'remember');
  }
});

test('explicit task is pending rather than marked accomplished',()=>{
  const out=invoke('добавь задачу: Проверить приложение на iPhone');
  assert.equal(out.code,'LOCAL_TASK_CREATED');
  assert.equal(out.state.tasks[0].done,false);
  assert.equal(out.state.tasks[0].status,'open');
  assert.equal(out.state.receipts[0].verified,false);
});

test('focus persists with no artificial verification',()=>{
  const before={focus:'Старый замысел',threads:[{id:'thread1'}]};
  const out=invoke('главная цель: MondayID 100/100',before);
  assert.equal(out.state.focus,'MondayID 100/100');
  assert.equal(out.state.threads.length,1);
  assert.equal(before.focus,'Старый замысел','pure function');
});

test('ordinary conversations are not stolen as local commands',()=>{
  for(const text of ['Привет Monday','Почему ты не закончила приложение?','создай сайт','продолжай','Проверь продакшн','мне нужна Monday']){
    const x=compileLocalIntent(text);
    assert.equal(x.kind,'none',text);
  }
});

test('uncertain correction stays pending until explicitly accepted',()=>{
  const pending=invoke('Я же просил не повторять одну и ту же ошибку');
  assert.equal(pending.state.corrections[0].status,'pending');
  const accepted=invoke('запомни: Я же просил не повторять одну и ту же ошибку',pending.state);
  assert.equal(accepted.state.corrections.length,1);
  assert.equal(accepted.state.corrections[0].status,'active');
  assert.equal(accepted.code,'LOCAL_CORRECTION_APPROVED');
});

test('duplicate active rules, focus and tasks are idempotent',()=>{
  const first=invoke('/remember Never fake proof');
  const second=invoke('запомни: never   fake    proof',first.state);
  assert.equal(second.code,'LOCAL_DUPLICATE');
  assert.equal(second.state,first.state);
  const task=invoke('/task Test local restore');
  const again=invoke('задача: test local restore',task.state);
  assert.equal(again.code,'LOCAL_DUPLICATE');
  const focus=invoke('/focus One organism');
  assert.equal(invoke('основная цель: one organism',focus.state).code,'LOCAL_DUPLICATE');
});

test('secrets are never stored or echoed as corrections',()=>{
  for(const secret of ['запомни: пароль: special1234','/remember api_key: abcdefgh1234','/task Bearer abcdefghijklmnopqrstuvwxyz']){
    const intent=compileLocalIntent(secret);
    assert.equal(intent.kind,'denied',secret);
    assert.equal(intent.code,'POSSIBLE_SECRET_IN_MEMORY');
    assert.equal(applyLocalIntent({},intent,{id:ID,at:AT}).ok,false);
  }
});

test('length, invalid identifiers, non-string values and inputs fail closed',()=>{
  assert.equal(compileLocalIntent(null).kind,'none');
  assert.equal(compileLocalIntent('x'.repeat(3500)).code,'INPUT_TOO_LONG');
  assert.equal(compileLocalIntent('запомни: '+'X'.repeat(1250)).code,'LOCAL_VALUE_LENGTH');
  const intent=compileLocalIntent('задача: Проверить ридбек');
  assert.equal(applyLocalIntent({},intent,{id:'../../unauthorized',at:AT}).code,'BAD_RECEIPT_ID_OR_TIME');
  assert.equal(applyLocalIntent({},intent,{id:ID,at:-1}).ok,false);
  assert.equal(applyLocalIntent({}, {...intent,value:null},{id:ID,at:AT}).code,'INVALID_LOCAL_EFFECT');
});

test('user-owned receipts cannot be forged into system proof',()=>{
  const state={receipts:[{kind:'system',verified:true,evidence:'user'}]};
  const out=invoke('/focus Durable goal',state);
  assert.equal(out.receipt.kind,'owner');
  assert.equal(out.receipt.verified,false);
  assert.equal(out.receipt.evidence,'LOCAL_OWNER_INPUT_NOT_EXTERNALLY_VERIFIED');
  assert.equal(out.externalEffect,false);
});

test('limits prevent silent eviction of active rules/tasks',()=>{
  const corrections=Array.from({length:80},(_,i)=>({rule:'keep-'+i,status:'active'}));
  const tasks=Array.from({length:100},(_,i)=>({title:'task-'+i,done:false}));
  const a=invoke('запомни: one more rule',{corrections});
  const b=invoke('добавь задачу: one more task',{tasks});
  assert.equal(a.code,'LOCAL_LIMIT_REACHED');
  assert.equal(b.code,'LOCAL_LIMIT_REACHED');
  assert.equal(a.state.corrections,corrections);
  assert.equal(b.state.tasks,tasks);
});

test('malformed unknown intent cannot change state',()=>{
  const input={schema:LOCAL_INTENT_SCHEMA,kind:'DELETE_ALL',value:'all'};
  const old={focus:'Do not destroy'};
  const out=applyLocalIntent(old,input,{id:ID,at:AT});
  assert.equal(out.ok,false);
  assert.equal(out.state,old);
});

test('offline state can be serialized and reloaded without loss',()=>{
  const remembered=invoke('запомни: Продолжение, не создание');
  const task=invoke('добавь задачу: Полный релиз',remembered.state);
  const focus=invoke('главная цель: MondayID завершена',task.state);
  const recovered=JSON.parse(JSON.stringify(focus.state));
  assert.equal(recovered.corrections[0].status,'active');
  assert.equal(recovered.tasks[0].status,'open');
  assert.equal(recovered.focus,'MondayID завершена');
  assert.ok(recovered.receipts.every(r=>r.verified===false));
});
