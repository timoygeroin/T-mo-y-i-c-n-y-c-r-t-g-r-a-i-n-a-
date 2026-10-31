import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCarrierAttachSnapshot} from '../src/chatgpt-carrier-synapse.mjs';
import mcpHandler from '../api/mcp.mjs';

const system=JSON.parse(fs.readFileSync(new URL('../SYSTEM.json',import.meta.url),'utf8'));
test('one canonical meta-observer is executable without claims of sentience or global interception',()=>{
  assert.equal(system.meta_observer.schema,'mondayid.meta-observation.v1');
  assert.equal(system.meta_observer.owner,'ONE_MONDAYID');
  assert.equal(system.meta_observer.consciousnessClaim,false);
  assert.equal(system.meta_observer.crossHostTool,'meta_probe');
  assert.equal(system.meta_observer.proofBoundaries.globalHostDeploymentVerified,false);
  assert.ok(system.runtime_cycle.indexOf('meta_observe')>system.runtime_cycle.indexOf('verify'));
  assert.ok(system.meta_invariants.includes('verified_counterexample_overrules_positive_self_report'));
});
test('same metacognitive contract reaches cell attachment and MCP capability manifest',async()=>{
  const identity={product:'MondayID',generation:system.generation,kernel:'test',runtime:'test',cutover:'test'};
  const attached=buildCarrierAttachSnapshot({system,identity});
  assert.equal(attached.contracts.metaObserver.schema,system.meta_observer.schema);
  assert.equal(attached.contracts.metaObserver.autoInterceptsNativeChat,false);
  const res={setHeader(){},statusCode:null,status(x){this.statusCode=x;return this;},json(x){this.body=x;return this;},end(){return this;}};
  await mcpHandler({method:'POST',body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'capability_manifest',arguments:{}}}},res);
  assert.equal(res.body.result.structuredContent.metaObserver.schema,system.meta_observer.schema);
});
