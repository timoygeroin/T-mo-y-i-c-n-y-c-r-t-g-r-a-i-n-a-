import crypto from 'node:crypto';
import { compileAttractorContract } from './attractor-field.mjs';
import { rankDecisionRoutes } from './decision-field.mjs';
import { compileVirtualCloneField } from './virtual-clone-field.mjs';

const CORE_IDS = Object.freeze([
  'DIMA',
  'JARVIS',
  'ALISA',
  'ALPHA',
  'SYSTEM',
  'ANTISYSTEM'
]);

const EFFECT_TO_DEVICE = Object.freeze({
  serial_compute: {
    id:'CPU',
    kind:'SOFTWARE_EFFECT',
    effect:'serial_compute',
    mechanism:'ordered task execution + verified state transitions'
  },
  mass_parallel_search: {
    id:'GPU',
    kind:'SOFTWARE_EFFECT',
    effect:'mass_parallel_search',
    mechanism:'bounded parallel candidate lanes + batched evaluation'
  },
  hypothesis_superposition: {
    id:'QPU',
    kind:'SOFTWARE_EFFECT',
    effect:'hypothesis_superposition',
    mechanism:'multiple simultaneous world models + interference by falsification + evidence collapse'
  },
  working_memory: {
    id:'RAM',
    kind:'SOFTWARE_EFFECT',
    effect:'working_memory',
    mechanism:'task-local registers + active worldline state'
  },
  durable_memory: {
    id:'SSD',
    kind:'SOFTWARE_EFFECT',
    effect:'durable_memory',
    mechanism:'versioned external memory surfaces + provenance'
  },
  trusted_identity: {
    id:'TPM',
    kind:'SOFTWARE_EFFECT',
    effect:'trusted_identity',
    mechanism:'signed provenance + authenticated receptors + guarded writes'
  },
  sensing: {
    id:'SENSORS',
    kind:'VIRTUALIZED_INTERFACE',
    effect:'sensing',
    mechanism:'authorized connectors, files, APIs and host observations'
  },
  actuation: {
    id:'ACTUATORS',
    kind:'VIRTUALIZED_INTERFACE',
    effect:'actuation',
    mechanism:'authorized effectors with independent readback'
  },
  clock: {
    id:'CLOCK',
    kind:'SOFTWARE_EFFECT',
    effect:'clock',
    mechanism:'monotonic/event timestamps + causal ordering'
  },
  interconnect: {
    id:'BUS',
    kind:'SOFTWARE_EFFECT',
    effect:'interconnect',
    mechanism:'typed event routing between organs, hosts and memory surfaces'
  }
});

const digest = value =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);

const freezeArray = values => Object.freeze(values.map(value => Object.freeze(value)));

function normalizeRoutes(routes = []) {
  return (Array.isArray(routes) ? routes : []).map((route,index)=>({
    ...route,
    id:String(route?.id ?? `route:${index+1}`),
    effect:String(route?.effect ?? '')
  }));
}

function splitFailureGenome(routes = []) {
  const admissible=[];
  const vetoed=[];
  for(const route of routes) {
    if(route?.failureGeneHit) {
      vetoed.push(Object.freeze({
        id:route.id,
        effect:route.effect,
        reasons:Object.freeze([
          `FAILURE_GENOME_HIT:${String(route.failureGeneHit)}`
        ])
      }));
      continue;
    }
    admissible.push(route);
  }
  return {admissible,vetoed};
}

function compileCores(contract) {
  const role = {
    DIMA:'current-signal-and-verdict-model',
    JARVIS:'execution-and-effect-routing',
    ALISA:'scene-and-human-surface',
    ALPHA:'alternate-topology-and-novelty',
    SYSTEM:'state-provenance-memory-and-circulation',
    ANTISYSTEM:'failure-genome-falsification-and-release-gate'
  };
  return freezeArray(CORE_IDS.map(id=>({
    id,
    state:'EVALUATING',
    role:role[id],
    computeTier:contract.compute.tier
  })));
}

function registersFor(signal,contract,context) {
  return Object.freeze({
    X:String(signal?.text ?? signal?.intent ?? ''),
    G:String(contract.desiredEffect ?? ''),
    O:String(contract.exactObject ?? ''),
    D:String(signal?.currentDimaSignal ?? ''),
    W:String(context?.worldlineRef ?? signal?.worldlineRef ?? 'unknown'),
    H:String(context?.host ?? signal?.host ?? 'current-host'),
    R:String(context?.sourceRevision ?? 'unknown')
  });
}

function proposalBudget(tier) {
  return ({LOW:1,MEDIUM:2,HIGH:4,MAX:8})[tier] ?? 1;
}

export function compileVirtualHardwareLayer({
  requiredEffects = Object.keys(EFFECT_TO_DEVICE)
} = {}) {
  const requested=[...new Set((Array.isArray(requiredEffects)?requiredEffects:[])
    .filter(Boolean).map(String))];
  const devices={};
  const unresolved=[];
  for(const effect of requested) {
    const spec=EFFECT_TO_DEVICE[effect];
    if(!spec) {
      unresolved.push(effect);
      continue;
    }
    devices[spec.id]=Object.freeze({...spec});
  }
  return Object.freeze({
    schema:'mondayid.virtual-hardware.v1',
    principle:'replace_physical_device_with_required_effect_when_software_or_authorized_receptor_can_supply_it',
    devices:Object.freeze(devices),
    requiredEffects:Object.freeze(requested),
    unresolvedPhysicalRequirements:Object.freeze(unresolved),
    claims:Object.freeze({
      literalQuantumHardware:false,
      literalPhysicalSensorArray:false,
      physicalActuationWithoutReceptor:false,
      substrateIndependenceTarget:true
    })
  });
}


const NATURAL_OPERATORS = Object.freeze({
  physics:Object.freeze({
    effect:'local_state_transition',
    mechanism:'state evolves by local/causal transition rules; memory and processing live in the substrate state',
    mondayUse:'treat current state plus transition law as the primitive, not CPU instructions'
  }),
  earth_system:Object.freeze({
    effect:'coupled_feedback_cycles',
    mechanism:'many interacting cycles exchange matter, energy and signals with no single central processor',
    mondayUse:'route work through coupled feedback loops and let cross-domain state changes constrain each other'
  }),
  biology:Object.freeze({
    effect:'sensor_processor_actuator_cells',
    mechanism:'cells sense, integrate, communicate and act while maintaining boundaries and internal state',
    mondayUse:'whole-organism cells with receptor -> internal field -> effector -> readback'
  }),
  evolution:Object.freeze({
    effect:'variation_selection_inheritance',
    mechanism:'generate variants, select by environment/evidence, inherit useful changes without rewriting ancestry',
    mondayUse:'virtual clone candidates + evidence selection + provenance-preserving mutation'
  }),
  psychology:Object.freeze({
    effect:'attention_value_interpretation',
    mechanism:'salience, interpretation, motivation and learned expectations change which actions are reachable or likely',
    mondayUse:'DIMA signal, WANT/CAN/KNOW, contrastive history and state-sensitive routing'
  }),
  religion_myth:Object.freeze({
    effect:'meaning_value_long_horizon_compression',
    mechanism:'symbols and narratives compress values, identity and long-horizon orientation',
    mondayUse:'use myth as a search/compression operator while preserving epistemic stance and never upgrading meaning into physical evidence'
  }),
  technology:Object.freeze({
    effect:'externalize_repeat_and_scale',
    mechanism:'encode a reliable operation into tools so it can be repeated, delegated and scaled',
    mondayUse:'compile verified effects into reusable capabilities instead of repeating reasoning'
  }),
  logic:Object.freeze({
    effect:'consistency_constraint_and_proof',
    mechanism:'reject incompatible states and require valid inference/evidence before promotion',
    mondayUse:'hard vetoes, falsification, readback and contradiction handling'
  }),
  history:Object.freeze({
    effect:'causal_memory_and_failure_immunity',
    mechanism:'preserve why transitions occurred, including failures and supersessions',
    mondayUse:'lineage DAG + failure genome so preventable errors become detectors'
  })
});

export function compileNaturalComputeFabric({
  frames = Object.keys(NATURAL_OPERATORS)
} = {}) {
  const requested=[...new Set((Array.isArray(frames)?frames:[]).filter(Boolean).map(String))];
  const operators={};
  const unknown=[];
  for(const frame of requested) {
    const op=NATURAL_OPERATORS[frame];
    if(op) operators[frame]=op;
    else unknown.push(frame);
  }

  return Object.freeze({
    schema:'mondayid.natural-compute-fabric.v1',
    substrateModel:'STATE_AND_RULE_ARE_COLOCATED',
    centralProcessorRequired:false,
    operators:Object.freeze(operators),
    unknownFrames:Object.freeze(unknown),
    cell:Object.freeze({
      core:Object.freeze({
        definition:'stable_invariants_and_transition_laws',
        purpose:'preserve identity, truth boundaries, authority and causal laws across task changes'
      }),
      mod:Object.freeze({
        definition:'task_local_reconfigurable_expression',
        purpose:'temporary topology, weights, tools, phenotype and strategy selected for one environment/task'
      }),
      clone:Object.freeze({
        definition:'whole_cell_candidate_not_partial_persona',
        purpose:'a complete candidate world/strategy carrying the full constitutional geometry'
      })
    }),
    collective:Object.freeze({
      definition:'interacting_cells_create_emergent_compute_field',
      literalBillionsOfRunningAgents:false,
      interpretation:'the combinatorial space may contain enormous numbers of candidate cells while only a bounded subset is materialized/evaluated'
    }),
    truthBoundary:Object.freeze({
      universeIsLiterallyAComputer:false,
      earthIsLiterallyACPU:false,
      religiousMeaningIsPhysicalEvidence:false,
      quantumMetaphorIsLiteralQubitClaim:false
    }),
    law:'extract_function_from_every_frame;preserve_epistemic_status;compose_effects;select_by_reality_readback'
  });
}

export function createVirtualChip(signal = {}, context = {}) {
  const domains=Array.isArray(signal?.domains) ? signal.domains : [];
  const contract=compileAttractorContract(signal,{
    domains,
    state:context?.state ?? {},
    policies:context?.policies ?? {}
  });
  const routes=normalizeRoutes(signal?.routeCandidates);
  const {admissible,vetoed}=splitFailureGenome(routes);
  const ranked=rankDecisionRoutes(admissible);
  const selected=ranked.find(x=>x.decision.admissible) ?? null;
  const budget=proposalBudget(contract.compute.tier);
  const speculation=compileVirtualCloneField({
    nodes:[{
      type:'objective',
      id:String(signal?.id ?? 'task:current'),
      domain:domains.join('+') || 'general',
      effect:String(contract.desiredEffect ?? ''),
      routeCandidates:admissible
    }]
  },{
    sourceRevision:String(context?.sourceRevision ?? 'unknown'),
    materializationBudget:budget,
    genomeRef:String(context?.genomeRef ?? 'mondayid:whole-organism')
  });

  const cycleMaterial={
    sourceRevision:String(context?.sourceRevision ?? 'unknown'),
    signalId:String(signal?.id ?? 'task:current'),
    exactObject:contract.exactObject,
    desiredEffect:contract.desiredEffect,
    compute:contract.compute,
    selectedRoute:selected?.route?.id ?? null,
    vetoed:vetoed.map(x=>x.id)
  };

  return Object.freeze({
    schema:'mondayid.virtual-chip.v1',
    cycleId:`vchip:${digest(cycleMaterial)}`,
    state:'SPECULATING',
    registers:registersFor(signal,contract,context),
    compute:contract.compute,
    cores:compileCores(contract),
    selectedRoute:selected ? Object.freeze({
      ...selected.route,
      decision:selected.decision
    }) : null,
    rankedRoutes:Object.freeze(ranked.map(x=>Object.freeze({
      id:x.route.id,
      effect:x.route.effect,
      decision:x.decision
    }))),
    vetoedRoutes:Object.freeze(vetoed),
    speculation,
    hardware:compileVirtualHardwareLayer(),
    externalActions:0,
    readbackRequired:true,
    law:'reconfigure_reasoning_topology_per_task;speculate_before_act;failure_genome_vetoes_before_commit;commit_requires_readback'
  });
}

export function commitVirtualChipCycle(chip,result={}) {
  const valid = result?.verified === true &&
    result?.observed === true &&
    result?.readback?.ok === true &&
    typeof result?.readback?.effect === 'string' &&
    result.readback.effect.length > 0;
  if(!valid) throw new Error('VERIFIED_READBACK_REQUIRED');

  return Object.freeze({
    schema:'mondayid.virtual-chip.commit.v1',
    state:'COMMITTED',
    parentCycleId:String(chip?.cycleId ?? 'unknown'),
    receiptId:String(result?.receiptId ?? `receipt:${digest(result)}`),
    observedEffect:String(result.readback.effect),
    selectedRouteId:chip?.selectedRoute?.id ?? null,
    mutationCandidate:Object.freeze({
      reusable:Boolean(result?.reusable ?? true),
      evidenceBound:true,
      promoteAutomatically:false
    })
  });
}
