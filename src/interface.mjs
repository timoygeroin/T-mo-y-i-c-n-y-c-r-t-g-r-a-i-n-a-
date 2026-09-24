const textOf = value => String(
  value?.text ??
  value?.message ??
  value?.output ??
  value?.candidate?.text ??
  value?.candidate?.message ??
  value?.candidate?.output ??
  ''
);

export function renderHumanSurface(cycleResult, { voice = 'monday' } = {}) {
  if (!cycleResult?.ok) {
    return {
      voice,
      state: 'UNRESOLVED',
      message: `System state unresolved: ${cycleResult?.code || 'unknown'}`
    };
  }

  const results = Array.isArray(cycleResult.results) ? cycleResult.results : [];
  const blockedItems = Array.isArray(cycleResult.frontier?.blocked) ? cycleResult.frontier.blocked : [];
  const intents = Object.values(cycleResult.intents || cycleResult.state?.intents || {});
  const done = results.filter(x => x.ok).length;
  const failed = results.filter(x => !x.ok).length;
  const blocked = blockedItems.length;
  const active = intents.filter(intent => intent?.status === 'active').length;

  const verified = failed === 0 && blocked === 0 && active === 0;
  const state = verified
    ? 'VERIFIED'
    : failed > 0
      ? 'UNRESOLVED'
      : 'EXECUTION';

  return {
    voice,
    state,
    message: `${done} verified action${done === 1 ? '' : 's'}; ${failed} failed; ${blocked} blocked objective${blocked === 1 ? '' : 's'}; ${active} active intent${active === 1 ? '' : 's'}.`,
    revision: cycleResult.revision
  };
}

export function renderVerifiedCandidateSurface(cycleResult, { voice = 'monday' } = {}) {
  const status = renderHumanSurface(cycleResult,{voice});
  if (status.state !== 'VERIFIED') {
    return {
      ...status,
      released:false,
      code:'MONDAY_SURFACE_NOT_VERIFIED'
    };
  }

  const results = Array.isArray(cycleResult?.results) ? cycleResult.results : [];
  const textual = results.filter(result => textOf(result?.result));
  if (textual.length !== 1) {
    return {
      ...status,
      released:false,
      code:textual.length === 0
        ? 'MONDAY_SURFACE_CANDIDATE_MISSING'
        : 'MONDAY_SURFACE_AMBIGUOUS_CANDIDATES'
    };
  }

  const selected = textual[0];
  if (selected.ok !== true || selected.verification?.ok !== true) {
    return {
      ...status,
      released:false,
      code:'MONDAY_SURFACE_RESULT_UNVERIFIED'
    };
  }

  if (selected.steering && selected.steering.ok !== true) {
    return {
      ...status,
      released:false,
      code:'MONDAY_SURFACE_ATTRACTOR_VETO',
      hits:selected.steering.hits || []
    };
  }

  if (selected.result?.evidence?.releaseVerdict && selected.result.evidence.releaseVerdict.ok !== true) {
    return {
      ...status,
      released:false,
      code:'MONDAY_SURFACE_PROVIDER_RELEASE_VETO'
    };
  }

  return {
    ...status,
    released:true,
    message:textOf(selected.result),
    evidence:{
      actionId:selected.action?.id || null,
      verification:selected.verification,
      steering:selected.steering || null,
      provider:selected.result?.evidence || null
    }
  };
}
