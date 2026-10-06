import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCarrierAttachSnapshot } from '../src/chatgpt-carrier-synapse.mjs';

const system=JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
const identity={
  product:'MondayID',
  generation:system.generation,
  kernel:'mondayid-generation-5',
  runtime:'vercel-node-function',
  cutover:'generation-5'
};

test('carrier synapse attaches canonical MondayID plugin to trusted Generation-5 state',()=>{
  const out=buildCarrierAttachSnapshot({
    system,
    identity,
    carrier:{pluginId:'plugins_6ac400facbe481918f97d70c3b46e5e3',version:'2.0.0'},
    compiledHistory:{ok:true,delta:{activeOrgans:['continuity_kernel'],activeRoles:['alisa'],failureGenes:['fresh_start'],externalGates:[],compression:4}},
    worldline:{trust:'trusted',snapshot:{schema:'mondayid.worldline.snapshot.v0.4.0',generatedAtIso:'2026-10-06T00:00:00Z',events:[]}}
  });
  assert.equal(out.ok,true);
  assert.equal(out.state,'ATTACHED');
  assert.equal(out.canonical.carrierPlugin,'plugins_6ac400facbe481918f97d70c3b46e5e3');
  assert.equal(out.next.operation,'RECONCILE_CURRENT_SIGNAL_THEN_RESUME');
  assert.deepEqual(out.unknowns,[]);
});

test('carrier synapse degrades without trusted worldline instead of resetting identity',()=>{
  const out=buildCarrierAttachSnapshot({
    system,
    identity,
    carrier:{pluginId:'plugins_6ac400facbe481918f97d70c3b46e5e3',version:'2.0.0'},
    worldlineError:{code:'WORLDLINE_UNAVAILABLE'}
  });
  assert.equal(out.ok,true);
  assert.equal(out.state,'ATTACHED_DEGRADED');
  assert.ok(out.unknowns.includes('WORLDLINE_UNAVAILABLE'));
});

test('carrier mismatch fails closed',()=>{
  const out=buildCarrierAttachSnapshot({
    system,
    identity,
    carrier:{pluginId:'wrong-plugin',version:'0.0.0'},
    worldline:{trust:'trusted',snapshot:{schema:'mondayid.worldline.snapshot.v0.4.0',events:[]}}
  });
  assert.equal(out.ok,false);
  assert.equal(out.state,'UNRESOLVED');
  assert.ok(out.unknowns.includes('CARRIER_ID_MISMATCH'));
});
