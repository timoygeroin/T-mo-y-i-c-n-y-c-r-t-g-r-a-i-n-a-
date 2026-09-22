import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityFoundry } from '../src/foundry.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

test('one pass continues internally after partial progress until remaining work is fulfilled', async () => {
  let hostRuns = 0;
  let forgeAttempts = 0;

  const foundry = new CapabilityFoundry({
    builder: async (contract) => {
      forgeAttempts += 1;
      if (contract.domain !== 'vision' || forgeAttempts === 1) {
        return { receptor:null, proof:{ok:false, reason:'not ready yet'} };
      }
      return {
        builder:'test-foundry',
        receptor:{
          name:'vision-live',
          execute:async()=>({ok:true}),
          verify:async result=>({ok:result.ok})
        },
        proof:{ok:true, mode:'readback'}
      };
    }
  });

  const runtime = new MondayRuntime({
    foundry,
    capabilities:{
      host:{
        name:'host-live',
        execute:async()=>{ hostRuns += 1; return {ok:true}; },
        verify:async result=>({ok:result.ok})
      }
    }
  });

  const out = await runtime.runPass([
    { id:'whole-turn', text:'finish host and vision', priority:90 }
  ]);

  assert.equal(out.ok, true);
  assert.equal(out.state, 'FULFILLED');
  assert.equal(out.cycles.length, 2);
  assert.equal(hostRuns, 1);
  assert.equal(runtime.capabilities.vision.name, 'vision-live');
  assert.equal(out.final.intents['whole-turn'].status, 'fulfilled');
});

test('one pass stops only at a stable blocker when no semantic progress remains', async () => {
  const runtime = new MondayRuntime({ capabilities:{} });
  const out = await runtime.runPass([
    { id:'blocked', text:'finish vision', priority:90 }
  ], { maxCycles:5 });

  assert.equal(out.ok, true);
  assert.equal(out.state, 'BLOCKED');
  assert.equal(out.reason, 'NO_SEMANTIC_PROGRESS');
  assert.equal(out.cycles.length, 1);
  assert.equal(out.final.intents.blocked.status, 'active');
});
