import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCapabilities } from '../src/capability-discovery.mjs';

const positiveProbe=async()=>({state:'AVAILABLE',evidence:['host says enabled']});

test('a positive probe cannot promote a visible-only receptor into an executable capability',async()=>{
  const out=await discoverCapabilities([{id:'visual',domain:'vision',receptor:{name:'visual'},probe:positiveProbe}]);
  assert.equal(out.manifest[0].state,'VISIBLE_ONLY');
  assert.equal(out.manifest[0].executable,false);
  assert.equal(out.manifest[0].verifiable,false);
  assert.deepEqual(Object.keys(out.capabilities),[]);
  assert.ok(out.manifest[0].evidence.includes('STRUCTURAL_RECEPTOR_CONTRACT_MISSING'));
});

test('a positive probe cannot promote an execution-only receptor without independent verification',async()=>{
  const out=await discoverCapabilities([{id:'act',domain:'general',receptor:{name:'act',execute:async()=>({ok:true})},probe:positiveProbe}]);
  assert.equal(out.manifest[0].state,'BLOCKED');
  assert.equal(out.manifest[0].executable,false);
  assert.equal(out.manifest[0].verifiable,false);
  assert.deepEqual(Object.keys(out.capabilities),[]);
});

test('a positive probe cannot promote a missing receptor',async()=>{
  const out=await discoverCapabilities([{id:'missing',domain:'general',probe:positiveProbe}]);
  assert.equal(out.manifest[0].state,'UNAVAILABLE');
  assert.deepEqual(Object.keys(out.capabilities),[]);
});

test('a complete receptor is available and blocked probes still veto it',async()=>{
  const receptor={name:'verified',execute:async()=>({ok:true}),verify:async()=>({ok:true})};
  const out=await discoverCapabilities([
    {id:'complete',domain:'continuity',receptor,probe:positiveProbe},
    {id:'forbidden',domain:'restricted',receptor,probe:async()=>({state:'BLOCKED'})}
  ]);
  assert.equal(out.manifest[0].state,'AVAILABLE');
  assert.equal(out.capabilities.continuity,receptor);
  assert.equal(out.manifest[1].state,'BLOCKED');
  assert.equal(out.capabilities.restricted,undefined);
});

test('probe failure remains unknown instead of being promoted',async()=>{
  const receptor={name:'verified',execute:async()=>({ok:true}),verify:async()=>({ok:true})};
  const out=await discoverCapabilities([{domain:'general',receptor,probe:async()=>{throw new Error('network timeout');}}]);
  assert.equal(out.manifest[0].state,'UNKNOWN');
  assert.equal(out.capabilities.general,undefined);
});
