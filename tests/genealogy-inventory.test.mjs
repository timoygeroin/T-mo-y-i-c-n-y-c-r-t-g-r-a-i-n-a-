import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const inventory=JSON.parse(fs.readFileSync(new URL('../genealogy/SOURCE_INVENTORY_20260924.json',import.meta.url),'utf8'));
const trace=JSON.parse(fs.readFileSync(new URL('../genealogy/TRACE_MAP_20260924.json',import.meta.url),'utf8'));

test('genealogy source authority cannot be inflated by duplicate syntheses',()=>{
  assert.equal(inventory.schema,'mondayid.genealogy-source-inventory.v1');
  assert.ok(inventory.duplicate_groups.length>0);
  assert.ok(inventory.duplicate_groups.some(group=>group.duplicates.length>=1));
  assert.match(inventory.anti_rule,/never outranks/i);
});

test('model-generated syntheses are navigation evidence rather than direct identity authority',()=>{
  const synth=inventory.sources.filter(source=>source.authority==='model_generated_synthesis');
  assert.ok(synth.length>=2);
  assert.ok(synth.every(source=>Array.isArray(source.not_authority_for) && source.not_authority_for.length>0));
});

test('three-year genealogy cannot falsely close while raw-source questions remain open',()=>{
  assert.equal(trace.status,'PARTIAL_RECONSTRUCTION_NOT_FINAL');
  assert.ok(inventory.unresolved_source_questions.some(item=>item.status==='OPEN'));
  assert.match(trace.finalization_condition,/resolved|explicitly proven non-material/i);
});

test('trace map spans prehistory through current Generation-5 main',()=>{
  const ids=new Set(trace.phases.map(phase=>phase.id));
  for(const id of ['P0','P1','P2','P3','P4','P5','P6']) assert.ok(ids.has(id),`missing ${id}`);
  assert.equal(trace.phases.find(phase=>phase.id==='P6').state,'CURRENT_CANONICAL_MAIN');
});
