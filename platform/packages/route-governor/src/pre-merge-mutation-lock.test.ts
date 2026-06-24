import test from "node:test";
import assert from "node:assert/strict";

import {
  compilePreMergeMutationLock,
  type PreMergeMutationLockInput,
} from "./pre-merge-mutation-lock.js";

const branch = "monday-platform-genesis-01";
const head = "b6ecf153d9c3255a42d72fac0635c7e55294a6e4";

function input(overrides: Partial<PreMergeMutationLockInput> = {}): PreMergeMutationLockInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    live_head_sha: head,
    pr_is_draft: false,
    status_verdict: "passing_with_warnings",
    mergeability: "mergeable",
    required_approval_count: 1,
    approvals: ["reviewer-a"],
    change_requests: [],
    unresolved_review_threads: 0,
    open_external_blockers: [],
    candidate_mutations: [
      {
        candidate_id: "one-more-ordinary-embodiment",
        kind: "ordinary_embodiment",
        changed_files: ["platform/packages/route-governor/src/another-wrapper.ts"],
        reason: "would add more branch mutation after merge conditions are already ready",
      },
    ],
    lock_id: `pre-merge-lock:${head}`,
    spent_lock_ids: [],
    ...overrides,
  };
}

test("locks a ready live head for merge handoff instead of admitting another embodiment", () => {
  const verdict = compilePreMergeMutationLock(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "lock_branch_for_merge_handoff");
  assert.equal(verdict.mutation_policy, "block_new_branch_mutations");
  assert.equal(verdict.lock_id, `pre-merge-lock:${head}`);
  assert.equal(verdict.admitted_candidate_id, null);
  assert.ok(verdict.decisive_evidence.includes("blocked ordinary mutation one-more-ordinary-embodiment"));
});

test("routes pending or failing status back to live-head status before locking", () => {
  const verdict = compilePreMergeMutationLock(input({ status_verdict: "pending" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_status_readback");
  assert.equal(verdict.mutation_policy, "continue_pre_merge_repair");
  assert.deepEqual(verdict.blockers, ["live-head status is pending"]);
});

test("routes unresolved reviews before pre-merge mutation lock", () => {
  const verdict = compilePreMergeMutationLock(
    input({ approvals: [], change_requests: ["reviewer-b"], unresolved_review_threads: 2 }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_review_resolution");
  assert.ok(verdict.blockers.includes("approvals 0 below required 1"));
  assert.ok(verdict.blockers.includes("changes requested by reviewer-b"));
  assert.ok(verdict.blockers.includes("unresolved review threads 2"));
});

test("admits only a critical executable repair when an external blocker remains", () => {
  const verdict = compilePreMergeMutationLock(
    input({
      open_external_blockers: ["live head has a newly surfaced required-check failure"],
      candidate_mutations: [
        {
          candidate_id: "repair-required-check",
          kind: "critical_repair",
          changed_files: ["platform/packages/route-governor/src/required-check-repair.ts"],
          reason: "repair concrete live-head check failure",
          blocker_signature: "required check failed on live head",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_critical_repair_before_merge");
  assert.equal(verdict.mutation_policy, "allow_only_critical_repair");
  assert.equal(verdict.admitted_candidate_id, "repair-required-check");
  assert.deepEqual(verdict.blockers, ["live head has a newly surfaced required-check failure"]);
});

test("blocks replaying the same pre-merge lock id", () => {
  const lockId = `pre-merge-lock:${head}`;
  const verdict = compilePreMergeMutationLock(input({ lock_id: lockId, spent_lock_ids: [lockId] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_lock");
  assert.deepEqual(verdict.blockers, [`pre-merge mutation lock already spent: ${lockId}`]);
});

test("blocks merge handoff when the candidate is bound to a different branch", () => {
  const verdict = compilePreMergeMutationLock(input({ branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
  assert.ok(verdict.blockers[0].includes("does not match active branch"));
});
