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

export function evaluateCutoverManifest(manifest = {}) {
  const proof = evaluateCutover(manifest.receipts || {});
  if (!proof.ready) {
    return {
      ok:false,
      phase:'BLOCKED',
      state:'BLOCKED',
      missing:proof.missing,
      verified:proof.verified
    };
  }

  if (manifest.status === 'READY_FOR_CODE_CUTOVER') {
    return {
      ok:true,
      phase:'READY_FOR_CODE_CUTOVER',
      state:'READY',
      missing:[],
      verified:proof.verified
    };
  }

  if (manifest.status === 'CUTOVER_COMPLETE') {
    const completionMissing = [];
    if (manifest.code_cutover?.ok !== true) completionMissing.push('code_cutover');
    if (manifest.external_receipt_after_cutover?.trusted_worldline_write?.ok !== true) {
      completionMissing.push('trusted_worldline_cutover_receipt');
    }

    return {
      ok:completionMissing.length === 0,
      phase:'CUTOVER_COMPLETE',
      state:completionMissing.length === 0 ? 'COMPLETE' : 'BLOCKED',
      missing:completionMissing,
      verified:proof.verified
    };
  }

  return {
    ok:false,
    phase:'UNKNOWN',
    state:'BLOCKED',
    missing:['valid_cutover_status'],
    verified:proof.verified
  };
}
