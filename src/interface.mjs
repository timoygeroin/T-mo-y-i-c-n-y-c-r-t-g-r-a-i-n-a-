export function renderHumanSurface(cycleResult, { voice = 'monday' } = {}) {
  if (!cycleResult?.ok) return { voice, state: 'UNRESOLVED', message: `System state unresolved: ${cycleResult?.code || 'unknown'}` };
  const done = cycleResult.results.filter(x => x.ok).length;
  const blocked = cycleResult.frontier.blocked.length;
  return {
    voice,
    state: blocked ? 'EXECUTION' : 'VERIFIED',
    message: `${done} verified action${done === 1 ? '' : 's'}; ${blocked} blocked objective${blocked === 1 ? '' : 's'}.`,
    revision: cycleResult.revision
  };
}
