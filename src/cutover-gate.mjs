export const REQUIRED_CUTOVER_PROOFS = Object.freeze([
  'system_proof_ci',
  'live_external_worldline_boot',
  'recursive_shared_state',
  'causal_archive_import',
  'semantic_preservation',
  'current_main_lineage_parent',
  'real_effect_receptor',
  'shared_worldline_write',
  'user_visible_effect',
  'no_spend_boundary'
]);

export function evaluateCutover(receipts = {}) {
  const missing = REQUIRED_CUTOVER_PROOFS.filter(key => receipts[key]?.ok !== true);
  return {
    ready:missing.length === 0,
    state:missing.length === 0 ? 'READY' : 'BLOCKED',
    missing,
    verified:REQUIRED_CUTOVER_PROOFS.filter(key => receipts[key]?.ok === true)
  };
}
