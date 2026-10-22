import { makeEffectCapsule, runEffectCapsule } from './effect-abi.mjs';

// This selector does not execute effects. The existing Effect ABI keeps execution authority.
const METHODS = new Set(['reuse','deterministic','local-model','delegated']);
const CAPSULE_KEYS = ['schema','id','intent','capability','privacy','maxCostUsd','sideEffect','digest'];
const isNumber = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const name = x => typeof x === 'string' && x.trim().length > 0;

function validCapsule(capsule) {
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) return false;
  if (Object.keys(capsule).length !== CAPSULE_KEYS.length ||
      CAPSULE_KEYS.some(key => !(key in capsule))) return false;
  try { return makeEffectCapsule(capsule).digest === capsule.digest; }
  catch { return false; }
}

function profile(route) {
  const p = route?.resourceEstimate;
  if (!p || !isNumber(p.cashUsd) || !isNumber(p.workUnits) || !isNumber(p.networkBytes)) return null;
  return {cashUsd:p.cashUsd,workUnits:p.workUnits,networkBytes:p.networkBytes};
}

function screen(capsule, route, options) {
  if (!name(route?.id) || !METHODS.has(route.method) || !name(route.provenance)) return 'ROUTE_INVALID';
  if (!route.adapter || !name(route.adapter.id) || !Array.isArray(route.adapter.capabilities) ||
      typeof route.adapter.execute !== 'function' || typeof route.adapter.estimate !== 'function') return 'ADAPTER_INVALID';
  if (!route.adapter.capabilities.includes(capsule.capability)) return 'CAPABILITY_UNAVAILABLE';
  if (capsule.privacy === 'local' && route.adapter.privacy !== 'local') return 'PRIVACY_BOUNDARY';
  if (route.method === 'local-model' && route.adapter.privacy !== 'local') return 'PRIVACY_BOUNDARY';
  if (route.method === 'delegated' && route.adapter.privacy !== 'delegated') return 'ROUTE_INVALID';
  if (route.method === 'reuse' && route.scopeDigest !== capsule.digest) return 'STALE_REUSE';
  if (route.method === 'reuse' && typeof route.probe !== 'function') return 'REUSE_PROOF_REQUIRED';
  if (route.quality !== 'exact' && !(route.quality === 'approximate' && options.allowApproximate === true)) return 'QUALITY_UNVERIFIED';
  if (typeof route.readback !== 'function') return 'READBACK_REQUIRED';
  const p=profile(route);
  if (!p) return 'UNKNOWN_RESOURCE_PROFILE';
  if (p.cashUsd > capsule.maxCostUsd) return 'BUDGET_EXCEEDED';
  return null;
}

/**
 * Choose minimum reported resource strategy for the desired effect, not the vendor.
 * No execution or AI inference during planning. Estimates are not measured energy.
 */
export async function planSubstrates(capsule, candidates = [], options = {}) {
  if (!validCapsule(capsule)) return {schema:'monday.substrate-plan.v0',status:'BLOCKED',code:'INVALID_CAPSULE',rejections:[]};
  if (!Array.isArray(candidates)) return {schema:'monday.substrate-plan.v0',status:'BLOCKED',code:'INVALID_CANDIDATES',rejections:[]};
  const acceptable=[],rejections=[],seen=new Set();
  for (const route of candidates) {
    const id=route?.id||null;
    let reason=screen(capsule,route,options);
    if (!reason && seen.has(id)) reason='DUPLICATE_ROUTE_ID';
    if (!reason && route.method === 'reuse') {
      try {
        const proof=await route.probe({capsule});
        if (proof?.ok !== true || !name(proof?.evidence)) reason='REUSE_PROOF_MISSING';
      } catch {reason='REUSE_PROOF_MISSING';}
    }
    if (reason) {rejections.push({id,code:reason});continue;}
    seen.add(id);
    acceptable.push({id,method:route.method,profile:profile(route),provenance:route.provenance,
      adapterId:route.adapter.id,quality:route.quality,route});
  }
  acceptable.sort((a,b)=> a.profile.cashUsd - b.profile.cashUsd ||
    a.profile.workUnits-b.profile.workUnits || a.profile.networkBytes-b.profile.networkBytes ||
    a.id.localeCompare(b.id));
  if (!acceptable.length) return {schema:'monday.substrate-plan.v0',status:'BLOCKED',code:'NO_ADMISSIBLE_SUBSTRATE',capsuleDigest:capsule.digest,rejections};
  return {schema:'monday.substrate-plan.v0',status:'READY',code:null,capsule,
    capsuleDigest:capsule.digest,allowApproximate:options.allowApproximate===true,selected:acceptable[0],
    alternatives:acceptable.slice(1).map(({route,...rest})=>rest),rejections};
}

/** No fallback after an ambiguous effect. The prior executor may have acted. */
export async function executeSubstratePlan(plan,{authorize}={}) {
  if (plan?.status !== 'READY' || !validCapsule(plan.capsule) ||
      plan.capsuleDigest !== plan.capsule.digest || !plan.selected?.route) {
    return {status:'BLOCKED',code:'INVALID_PLAN'};
  }
  const {route,method,profile:estimated}=plan.selected;
  if (route.quality==='approximate' && plan.allowApproximate!==true) return {status:'BLOCKED',code:'QUALITY_UNVERIFIED'};
  if (route.id!==plan.selected.id || route.method!==method || route.adapter.id!==plan.selected.adapterId ||
      route.quality!==plan.selected.quality || route.provenance!==plan.selected.provenance ||
      JSON.stringify(profile(route))!==JSON.stringify(estimated)) return {status:'BLOCKED',code:'PLAN_ROUTE_CHANGED'};
  const reason=screen(plan.capsule,route,{allowApproximate:plan.allowApproximate===true});
  if (reason) return {status:'BLOCKED',code:reason};
  if (method==='reuse') {
    let proof;try{proof=await route.probe({capsule:plan.capsule})}catch{}
    if (proof?.ok!==true || !name(proof?.evidence)) return {status:'BLOCKED',code:'REUSE_PROOF_STALE'};
  }
  const receipt=await runEffectCapsule(plan.capsule,{adapter:route.adapter,verify:route.readback,authorize});
  return {...receipt,method,estimatedResources:estimated,provenance:route.provenance};
}
