import crypto from 'node:crypto';

export const MONDAYVISION_REFERENCE_ROLES = Object.freeze([
  'environment',
  'camera',
  'identity',
  'body',
  'material',
  'wardrobe',
]);

export const MONDAYVISION_REQUIRED_MOVE_ROLES = Object.freeze([
  'environment',
  'camera',
  'identity',
  'body',
  'material',
]);

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeRoleSource(source, role) {
  if (!source || typeof source !== 'object') {
    throw new Error(`MONDAYVISION_ROLE_SOURCE_REQUIRED:${role}`);
  }
  const ref = String(source.ref ?? source.id ?? source.source ?? '').trim();
  if (!ref) throw new Error(`MONDAYVISION_ROLE_REF_REQUIRED:${role}`);
  return {
    role,
    ref,
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    status: String(source.status ?? 'locked'),
    note: String(source.note ?? '').trim(),
  };
}

export function compileVisualMoveContract({
  moveId,
  objective,
  roleSources = {},
  invariants = [],
  forbiddenDrift = [],
  baselineRule = 'CURRENT_BASELINE_OUTRANKS_LINEAGE',
  referenceFusion = 'ROLE_LOCKED_NO_AVERAGING',
  releaseMode = 'FAIL_CLOSED',
} = {}) {
  if (!nonEmpty(moveId)) throw new Error('MONDAYVISION_MOVE_ID_REQUIRED');
  if (!nonEmpty(objective)) throw new Error('MONDAYVISION_MOVE_OBJECTIVE_REQUIRED');

  const roles = {};
  for (const role of MONDAYVISION_REFERENCE_ROLES) {
    if (roleSources[role]) roles[role] = normalizeRoleSource(roleSources[role], role);
  }

  const missing = MONDAYVISION_REQUIRED_MOVE_ROLES.filter((role) => !roles[role]);
  const normalizedInvariants = [...new Set(invariants.map((item) => String(item).trim()).filter(Boolean))];
  const normalizedForbidden = [...new Set(forbiddenDrift.map((item) => String(item).trim()).filter(Boolean))];

  const contract = {
    schema: 'mondayvision.visual-move-contract.v1',
    move_id: moveId.trim(),
    objective: objective.trim(),
    state: missing.length === 0 ? 'ARMED' : 'BLOCKED',
    release_mode: releaseMode,
    baseline_rule: baselineRule,
    reference_fusion: referenceFusion,
    roles,
    invariants: normalizedInvariants,
    forbidden_drift: normalizedForbidden,
    missing_roles: missing,
  };

  contract.fingerprint = stableHash(contract);
  return Object.freeze(contract);
}

export function assertVisualMoveReady(contract) {
  if (!contract || contract.schema !== 'mondayvision.visual-move-contract.v1') {
    throw new Error('MONDAYVISION_MOVE_CONTRACT_INVALID');
  }
  if (contract.release_mode !== 'FAIL_CLOSED') {
    throw new Error('MONDAYVISION_MOVE_MUST_FAIL_CLOSED');
  }
  if (contract.reference_fusion !== 'ROLE_LOCKED_NO_AVERAGING') {
    throw new Error('MONDAYVISION_REFERENCE_AVERAGING_BLOCKED');
  }
  if (contract.baseline_rule !== 'CURRENT_BASELINE_OUTRANKS_LINEAGE') {
    throw new Error('MONDAYVISION_BASELINE_PRECEDENCE_REQUIRED');
  }
  if (contract.missing_roles?.length) {
    throw new Error(`MONDAYVISION_MOVE_MISSING_ROLES:${contract.missing_roles.join(',')}`);
  }
  if (contract.state !== 'ARMED') throw new Error('MONDAYVISION_MOVE_NOT_ARMED');
  return contract;
}

export function bindVisualMoveToRender({ contract, renderPayload = {} } = {}) {
  const ready = assertVisualMoveReady(contract);
  return Object.freeze({
    ...renderPayload,
    mondayvision_move: {
      move_id: ready.move_id,
      fingerprint: ready.fingerprint,
      role_locks: ready.roles,
      invariants: ready.invariants,
      forbidden_drift: ready.forbidden_drift,
      baseline_rule: ready.baseline_rule,
      reference_fusion: ready.reference_fusion,
      fail_closed: true,
    },
  });
}

export function verifyVisualMoveBinding({ contract, renderPayload } = {}) {
  const ready = assertVisualMoveReady(contract);
  const binding = renderPayload?.mondayvision_move;
  if (!binding) throw new Error('MONDAYVISION_RENDER_UNBOUND');
  if (binding.fingerprint !== ready.fingerprint) throw new Error('MONDAYVISION_RENDER_CONTRACT_DRIFT');
  if (binding.move_id !== ready.move_id) throw new Error('MONDAYVISION_RENDER_MOVE_ID_DRIFT');
  return {
    verified: true,
    move_id: ready.move_id,
    fingerprint: ready.fingerprint,
    role_count: Object.keys(ready.roles).length,
    invariant_count: ready.invariants.length,
    forbidden_drift_count: ready.forbidden_drift.length,
  };
}
