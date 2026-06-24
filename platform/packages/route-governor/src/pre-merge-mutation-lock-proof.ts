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
        candidate_id: "ordinary-final-wrapper",
        kind: "ordinary_embodiment",
        changed_files: ["platform/packages/route-governor/src/ordinary-final-wrapper.ts"],
        reason: "ordinary branch mutation after merge conditions are ready",
      },
    ],
    lock_id: `pre-merge-lock:${head}`,
    spent_lock_ids: [],
    ...overrides,
  };
}

const lock = compilePreMergeMutationLock(input());
assert.equal(lock.ok, true);
assert.equal(lock.action, "lock_branch_for_merge_handoff");
assert.equal(lock.mutation_policy, "block_new_branch_mutations");
assert.equal(lock.next_route, "preserve the reviewed live head and route to the guarded merge command instead of adding another embodiment commit");

const repair = compilePreMergeMutationLock(
  input({
    open_external_blockers: ["new live-head required-check failure"],
    candidate_mutations: [
      {
        candidate_id: "repair-live-required-check",
        kind: "critical_repair",
        changed_files: ["platform/packages/route-governor/src/required-check-repair.ts"],
        reason: "repair the concrete required-check failure before merge",
        blocker_signature: "required check failed on live head",
      },
    ],
  }),
);
assert.equal(repair.ok, true);
assert.equal(repair.action, "admit_critical_repair_before_merge");
assert.equal(repair.mutation_policy, "allow_only_critical_repair");

const status = compilePreMergeMutationLock(input({ status_verdict: "pending" }));
assert.equal(status.ok, false);
assert.equal(status.action, "route_to_status_readback");

console.log("pre-merge mutation lock proof passed");
