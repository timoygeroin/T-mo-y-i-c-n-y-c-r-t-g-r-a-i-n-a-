import assert from "node:assert/strict";
import test from "node:test";

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

function baseInput(overrides: Partial<FinalReviewAuthorityBundleInput> = {}): FinalReviewAuthorityBundleInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    bundle_id: "final-review-authority-live-head-001",
    spent_bundle_ids: [],
    command: "request_final_review",
    leases: [
      lease("status_lease", { warnings: ["Node.js 20 Actions deprecation notice"] }),
      lease("mergeability_lease"),
      lease("review_lease"),
      lease("blocker_retirement"),
    ],
    ...overrides,
  };
}

test("opens final review authority with all live-head leases", () => {
  const verdict = compileFinalReviewAuthorityBundle(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "open_final_review_authority_bundle");
  assert.deepEqual(verdict.admitted_lease_ids, [
    "status_lease-live-head",
    "mergeability_lease-live-head",
    "review_lease-live-head",
    "blocker_retirement-live-head",
  ]);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  assert.equal(verdict.blockers.length, 0);
});

test("blocks stale repaired-head leases", () => {
  const verdict = compileFinalReviewAuthorityBundle(
    baseInput({
      leases: [
        lease("status_lease", { head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
        lease("mergeability_lease"),
        lease("review_lease"),
        lease("blocker_retirement"),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks missing required authority leases", () => {
  const verdict = compileFinalReviewAuthorityBundle(
    baseInput({
      leases: [lease("status_lease"), lease("mergeability_lease"), lease("review_lease")],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_required_lease");
  assert.match(verdict.blockers.join("\n"), /blocker_retirement/);
});

test("blocks failed leases before final review authority opens", () => {
  const verdict = compileFinalReviewAuthorityBundle(
    baseInput({
      leases: [
        lease("status_lease"),
        lease("mergeability_lease", { ok: false, blockers: ["mergeability unknown for live head"] }),
        lease("review_lease"),
        lease("blocker_retirement"),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_failed_lease");
  assert.deepEqual(verdict.blockers, ["mergeability unknown for live head"]);
});

test("blocks non-progress commands including warning maintenance", () => {
  const verdict = compileFinalReviewAuthorityBundle(baseInput({ command: "warning_maintenance" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_command");
});

test("emits exact external blocker without requiring leases", () => {
  const verdict = compileFinalReviewAuthorityBundle(
    baseInput({
      command: "exact_external_blocker",
      leases: [],
      exact_blocker: "final review authority lease cannot be read from the live PR head",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["final review authority lease cannot be read from the live PR head"]);
});
