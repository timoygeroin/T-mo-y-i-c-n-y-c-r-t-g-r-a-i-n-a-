import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityFoundry, capabilityContract } from '../src/foundry.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

test('missing capability becomes a design contract, not a terminal blocker', () => {
  const action = {
    objectiveId: 'objective:vision',
    domain: 'vision',
    effect: 'render a verified visual result'
  };
  const contract = capabilityContract(action, {
    code: { name:'code', execute: async()=>({}), verify: async()=>({ok:true}), exposes:['write-files'] },
    web: { name:'web', execute: async()=>({}), verify: async()=>({ok:true}), exposes:['http'] }
  });
  assert.equal(contract.domain, 'vision');
  assert.equal(contract.acceptance.verificationRequired, true);
  assert.equal(contract.availablePrimitives.length, 2);
  assert.match(contract.instruction, /render a verified visual result/);
});

test('foundry refuses to promote an unproven organ', async () => {
  const foundry = new CapabilityFoundry({
    builder: async () => ({
      receptor: { name:'vision-generated', execute: async()=>({ok:true}) },
      proof: { ok:false, reason:'no readback' }
    })
  });
  const out = await foundry.forge({ objectiveId:'v', domain:'vision', effect:'render' }, {});
  assert.equal(out.ok, false);
  assert.equal(out.code, 'UNPROVEN_ORGAN');
});

test('runtime forges a missing organ, replans, executes, and verifies in one cycle', async () => {
  let builds = 0;
  const foundry = new CapabilityFoundry({
    builder: async (contract) => {
      builds += 1;
      return {
        builder:'test-foundry',
        receptor:{
          name:`forged-${contract.domain}`,
          execute: async action => ({ ok:true, domain:action.domain, effect:action.effect }),
          verify: async result => ({ ok:result.ok === true, mode:'readback' })
        },
        proof:{ok:true, mode:'self-test'}
      };
    }
  });

  const runtime = new MondayRuntime({ capabilities:{}, foundry });
  const out = await runtime.cycle([{ id:'u', text:'finish the vision generator', priority:90 }]);

  assert.equal(out.ok, true);
  assert.equal(builds, 1);
  assert.equal(out.forged.length, 1);
  assert.equal(out.forged[0].ok, true);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].ok, true);
  assert.equal(runtime.capabilities.vision.name, 'forged-vision');
});

test('one failed organ invention does not stop already executable organs', async () => {
  const foundry = new CapabilityFoundry({
    builder: async () => ({ receptor:null, proof:{ok:false} })
  });
  const runtime = new MondayRuntime({
    foundry,
    capabilities:{
      host:{
        name:'host',
        execute: async()=>({ok:true}),
        verify: async()=>({ok:true})
      }
    }
  });
  const out = await runtime.cycle([{ id:'u', text:'host and vision', priority:90 }]);
  assert.equal(out.ok, true);
  assert.equal(out.results.some(r => r.action.domain === 'host' && r.ok), true);
  assert.equal(out.forged.some(f => f.domain === 'vision' && f.ok === false), true);
});
