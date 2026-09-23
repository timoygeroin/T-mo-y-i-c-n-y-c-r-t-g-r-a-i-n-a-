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
