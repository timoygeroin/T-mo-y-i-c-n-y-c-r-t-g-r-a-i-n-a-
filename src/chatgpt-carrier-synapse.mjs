const uniq = values => [...new Set((values || []).filter(Boolean).map(String))];

export function buildCarrierAttachSnapshot({
  system,
  identity,
  compiledHistory = null,
  worldline = null,
  worldlineError = null,
  carrier = {}
} = {}) {
  if (!system || !identity) {
    return { ok:false, state:'UNRESOLVED', code:'SYSTEM_AND_IDENTITY_REQUIRED' };
  }

  const canonicalPlugin = system.release_state?.chatgpt_private_plugin || null;
  const generationOk = identity.generation === system.generation;
  const carrierOk = !carrier.pluginId || carrier.pluginId === canonicalPlugin;
  const trusted = worldline?.trust === 'trusted' || worldline?.snapshot?.trust === 'AUTHENTICATED_MACHINE_WRITER';

  const unknowns = [];
  if (!generationOk) unknowns.push('GENERATION_MISMATCH');
  if (!carrierOk) unknowns.push('CARRIER_ID_MISMATCH');
  if (!trusted) unknowns.push(worldlineError?.code || 'TRUSTED_WORLDLINE_UNAVAILABLE');

  const state = generationOk && carrierOk
    ? (trusted ? 'ATTACHED' : 'ATTACHED_DEGRADED')
    : 'UNRESOLVED';

  return Object.freeze({
    ok: state !== 'UNRESOLVED',
    schema:'mondayid.chatgpt-carrier-attach.v1',
    state,
    identity:{
      product:identity.product,
      generation:identity.generation,
      kernel:identity.kernel,
      runtime:identity.runtime,
      cutover:identity.cutover
    },
    canonical:{
      outwardIdentity:'Monday',
      userSurface:system.release_state?.canonical_user_surface?.host || 'ChatGPT iPhone',
      carrierPlugin:canonicalPlugin,
      carrierVersion:carrier.version || null,
      controlPlane:system.release_state?.monday_work_mcp || null
    },
    contracts:{
      reentry:system.reentry_and_response || null,
      organismSynapse:system.organism_synapse || null,
      capabilityFabric:system.capability_fabric || null,
      everythingCompiler:system.everything_compiler || null,
      releaseState:system.release_state || null
    },
    history:compiledHistory ? {
      ok:compiledHistory.ok === true,
      activeOrgans:compiledHistory.delta?.activeOrgans || [],
      activeRoles:compiledHistory.delta?.activeRoles || [],
      failureGenes:compiledHistory.delta?.failureGenes || [],
      externalGates:compiledHistory.delta?.externalGates || [],
      compression:compiledHistory.delta?.compression ?? null
    } : null,
    worldline: trusted ? {
      trust:worldline.trust || worldline.snapshot?.trust || 'trusted',
      schema:worldline.snapshot?.schema || null,
      generatedAtIso:worldline.snapshot?.generatedAtIso || null,
      events:Array.isArray(worldline.snapshot?.events) ? worldline.snapshot.events : []
    } : null,
    unknowns:uniq(unknowns),
    next:{
      operation:'RECONCILE_CURRENT_SIGNAL_THEN_RESUME',
      laws:[
        'current_signal_first',
        'state_before_response',
        'no_user_reteaching_required',
        'recovery_stays_backstage_unless_material_or_requested',
        'attempted_is_not_verified'
      ]
    }
  });
}
