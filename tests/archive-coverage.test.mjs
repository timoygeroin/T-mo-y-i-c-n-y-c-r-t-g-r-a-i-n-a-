import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateArchiveCoverage, enforceFullCoverageClaim } from '../src/archive-coverage.mjs';

const sha = 'a'.repeat(64);
const base = () => ({
  archiveWindow:{start:'2024-08-03',end:'2026-02-08'},
  sources:[{file:'RAW_CHATS_SHARD_01.jsonl',sha256:sha,hashMatched:true,rawReadable:true}],
  anomalies:0,
  counts:{
    conversations:{observed:650,expected:650,scope:'six-export-shards'},
    nodes:{observed:124667,expected:124667,scope:'six-export-shards'},
    signals:{observed:40816,expected:40816,scope:'six-export-shards'},
    tasks:{observed:0,expected:40816,scope:'unreviewed'},
    ideas:{observed:0,expected:40816,scope:'unreviewed'},
    effects:{observed:0,expected:1,scope:'unverified'}
  }
});
test('650/650 archive is NOT 100% account or task/idea coverage', () => {
  const proof=evaluateArchiveCoverage(base());
  assert.equal(proof.structuralComplete,true);
  assert.equal(proof.semanticComplete,false);
  assert.equal(proof.accountComplete,false);
  assert.equal(proof.releaseGate,'SEMANTIC_OPEN');
  assert.equal(enforceFullCoverageClaim(base()).code,'FULL_COVERAGE_NOT_PROVEN');
});
test('missing hashes, unknown denominator, and anomalies veto structural complete', () => {
  const a=base();a.sources[0].hashMatched=false;
  assert.equal(evaluateArchiveCoverage(a).structuralComplete,false);
  const b=base();delete b.counts.nodes.expected;
  assert.equal(evaluateArchiveCoverage(b).structuralComplete,false);
  const c=base();c.anomalies=1;
  assert.equal(evaluateArchiveCoverage(c).structuralComplete,false);
});
test('independent semantics and account-wide proof are ALL necessary', () => {
  const x=base();
  x.counts.tasks.observed=x.counts.tasks.expected;
  x.counts.ideas.observed=x.counts.ideas.expected;
  x.taskReviewIndependent=true;x.ideaReviewIndependent=true;
  assert.equal(evaluateArchiveCoverage(x).semanticComplete,true);
  assert.equal(evaluateArchiveCoverage(x).accountComplete,false);
  x.counts.effects.observed=x.counts.effects.expected;
  x.allAccountSourcesEnumerated=true;
  x.allActiveBranchesReconciled=true;
  x.unavailableSources=0;
  x.unresolvedSourceGaps=0;
  x.effectReceiptsIndependentlyVerified=true;
  assert.equal(enforceFullCoverageClaim(x).ok,true);
});
test('does not allow 101 percent or unknown gaps to masquerade as complete', () => {
  const a=base();a.counts.nodes.observed=124668;
  assert.equal(evaluateArchiveCoverage(a).dimensions.nodes.status,'UNMEASURED');
  const b=base();b.unavailableSources=null;
  assert.equal(evaluateArchiveCoverage(b).unknowns.unavailableSources,null);
});
