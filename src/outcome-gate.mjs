// Host-neutral completion gate: a plan, tool call or self-reported state is not an outcome.
const validReceipt = r => r && typeof r === 'object' && !Array.isArray(r) &&
  typeof r.effectId === 'string' && r.effectId.length > 0 &&
  typeof r.source === 'string' && r.source.length > 0 &&
  typeof r.observedAt === 'string' && !Number.isNaN(Date.parse(r.observedAt)) &&
  r.observation === 'independent' && r.matchesRequestedEffect === true;

export function assessOutcome(input={}) {
  const {requestedEffect,status,receipt,attemptedRoutes=[],remainingRoutes=[]}=input;
  if(typeof requestedEffect!=='string'||!requestedEffect.trim())
    return {state:'INVALID',code:'REQUESTED_EFFECT_REQUIRED',release:false};
  if(!Array.isArray(attemptedRoutes)||!Array.isArray(remainingRoutes))
    return {state:'INVALID',code:'ROUTES_MUST_BE_ARRAYS',release:false};
  if(status==='VERIFIED') {
    if(!validReceipt(receipt)) return {state:'ACTIVE',code:'INDEPENDENT_EFFECT_READBACK_REQUIRED',release:false};
    if(receipt.effectId!==requestedEffect) return {state:'ACTIVE',code:'EFFECT_MISMATCH',release:false};
    return {state:'VERIFIED',code:'EFFECT_VERIFIED',release:true};
  }
  if(status==='BLOCKED') {
    if(remainingRoutes.length) return {state:'ACTIVE',code:'ORTHOGONAL_ROUTE_REMAINS',release:false};
    if(!attemptedRoutes.length) return {state:'ACTIVE',code:'NO_ROUTE_ATTEMPTED',release:false};
    return {state:'BLOCKED',code:'STABLE_BLOCKER_REQUIRES_EXTERNAL_REPORT',release:false};
  }
  return {state:'ACTIVE',code:'OUTCOME_NOT_VERIFIED',release:false};
}
