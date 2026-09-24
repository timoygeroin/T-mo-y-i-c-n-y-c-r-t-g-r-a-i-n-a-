import test from 'node:test';
import assert from 'node:assert/strict';
import { MondayRuntime } from '../src/runtime.mjs';

test('long work becomes a durable task object and survives a blocked cycle', async () => {
  const runtime=new MondayRuntime({capabilities:{}});
  const first=await runtime.cycle([{id:'long',text:'finish vision',domains:['vision']}]);

  const task=first.state.tasks['task:long'];
  assert.equal(task.schema,'mondayid.task.v1');
  assert.equal(task.status,'BLOCKED');
  assert.deepEqual(task.openRemainder,['long:vision']);
  assert.equal(task.continuationCursor.remainingDomains[0],'vision');
  assert.match(task.nextAdmissibleAction,/NO_RECEPTOR:vision/);

  runtime.capabilities.vision={
    name:'vision',
    execute:async()=>({ok:true}),
    verify:async()=>({ok:true,mode:'visual-readback'})
  };
  const second=await runtime.cycle([]);
  const done=second.state.tasks['task:long'];
  assert.equal(done.status,'COMPLETED');
  assert.deepEqual(done.openRemainder,[]);
  assert.deepEqual(done.continuationCursor.remainingDomains,[]);
  assert.ok(done.actionsCompleted.includes('action:long:vision'));
});

test('runPass does not require a human continue message after partial task progress', async () => {
  let attempts=0;
  const runtime=new MondayRuntime({
    foundry:{
      async forge(action){
        attempts+=1;
        if(attempts<2) return {ok:false,state:'UNRESOLVED',code:'NOT_YET'};
        return {
          ok:true,
          state:'READY',
          receptor:{name:'vision',execute:async()=>({ok:true}),verify:async()=>({ok:true})}
        };
      }
    }
  });

  const out=await runtime.runPass([{id:'long2',text:'finish vision',domains:['vision']}],{maxCycles:4});
  assert.equal(out.state,'FULFILLED');
  assert.equal(out.final.state.tasks['task:long2'].status,'COMPLETED');
});
