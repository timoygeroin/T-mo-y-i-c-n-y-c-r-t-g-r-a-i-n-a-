import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileProjectLineage, projectToCapabilityDelta } from '../src/everything-compiler.mjs';

const registry=JSON.parse(await readFile(new URL('../ops/project-subsumption-registry-20261004.json',import.meta.url),'utf8'));

test('historical projects compile into capabilities, ancestry, failures, gates, or supersession — never active projects',()=>{
  const result=compileProjectLineage(registry.entries);
  assert.equal(result.schema,'mondayid.everything-compiler.result.v1');
  assert.equal(result.projectRuntimeAuthority,false);
  assert.equal(result.invalid.length,0);
  assert.ok(result.totalValid>=40);
  assert.ok(result.activeOrgans.some(x=>x.organ==='MONDAY_WORK'));
  assert.ok(result.activeRoles.some(x=>x.role==='JARVIS'));
  assert.ok(result.externalGates.some(x=>x.gate==='GEMINI_ACCOUNT_BINDING'));
  assert.equal('activeProjects' in result,false);
});

test('duplicate historical names with the same effect collapse into one current capability',()=>{
  const result=compileProjectLineage(registry.entries);
  const compose=result.activeOrgans.find(x=>x.organ==='capability_foundry');
  assert.ok(compose);
  assert.ok(compose.ancestry.includes('MondayID ONE'));
  assert.ok(compose.ancestry.includes('CapabilityFoundry'));
});

test('compiler retains provenance while removing project runtime authority',()=>{
  const result=compileProjectLineage(registry.entries);
  assert.equal(result.acceptance.noActiveProjectState,true);
  assert.equal(result.acceptance.provenanceRetained,true);
  assert.ok(result.compression>1);
});

test('compiled output can be promoted as a capability delta without reifying projects',()=>{
  const compiled=compileProjectLineage(registry.entries);
  const delta=projectToCapabilityDelta(compiled);
  assert.equal(delta.ok,true);
  assert.ok(delta.activeOrgans.includes('MONDAY_WORK'));
  assert.ok(delta.activeRoles.includes('ANTISYSTEM'));
  assert.ok(delta.donorEffects.length>0);
});


test('project-zero closure maps every formerly open project shell into a non-project disposition',async()=>{
  const closure=JSON.parse(await readFile(new URL('../ops/project-zero-closure-20261004.json',import.meta.url),'utf8'));
  const names=new Set(registry.entries.map(x=>x.name));
  assert.equal(closure.acceptance.activeProjectCountAfterClosure,0);
  assert.equal(closure.acceptance.projectNamesRetainRuntimeAuthority,false);
  for(const item of closure.closures){
    assert.ok(names.has(item.name),`missing subsumption record for ${item.name}`);
    assert.notEqual(item.disposition,'ACTIVE_PROJECT');
  }
});
