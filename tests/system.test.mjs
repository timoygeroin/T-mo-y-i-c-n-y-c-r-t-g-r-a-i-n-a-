import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Worldline } from '../src/worldline.mjs';
import { compileSignals } from '../src/compiler.mjs';
import { buildFrontier } from '../src/planner.mjs';
import { MondayRuntime } from '../src/runtime.mjs';
import { renderHumanSurface } from '../src/interface.mjs';
import { legacyEvidenceToEvents } from '../src/legacy-import.mjs';

test('all domains compile into one graph, not separate universes', () => {
  const g = compileSignals([
    { id:'u1', text:'finish iPhone host and MondayVision generator', priority:90 },
    { id:'u2', text:'recalculate quantum research and old chat continuity', priority:80 }
  ]);
  const domains = new Set(g.nodes.filter(n=>n.type==='objective').map(n=>n.domain));
  assert.ok(domains.has('host'));
  assert.ok(domains.has('vision'));
  assert.ok(domains.has('research'));
  assert.ok(domains.has('continuity'));
  assert.equal(g.schema, 'mondayid.intent-graph.v3');
});

test('planner exposes a parallel frontier across independent organs', () => {
  const g = compileSignals([{ id:'u', text:'host vision research continuity', priority:50 }]);
  const caps = Object.fromEntries(['host','vision','research','continuity'].map(name => [name,{name,execute:async()=>({}),verify:async()=>({ok:true})}]));
  const f = buildFrontier(g, caps);
  assert.equal(f.parallel.length, 4);
});

test('missing receptor blocks one objective without halting others', () => {
  const g = compileSignals([{ id:'u', text:'host vision', priority:50 }]);
  const f = buildFrontier(g, { host:{name:'host',execute:async()=>({ok:true}),verify:async()=>({ok:true})} });
  assert.equal(f.ready.length, 1);
  assert.equal(f.blocked.length, 1);
  assert.equal(f.blocked[0].domain, 'vision');
});

test('worldline rejects stale writers', () => {
  const w = new Worldline();
  const base = w.revision();
  const a = w.append({id:'a',kind:'fact',subject:'x',payload:1}, base);
  assert.equal(a.ok, true);
  const b = w.append({id:'b',kind:'fact',subject:'y',payload:2}, base);
  assert.equal(b.ok, false);
  assert.equal(b.code, 'STALE_REVISION');
});

test('worldline is idempotent by event id', () => {
  const w = new Worldline();
  const a = w.append({id:'same',kind:'fact',subject:'x',payload:1});
  const b = w.append({id:'same',kind:'fact',subject:'x',payload:1}, a.revision);
  assert.equal(b.ok, true);
  assert.equal(b.duplicate, true);
  assert.equal(w.events().length, 1);
});

test('runtime executes independent actions concurrently and verifies them', async () => {
  const runtime = new MondayRuntime({ capabilities:{
    host:{name:'host',execute:async a=>({domain:a.domain,ok:true}),verify:async r=>({ok:r.ok})},
    vision:{name:'vision',execute:async a=>({domain:a.domain,ok:true}),verify:async r=>({ok:r.ok})}
  }});
  const out = await runtime.cycle([{id:'u',text:'finish host and vision',priority:90}]);
  assert.equal(out.ok, true);
  assert.equal(out.results.length, 2);
  assert.equal(out.results.every(r=>r.ok), true);
});

test('human phenotype is downstream from cognition', async () => {
  const runtime = new MondayRuntime({ capabilities:{ general:{name:'g',execute:async()=>({ok:true}),verify:async r=>({ok:r.ok})} }});
  const out = await runtime.cycle([{id:'x',text:'arbitrary objective'}]);
  const before = JSON.stringify(out.state);
  const surface = renderHumanSurface(out,{voice:'girl-Monday'});
  assert.equal(surface.voice,'girl-Monday');
  assert.equal(JSON.stringify(out.state), before);
});

test('legacy is one-way evidence import, not a runtime dependency', () => {
  const events = legacyEvidenceToEvents([{id:'old',subject:'rule',payload:{x:1},verified:true}]);
  assert.equal(events[0].payload.imported,true);
  const runtimeSource = fs.readFileSync(new URL('../src/runtime.mjs', import.meta.url),'utf8');
  assert.equal(runtimeSource.includes('legacy-import'), false);
});

test('system manifest declares rewrite, stable meta-invariants, and evolvable policies', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  assert.equal(system.rewrite,true);
  assert.equal(system.runtime_dependency_on_legacy,false);
  assert.ok(system.meta_invariants.includes('truth_requires_evidence'));
  assert.ok(system.current_policies.includes('human_is_interface_not_scheduler'));
  assert.equal(system.policy_evolution.mutable,true);
  assert.equal(system.authority.explicit_exclusions.includes('spending_money'),true);
});


test('planner blocks receptors that can execute but cannot verify', () => {
  const g = compileSignals([{ id:'u', text:'arbitrary objective', priority:50 }]);
  const f = buildFrontier(g, {
    general:{name:'write-only',execute:async()=>({ok:true})}
  });
  assert.equal(f.ready.length,0);
  assert.equal(f.blocked.length,1);
  assert.equal(f.blocked[0].blocker,'NO_VERIFIER:general');
});

test('runtime never fulfills an explicitly failed action even if a verifier would approve it', async () => {
  const runtime = new MondayRuntime({ capabilities:{
    general:{
      name:'broken',
      execute:async()=>({ok:false}),
      verify:async()=>({ok:true})
    }
  }});
  const out = await runtime.runPass([{id:'failed-action',text:'arbitrary objective'}], {maxCycles:3});
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.final.intents['failed-action'].status,'active');
  assert.equal(out.final.results.every(result=>result.ok===false),true);
});

test('human phenotype never says VERIFIED while a verified effect is still missing', async () => {
  const runtime = new MondayRuntime({ capabilities:{
    general:{
      name:'unverified',
      execute:async()=>({ok:true}),
      verify:async()=>({ok:false,code:'NO_READBACK'})
    }
  }});
  const cycle = await runtime.cycle([{id:'not-done',text:'arbitrary objective'}]);
  const surface = renderHumanSurface(cycle);
  assert.equal(surface.state,'UNRESOLVED');
  assert.match(surface.message,/1 failed/);
  assert.equal(cycle.intents['not-done'].status,'active');
});
