import assert from "node:assert/strict";

import {
  compileFinalReviewAuthorityBundle,
  type FinalReviewAuthorityBundleInput,
  type FinalReviewAuthorityLease,
} from "./final-review-authority-bundle.js";

const branch = "monday-platform-genesis-01";
const head = "0ae8ffebb2606db44e2b5d0a0afda94bd48a568d";

function lease(
  kind: FinalReviewAuthorityLease["kind"],
  overrides: Partial<FinalReviewAuthorityLease> = {},
): FinalReviewAuthorityLease {
  return {
    lease_id: `${kind}-live-head`,
    kind,
    branch,
    head_sha: head,
    ok: true,
    evidence: [`${kind} evidence`],
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<FinalReviewAuthorityBundleInput> = {}): FinalReviewAuthorityBundleInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    bundle_id: "final-review-authority-proof-live-head-001",
    spent_bundle_ids: [],
    command: "merge_finalization",
    leases: [
      lease("status_lease", { warnings: ["Node.js 20 Actions deprecation notice"] }),
      lease("mergeability_lease"),
      lease("review_lease"),
      lease("blocker_retirement"),
    ],
    ...overrides,
  };
}

const admitted = compileFinalReviewAuthorityBundle(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "open_final_review_authority_bundle");
assert.deepEqual(admitted.warnings, ["Node.js 20 Actions deprecation notice"]);

const stale = compileFinalReviewAuthorityBundle(
  input({
    leases: [
      lease("status_lease", { head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
      lease("mergeability_lease"),
      lease("review_lease"),
      lease("blocker_retirement"),
    ],
  }),
);
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_head_mismatch");

const warningMaintenance = compileFinalReviewAuthorityBundle(input({ command: "warning_maintenance" }));
assert.equal(warningMaintenance.ok, false);
assert.equal(warningMaintenance.action, "block_non_progress_command");

const exactBlocker = compileFinalReviewAuthorityBundle(
  input({
    command: "exact_external_blocker",
    leases: [],
    exact_blocker: "final review authority cannot be assembled for the live PR head",
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "emit_exact_external_blocker");
