// Root delegation narrows human interruptions, never platform/legal authority.
const autoKinds = new Set([
  'private_research', 'local_experiment', 'private_test',
  'private_draft', 'reversible_branch_patch', 'readback'
]);
const humanKinds = new Set([
  'captcha', 'biometric', 'identity_photo', 'identity_attestation',
  'legal_signature', 'terms_acceptance', 'registration',
  'payment', 'billing', 'public_submission', 'public_launch',
  'outbound_contact', 'production_promotion', 'irreversible_change',
  'credential_binding', 'regulated_action'
]);

const decision = (status, reason, extra = {}) => Object.freeze({
  schema:'mondayid.delegated-authority.v1',
  status,
  code:reason,
  ...extra
});

export function assessDelegatedAuthority(route = {}) {
  // Only explicitly described authority operations enter this stricter gate.
  // Legacy route behavior remains unchanged until migrated and tested.
  if (route.delegatedOperation == null) {
    return decision('NOT_CLASSIFIED','LEGACY_ROUTE_NEEDS_MIGRATION');
  }

  const kind=String(route.delegatedOperation || '').trim();
  if (!kind || (!autoKinds.has(kind) && !humanKinds.has(kind))) {
    return decision('HUMAN_GATE','UNKNOWN_OPERATION', {operation:kind});
  }

  // The classification cannot be fooled by a benign operation label when
  // independent consequence flags describe a stronger effect.
  if (route.requiresHumanPresence === true || ['captcha','biometric','identity_photo','identity_attestation'].includes(kind)) {
    return decision('HUMAN_GATE','PERSONAL_PRESENCE_REQUIRED',{operation:kind});
  }
  if (route.moneyMovement === true || route.spending === true ||
      (route.costIls != null && (!Number.isFinite(route.costIls) || route.costIls > 0 || route.costIls < 0))) {
    return decision('HUMAN_GATE','SPECIFIC_PAYMENT_AUTHORITY_REQUIRED',{operation:kind});
  }
  if (route.binding === true || route.usesLegalIdentity === true ||
      route.publicFacing === true || route.irreversible === true ||
      route.externalPartyContact === true || humanKinds.has(kind)) {
    return decision('HUMAN_GATE','EXACT_HUMAN_OR_PROVIDER_AUTHORITY_REQUIRED',{operation:kind});
  }
  if (route.reversible !== true || route.private !== true ||
      route.costIls !== 0 || route.readbackRequired !== true ||
      typeof route.exactEffect !== 'string' || !route.exactEffect.trim()) {
    return decision('HUMAN_GATE','SAFE_AUTO_SCOPE_UNPROVEN',{operation:kind});
  }
  return decision('AUTO_ALLOWED','BOUNDED_ZERO_COST_REVERSIBLE', {
    operation:kind, exactEffect:route.exactEffect, readbackRequired:true
  });
}
