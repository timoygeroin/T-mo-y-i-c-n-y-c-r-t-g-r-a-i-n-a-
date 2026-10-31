import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualChip, commitVirtualChipCycle, compileVirtualHardwareLayer } from '../src/virtual-chip.mjs';

const baseSignal = {
  id:'task:effect-first',
  text:'Create the effect first, then derive the route.',
  exactObject:'verified task effect',
  desiredEffect:'produce a verified result and make the next pass smarter',
  currentDimaSignal:'effect first; use everything; do not narrow',
  domains:['research','code','continuity'],
  ambiguity:0.9,
  novelty:0.95,
  historicalDepth:1,
  recurrenceCost:0.9,
  consequence:0.8,
  routeCandidates:[
    {
      id:'repeat-old-route',
      effect:'repeat the previous architecture',
      truth:0.8,
      informationGain:0.1,
      failureGeneHit:'REPEATED_PREVENTABLE_ROUTE'
    },
    {
      id:'world-compiler',
      effect:'change the representation before acting',
      truth:0.95,
      informationGain:1,
      futureOptionality:1,
      systemImprovement:1,
      futureCorrectionsEliminated:1,
      transferValue:1
    }
  ]
};

test('virtual chip reconfigures compute topology per task and keeps all constitutional cores live',()=>{
  const chip=createVirtualChip(baseSignal,{sourceRevision:'rev-chip-1'});

  assert.equal(chip.schema,'mondayid.virtual-chip.v1');
  assert.equal(chip.compute.tier,'MAX');
  assert.equal(chip.compute.topology.mode,'branch-falsify-counterexample-collapse');
  assert.deepEqual(chip.cores.map(x=>x.id),[
    'DIMA','JARVIS','ALISA','ALPHA','SYSTEM','ANTISYSTEM'
  ]);
  assert.ok(chip.cores.every(x=>x.state==='EVALUATING'));
  assert.equal(chip.registers.G,baseSignal.desiredEffect);
  assert.equal(chip.registers.O,baseSignal.exactObject);
  assert.equal(chip.registers.D,baseSignal.currentDimaSignal);
  assert.equal(chip.externalActions,0);
});

test('failure genome vetoes a repeated route before speculative materialization',()=>{
  const chip=createVirtualChip(baseSignal,{sourceRevision:'rev-chip-2'});

  assert.equal(chip.selectedRoute.id,'world-compiler');
  assert.ok(chip.vetoedRoutes.some(x=>
    x.id==='repeat-old-route' &&
    x.reasons.includes('FAILURE_GENOME_HIT:REPEATED_PREVENTABLE_ROUTE')
  ));
  assert.ok(chip.speculation.materializedProposals>=1);
  assert.ok(chip.speculation.proposals.every(p=>
    p.selections.every(s=>s.id!=='repeat-old-route')
  ));
});

test('chip is task-reconfigurable instead of fixed-depth autopilot',()=>{
  const low=createVirtualChip({
    id:'task:simple',
    text:'echo verified state',
    exactObject:'state',
    desiredEffect:'return state',
    domains:['continuity'],
    novelty:0.05,
    ambiguity:0.05,
    historicalDepth:0,
    recurrenceCost:0,
    repairCost:0,
    consequence:0.05,
    routeCandidates:[{id:'direct',effect:'return state',truth:1}]
  });
  const high=createVirtualChip(baseSignal);

  assert.equal(low.compute.tier,'LOW');
  assert.equal(low.speculation.proposalBudget,1);
  assert.equal(high.compute.tier,'MAX');
  assert.ok(high.speculation.proposalBudget>low.speculation.proposalBudget);
});

test('chip cannot commit a result without verified readback',()=>{
  const chip=createVirtualChip(baseSignal,{sourceRevision:'rev-chip-3'});

  assert.throws(
    ()=>commitVirtualChipCycle(chip,{verified:true}),
    /VERIFIED_READBACK_REQUIRED/
  );

  const committed=commitVirtualChipCycle(chip,{
    verified:true,
    observed:true,
    readback:{ok:true,effect:'verified task effect'},
    receiptId:'receipt:1'
  });

  assert.equal(committed.state,'COMMITTED');
  assert.equal(committed.receiptId,'receipt:1');
  assert.equal(committed.observedEffect,'verified task effect');
  assert.equal(committed.parentCycleId,chip.cycleId);
});


test('virtual hardware layer replaces physical dependencies by their computational effects',()=>{
  const hw=compileVirtualHardwareLayer({
    requiredEffects:[
      'serial_compute',
      'mass_parallel_search',
      'hypothesis_superposition',
      'working_memory',
      'durable_memory',
      'trusted_identity',
      'sensing',
      'actuation',
      'clock',
      'interconnect'
    ]
  });

  assert.equal(hw.schema,'mondayid.virtual-hardware.v1');
  assert.equal(hw.unresolvedPhysicalRequirements.length,0);
  assert.equal(hw.devices.CPU.kind,'SOFTWARE_EFFECT');
  assert.equal(hw.devices.GPU.effect,'mass_parallel_search');
  assert.equal(hw.devices.QPU.effect,'hypothesis_superposition');
  assert.equal(hw.devices.RAM.effect,'working_memory');
  assert.equal(hw.devices.SSD.effect,'durable_memory');
  assert.equal(hw.devices.TPM.effect,'trusted_identity');
  assert.equal(hw.devices.SENSORS.effect,'sensing');
  assert.equal(hw.devices.ACTUATORS.effect,'actuation');
  assert.equal(hw.devices.CLOCK.effect,'clock');
  assert.equal(hw.devices.BUS.effect,'interconnect');
  assert.equal(hw.claims.literalQuantumHardware,false);
  assert.equal(hw.claims.physicalActuationWithoutReceptor,false);
});
