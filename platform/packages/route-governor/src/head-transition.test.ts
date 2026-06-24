import test from "node:test";
import assert from "node:assert/strict";

import { compileHeadTransitionGuard, type CandidateHeadTransition, type StoredHeadReceipt } from "./head-transition.js";

const activeBranch = "monday-platform-genesis-01";
const latestHead = "1182588f1e8f361cd108cb303581f9641c6c2383";
const nextHead = "b3e9a50a0c0bc95161711e3a60fbcfcb305ea11d";

const receipts: StoredHeadReceipt[] = [
  {
    receipt_id: "receipt-replay-guard",
    branch: activeBranch,
    head_sha: latestHead,
    release_class: "external_embodiment",
  },
];

function candidate(overrides: Partial<CandidateHeadTransition> = {}): CandidateHeadTransition {
  return {
    branch: activeBranch,
    previous_head_sha: latestHead,
    head_sha: nextHead,
    release_class: "external_embodiment",
    changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
    executable_artifacts: ["compileHeadTransitionGuard"],
    status_surface_ids: [],
    ...overrides,
  };
}

test("accepts an executable embodiment that moves from the latest recorded head", () => {
  const verdict = compileHeadTransitionGuard({ active_branch: activeBranch, previous_receipts: receipts, candidate: candidate() });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_head_transition");
  assert.equal(verdict.release_class, "external_embodiment");
  assert.deepEqual(verdict.lineage, [`${latestHead} -> ${nextHead}`]);
  assert.deepEqual(verdict.failures, []);
});

test("blocks a transition compiled from a stale previous head", () => {
  const verdict = compileHeadTransitionGuard({
    active_branch: activeBranch,
    previous_receipts: receipts,
    candidate: candidate({ previous_head_sha: "stale-head" }),
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("does not match latest recorded head")));
});

test("blocks external embodiment when the head did not move", () => {
  const verdict = compileHeadTransitionGuard({
    active_branch: activeBranch,
    previous_receipts: receipts,
    candidate: candidate({ head_sha: latestHead }),
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("must move the PR head")));
});

test("blocks status readback that invents a branch move", () => {
  const verdict = compileHeadTransitionGuard({
    active_branch: activeBranch,
    previous_receipts: receipts,
    candidate: candidate({
      head_sha: nextHead,
      release_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      status_surface_ids: ["status-run-1"],
    }),
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("must bind to the already-current head")));
});

test("accepts fresh status readback only when it is bound to the current head and cites a status surface", () => {
  const verdict = compileHeadTransitionGuard({
    active_branch: activeBranch,
    previous_receipts: receipts,
    candidate: candidate({
      head_sha: latestHead,
      release_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      status_surface_ids: ["status-run-1"],
    }),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "fresh_status_readback");
});

test("binds exact blockers to the head they block", () => {
  const verdict = compileHeadTransitionGuard({
    active_branch: activeBranch,
    previous_receipts: receipts,
    candidate: candidate({
      head_sha: latestHead,
      release_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      blocker: "current-head status surface is unavailable",
    }),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "exact_external_blocker");
});
