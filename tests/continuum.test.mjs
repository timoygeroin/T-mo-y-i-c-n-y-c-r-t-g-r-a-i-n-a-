import test from 'node:test';
import assert from 'node:assert/strict';
import { Continuum } from '../src/continuum.mjs';

test('failed executor hands task to next executor and survives replay', async () => {
  const log = new Map();
  const store = {
    async append(id, event) { log.set(id, [...(log.get(id) || []), event]); },
    async events(id) { return log.get(id) || []; }
  };
  const calls = [];
  const executors = [
    { name:'first', canRun:(_, attempt) => attempt === 0, async run() { calls.push('first'); throw new Error('temporary'); } },
    { name:'second', canRun:() => true, async run(payload) { calls.push('second'); return { value:payload.value*2 }; } }
  ];
  const build = () => new Continuum({store, executors, verify:async (_, result) => result.value === 42});
  await build().submit('t1', {value:21});
  assert.equal((await build().step('t1')).status, 'PENDING');
  assert.equal((await build().step('t1')).status, 'DONE');
  assert.deepEqual(calls, ['first','second']);
  assert.equal((await build().step('t1')).status, 'DONE');
  assert.equal((await build().state('t1')).result.value, 42);
});

test('bounded retries block unverified work', async () => {
  const log=[];
  const store={append:async (_,e)=>{log.push(e);}, events:async()=>log};
  const c=new Continuum({store, executors:[{name:'x',canRun:()=>true,run:async()=>({})}],verify:async()=>false,maxAttempts:1});
  await c.submit('x',{});
  assert.equal((await c.step('x')).status,'PENDING');
  assert.equal((await c.step('x')).status,'BLOCKED');
});
