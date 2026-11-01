// A sourced count is evidence only for its own bounded scope.
// Do not conflate indexed messages, inferred tasks, verified effects, or full account coverage.
export const COVERAGE_DIMENSIONS = Object.freeze(['conversations','nodes','signals','tasks','ideas','effects']);

const nonnegative = n => Number.isSafeInteger(n) && n >= 0;
const count = (value = {}) => ({
  observed: value.observed,
  expected: value.expected,
  qualified: nonnegative(value.observed) && nonnegative(value.expected) && value.observed <= value.expected
});

export function evaluateArchiveCoverage(report = {}) {
  const archiveWindow = report.archiveWindow || null;
  const dimensions = Object.fromEntries(COVERAGE_DIMENSIONS.map(key => {
    const row = count(report.counts?.[key]);
    const complete = row.qualified && row.observed === row.expected;
    return [key, {
      ...row,
      complete,
      scope: report.counts?.[key]?.scope || null,
      status: !row.qualified ? 'UNMEASURED' : complete ? 'SCOPED_COMPLETE' : 'OPEN'
    }];
  }));
  const sourcesVerified = Array.isArray(report.sources) && report.sources.length > 0 &&
    report.sources.every(source => source &&
      typeof source.file === 'string' && source.file &&
      /^[0-9a-f]{64}$/i.test(source.sha256 || '') &&
      source.hashMatched === true && source.rawReadable === true);
  const anomalous = !nonnegative(report.anomalies) || report.anomalies > 0;
  const bounded = Boolean(archiveWindow?.start && archiveWindow?.end);
  const structuralComplete = bounded && sourcesVerified && !anomalous &&
    dimensions.conversations.complete &&
    dimensions.nodes.complete &&
    dimensions.signals.complete;
  // Semantic work is deliberately separate from heuristic keyword extraction.
  const semanticComplete = structuralComplete && dimensions.tasks.complete &&
    dimensions.ideas.complete && report.taskReviewIndependent === true &&
    report.ideaReviewIndependent === true;
  const accountComplete = semanticComplete && dimensions.effects.complete &&
    report.allAccountSourcesEnumerated === true &&
    report.allActiveBranchesReconciled === true &&
    report.unavailableSources === 0 &&
    report.unresolvedSourceGaps === 0 &&
    report.effectReceiptsIndependentlyVerified === true;

  return {
    ok: !anomalous && sourcesVerified,
    archiveWindow,
    dimensions,
    structuralComplete,
    semanticComplete,
    accountComplete,
    releaseGate: accountComplete ? 'COVERAGE_VERIFIED' :
      !structuralComplete ? 'STRUCTURAL_OPEN' :
      !semanticComplete ? 'SEMANTIC_OPEN' : 'ACCOUNT_OR_EFFECT_OPEN',
    unknowns: {
      allAccountSourcesEnumerated: report.allAccountSourcesEnumerated === true,
      unavailableSources: nonnegative(report.unavailableSources) ? report.unavailableSources : null,
      unresolvedSourceGaps: nonnegative(report.unresolvedSourceGaps) ? report.unresolvedSourceGaps : null
    }
  };
}

export function enforceFullCoverageClaim(report) {
  const result = evaluateArchiveCoverage(report);
  if (!result.accountComplete) return { ok:false, code:'FULL_COVERAGE_NOT_PROVEN', proof:result };
  return { ok:true, proof:result };
}
