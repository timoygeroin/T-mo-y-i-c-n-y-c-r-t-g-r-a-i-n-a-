import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url),'utf8'));
const constitution = fs.readFileSync(new URL('../product/MONDAY_PRODUCT_CONSTITUTION_V1.md', import.meta.url),'utf8');
const rejections = readJson('../product/KNOWN_REJECTIONS_V1.json');
const plan = readJson('../product/CONTINUUM_INTEGRATION_PLAN.json');
const lineage = readJson('../product/LINEAGE_ADJUDICATION_V1.json');

test('consumer product constitution remains distinct from the runtime host',()=>{
  assert.match(constitution,/Monday is a familiar, controllable premium consumer application/);
  assert.match(constitution,/Home \/ Chats \/ Create \/ Spaces \/ You/);
  assert.match(constitution,/Home is a Continuum, not a dashboard/);
  assert.match(constitution,/Generated != Executed != Read back != Verified/);
  assert.match(constitution,/Host\/model\/chat is a replaceable cell/);
});

test('known historical product rejections are hard release gates',()=>{
  assert.equal(rejections.schema,'monday.known-rejections.v1');
  assert.equal(rejections.release_blocking,true);
  const ids=new Set(rejections.rules.map(rule=>rule.id));
  for(const id of [
    'site-showcase',
    'dashboard-home',
    'chatgpt-clone',
    'fake-work',
    'fake-verification',
    'beautiful-substitute',
    'forgotten-reinvention'
  ]) assert.ok(ids.has(id),`missing rejection ${id}`);
});

test('product integration plan requires shell, continuity, execution, provider fabric and field acceptance',()=>{
  const gates=new Set(plan.release_gates.map(g=>g.id));
  for(const id of ['consumer_shell','continuity','execution','provider_fabric','field_acceptance']){
    assert.ok(gates.has(id),`missing gate ${id}`);
  }
  assert.ok(plan.invariants.includes('KNOWN_REJECTION_BLOCKS_RELEASE'));
});

test('high-authority product lineage contradictions are resolved before implementation may claim release',()=>{
  assert.equal(lineage.schema,'monday.lineage-adjudication.v1');
  const high=lineage.contradictions.filter(item=>item.authority==='high');
  assert.ok(high.length>0);
  assert.equal(high.filter(item=>item.status!=='RESOLVED').length,0);
  assert.ok(high.every(item=>item.decision && item.basis));
});
