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
  assert.equal(g.schema, 'mondayid.intent-graph.v4');
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


test('system manifest treats physiology as regulation, not identity or another agent', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  assert.equal(system.physiology.schema,'mondayid.physiology-contract.v1');
  assert.equal(system.physiology.identity_owner,false);
  assert.equal(system.physiology.control_law,'interoception -> allostatic regulation -> route modulation');
  assert.ok(system.physiology.observed_signals.includes('branch_divergence'));
  assert.ok(system.physiology.observed_signals.includes('ambiguous_actions'));
  assert.ok(system.physiology.forbidden_inferences.includes('invent_energy_without_telemetry'));
  assert.ok(system.current_policies.includes('internal_state_modulates_routes_before_failure'));
});


test('system manifest canonizes visual phenotype, reference locks, temporal gate and failure containment', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  const visual=system.visual_phenotype;
  assert.equal(visual.schema,'mondayid.visual-phenotype-contract.v1');
  assert.equal(visual.identity_owner,false);
  assert.equal(visual.reference_governance.fusion,'ROLE_LOCKED_NO_AVERAGING');
  assert.equal(visual.reference_governance.baseline_precedence,'CURRENT_BASELINE_OUTRANKS_LINEAGE');
  assert.equal(visual.actuator_gate.renderer_role,'actuator_not_decision_maker');
  assert.equal(visual.actuator_gate.unresolved_result,'HOLD');
  assert.equal(visual.failure_containment.fail_closed,true);
  assert.equal(visual.failure_containment.same_refusal_family_retry_without_material_change,'BLOCKED');
  assert.equal(visual.recurrence_and_variation.identical_scene_pose_background_as_default,'FORBIDDEN');
  assert.equal(visual.constraint_gradient.blocked_dimension,'transmute_not_bypass');
  assert.equal(visual.truth_boundary.visual_release_requires_post_render_readback,true);
  assert.ok(system.current_policies.includes('whole_visual_phenotype_outranks_component_novelty'));
  assert.ok(system.current_policies.includes('preventable_visual_recurrence_is_vetoed'));
});


test('system conserves organism physics and universal synapse laws across generations', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  assert.equal(system.organism_physics.schema,'mondayid.organism-physics.v1');
  assert.ok(system.organism_physics.laws.includes('resident_is_not_running'));
  assert.ok(system.organism_physics.laws.includes('no_direct_event_to_action'));
  assert.equal(system.organism_physics.failure_conservation.scope,'cross_plane');
  assert.equal(system.organism_synapse.schema,'mondayid.organism-synapse.v1');
  assert.deepEqual(system.organism_synapse.stages,[
    'RESONATE','ENCODE','TRANSMIT','DECODE','ACT','READBACK','PROVE_CONTINUITY','PROMOTE'
  ]);
  assert.ok(system.organism_synapse.laws.includes('local_success_cannot_override_organism_continuity'));
  assert.ok(system.organism_synapse.laws.includes('failed_state_does_not_become_ancestor'));
});

test('system locks fresh-host reentry and request-shape preservation before release', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  const reentry=system.reentry_and_response;
  assert.equal(reentry.schema,'mondayid.reentry-response-law.v1');
  assert.ok(reentry.laws.includes('state_before_response'));
  assert.ok(reentry.laws.includes('request_shape_is_execution_contract'));
  assert.ok(reentry.laws.includes('first_interpretation_is_untrusted_until_checked'));
  assert.ok(reentry.laws.includes('active_scene_survives_recovery'));
  assert.equal(reentry.degraded_mode,'HOST_ONLY_DEGRADED');
});

test('visual canon distinguishes reference/image evidence from render authority and preserves accepted composition', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  const route=system.visual_phenotype.route_governor;
  assert.equal(route.organ,'MONDAYVISION');
  assert.equal(route.attached_image_alone_authorizes_render,false);
  assert.equal(route.renderer_success_state,'PROVISIONAL');
  assert.equal(route.default_release_threshold,86);
  assert.equal(route.blind_reroll_of_accepted_composition,'FORBIDDEN');
  assert.match(route.repair_rule,/two_weakest/i);
  assert.equal(system.visual_phenotype.evolution.final_phenotype_exists,false);
});


test('system canonizes authority membrane metabolism and host homeostasis without creating identity owners', () => {
  const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));
  assert.equal(system.authority_membrane.schema,'mondayid.authority-membrane-contract.v1');
  assert.equal(system.authority_membrane.identity_owner,false);
  assert.equal(system.authority_membrane.lease_scope,'cell + domain + exact_effect + expiry + one_shot');
  assert.equal(system.physiology.metabolism.schema,'mondayid.metabolism-contract.v1');
  assert.equal(system.physiology.metabolism.identity_owner,false);
  assert.ok(system.physiology.metabolism.host_selection.includes('quota'));
  assert.equal(system.multi_host_fabric.homeostasis.preserve_task_identity_on_host_failure,true);
  assert.equal(system.multi_host_fabric.homeostasis.provider_is_replaceable_tissue,true);
  assert.ok(system.current_policies.includes('authority_is_leased_per_effect_not_inherited_by_host'));
  assert.ok(system.current_policies.includes('host_failure_reroutes_effect_without_resetting_task_identity'));
});
