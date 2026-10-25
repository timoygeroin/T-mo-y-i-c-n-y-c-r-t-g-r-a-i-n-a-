import { simulateDeus0 } from './deus-zero.mjs';

export const DEUS_LIMITS=Object.freeze({
  maxBytes:12_000,
  maxNodes:256,
  maxHorizon:6,
  maxActions:12,
  maxDimensions:8
});

export function simulateBoundedDeus0(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('MODEL_REQUIRED');
  if (Object.keys(value).some(key => !['id','initial','goals','constraints','actions','horizon','maxNodes'].includes(key))) {
    throw Error('UNKNOWN_MODEL_FIELD');
  }
  if (!Array.isArray(value.actions) || value.actions.length > DEUS_LIMITS.maxActions) throw Error('ACTION_BUDGET_EXCEEDED');
  if (!value.initial || Array.isArray(value.initial) || Object.keys(value.initial).length > DEUS_LIMITS.maxDimensions) {
    throw Error('DIMENSION_BUDGET_EXCEEDED');
  }
  const horizon = value.horizon ?? 4;
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > DEUS_LIMITS.maxHorizon) throw Error('HORIZON_BUDGET_EXCEEDED');
  const maxNodes = value.maxNodes ?? DEUS_LIMITS.maxNodes;
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > DEUS_LIMITS.maxNodes) throw Error('NODE_BUDGET_EXCEEDED');
  return simulateDeus0({...value,horizon,maxNodes});
}

export function deus0ErrorCode(cause) {
  const message=String(cause?.message || '');
  return /^(?:DEUS0_[A-Z_]+|[A-Z_]+)$/.test(message) ? message : 'INVALID_MODEL';
}
