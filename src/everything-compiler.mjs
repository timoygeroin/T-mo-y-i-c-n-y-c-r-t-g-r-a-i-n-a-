const normalize = value => String(value ?? '').trim();
const keyOf = value => normalize(value)
  .toLowerCase()
  .replace(/[^a-z0-9а-яё]+/giu,' ')
  .trim()
  .replace(/\s+/g,'-');

const allowed = new Set([
  'ACTIVE_ORGAN',
  'ACTIVE_ROLE',
  'DONOR_PROVENANCE',
  'FAILURE_GENE',
  'SUPERSEDED',
  'EXTERNAL_GATE',
  'UNKNOWN'
]);

function authorityRank(value){
  const table={
    direct_current_instruction:7,
    verified_current_runtime:6,
    verified_historical_runtime:5,
    direct_user_archive:4,
    raw_archive:3,
    derived_reconstruction:2,
    model_summary:1,
    unknown:0
  };
  return table[normalize(value)] ?? 0;
}

function proofRank(entry){
  if(entry?.verification?.ok===true) return 3;
  if(entry?.proof?.ok===true) return 2;
  if(entry?.evidence?.length) return 1;
  return 0;
}

function winner(a,b){
  const score = item => authorityRank(item.authority)*10 + proofRank(item);
  return score(b) > score(a) ? b : a;
}

export function compileProjectLineage(entries=[]){
  const groups=new Map();
  const invalid=[];

  for(const raw of entries){
    const entry={...raw};
    entry.name=normalize(entry.name);
    entry.effect=normalize(entry.effect);
    entry.disposition=normalize(entry.disposition || 'UNKNOWN').toUpperCase();
    entry.authority=normalize(entry.authority || 'unknown');
    entry.provenance=Array.isArray(entry.provenance) ? entry.provenance.map(String) : [];
    entry.evidence=Array.isArray(entry.evidence) ? entry.evidence.map(String) : [];

    if(!entry.name || !entry.effect || !allowed.has(entry.disposition)){
      invalid.push({name:entry.name || null,code:'INVALID_PROJECT_RECORD'});
      continue;
    }

    const effectKey=normalize(entry.effectKey || keyOf(entry.effect));
    const list=groups.get(effectKey) || [];
    list.push({...entry,effectKey});
    groups.set(effectKey,list);
  }

  const activeOrgans=[];
  const activeRoles=[];
  const donors=[];
  const failures=[];
  const superseded=[];
  const gates=[];
  const unknown=[];

  for(const [effectKey,list] of groups){
    const representative=list.reduce(winner);
    const ancestry=list.map(x=>x.name);
    const shared={
      effectKey,
      effect:representative.effect,
      ancestry,
      provenance:[...new Set(list.flatMap(x=>x.provenance))],
      evidence:[...new Set(list.flatMap(x=>x.evidence))],
      authority:representative.authority
    };

    const dispositions=new Set(list.map(x=>x.disposition));
    const explicitActive=list.find(x=>x.disposition==='ACTIVE_ORGAN');
    const explicitRole=list.find(x=>x.disposition==='ACTIVE_ROLE');
    const explicitGate=list.find(x=>x.disposition==='EXTERNAL_GATE');
    const explicitFailure=list.find(x=>x.disposition==='FAILURE_GENE');

    if(explicitActive){
      activeOrgans.push({
        ...shared,
        organ:normalize(explicitActive.currentOrgan || explicitActive.name),
        verification:explicitActive.verification || explicitActive.proof || null
      });
      continue;
    }
    if(explicitRole){
      activeRoles.push({...shared,role:normalize(explicitRole.currentOrgan || explicitRole.name)});
      continue;
    }
    if(explicitGate){
      gates.push({...shared,gate:normalize(explicitGate.currentOrgan || explicitGate.name)});
      continue;
    }
    if(explicitFailure){
      failures.push({...shared,gene:normalize(explicitFailure.currentOrgan || explicitFailure.name)});
      continue;
    }
    if(dispositions.has('DONOR_PROVENANCE')){
      donors.push(shared);
      continue;
    }
    if(dispositions.has('SUPERSEDED')){
      superseded.push(shared);
      continue;
    }
    unknown.push(shared);
  }

  const totalValid=[...groups.values()].reduce((n,list)=>n+list.length,0);
  const liveUnits=activeOrgans.length+activeRoles.length+gates.length+failures.length;
  const compression=totalValid===0 ? 1 : Number((totalValid/Math.max(1,liveUnits)).toFixed(2));

  return Object.freeze({
    schema:'mondayid.everything-compiler.result.v1',
    law:'project_is_temporary_container_effect_and_evidence_survive',
    projectRuntimeAuthority:false,
    totalInputs:entries.length,
    totalValid,
    invalid,
    uniqueEffects:groups.size,
    activeOrgans,
    activeRoles,
    donors,
    failureGenes:failures,
    superseded,
    externalGates:gates,
    unknown,
    compression,
    acceptance:{
      noActiveProjectState:true,
      currentEffectSurvives:Boolean(activeOrgans.length || activeRoles.length || gates.length || failures.length || donors.length || superseded.length),
      provenanceRetained:[...activeOrgans,...activeRoles,...donors,...failures,...superseded,...gates,...unknown]
        .every(item=>Array.isArray(item.provenance))
    }
  });
}

export function projectToCapabilityDelta(compiled){
  if(compiled?.schema!=='mondayid.everything-compiler.result.v1'){
    return {ok:false,code:'EVERYTHING_COMPILER_RESULT_REQUIRED'};
  }
  if(compiled.invalid?.length){
    return {ok:false,code:'INVALID_PROJECT_RECORDS',invalid:compiled.invalid};
  }
  return {
    ok:true,
    schema:'mondayid.capability-delta.v1',
    activeOrgans:compiled.activeOrgans.map(x=>x.organ),
    activeRoles:compiled.activeRoles.map(x=>x.role),
    failureGenes:compiled.failureGenes.map(x=>x.gene),
    externalGates:compiled.externalGates.map(x=>x.gate),
    donorEffects:compiled.donors.map(x=>x.effectKey),
    supersededEffects:compiled.superseded.map(x=>x.effectKey),
    compression:compiled.compression,
    law:compiled.law
  };
}
