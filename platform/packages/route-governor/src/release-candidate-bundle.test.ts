import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileReleaseCandidateBundle, type ReleaseCandidateBundleInput } from "./release-candidate-bundle.js";

const liveHead = "8363a279e7478e0fe76d00bc1bd811ce61cc34a6";
const branch = "monday-platform-genesis-01";

function lease(
  kind: ReleaseCandidateBundleInput["required_lease_kinds"][number],
  overrides: Partial<ReleaseCandidateBundleInput["leases"][number]> = {},
): ReleaseCandidateBundleInput["leases"][number] {
  return {
    lease_id: `${kind}-lease`,
    kind,
    branch,
    head_sha: liveHead,
    ok: true,
    action: `admit_${kind}`,
    evidence: [`${kind} bound to live head`],
    blockers: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ReleaseCandidateBundleInput> = {}): ReleaseCandidateBundleInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    candidate_id: "release-candidate-live-head-001",
    spent_candidate_ids: [],
    requested_next_action: "merge_command",
    required_lease_kinds: ["status_surface", "mergeability_lease", "review_feedback_delta"],
    leases: [lease("status_surface"), lease("mergeability_lease"), lease("review_feedback_delta")],
    ...overrides,
  };
}

describe("compileReleaseCandidateBundle", () => {
  it("admits a release candidate only when every required lease is live-head bound", () => {
    const verdict = compileReleaseCandidateBundle(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_release_candidate_bundle");
    assert.deepEqual(verdict.admitted_lease_ids, [
      "status_surface-lease",
      "mergeability_lease-lease",
      "review_feedback_delta-lease",
    ]);
    assert.ok(verdict.decisive_evidence.includes(`live head ${liveHead}`));
  });

  it("blocks reused candidate ids before leases can be consumed again", () => {
    const verdict = compileReleaseCandidateBundle(
      baseInput({ spent_candidate_ids: ["release-candidate-live-head-001"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_reused_candidate");
    assert.match(verdict.blockers.join("; "), /already spent/);
  });

  it("blocks stale lease heads even when the candidate id is fresh", () => {
    const verdict = compileReleaseCandidateBundle(
      baseInput({
        leases: [
          lease("status_surface"),
          lease("mergeability_lease", { head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
          lease("review_feedback_delta"),
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_lease_head");
    assert.match(verdict.next_route, /same live head/);
  });

  it("blocks missing required leases before review or merge handoff", () => {
    const verdict = compileReleaseCandidateBundle(
      baseInput({
        leases: [lease("status_surface"), lease("review_feedback_delta")],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_required_lease");
    assert.match(verdict.blockers.join("; "), /mergeability_lease/);
  });

  it("blocks failed leases instead of bundling partial readiness", () => {
    const verdict = compileReleaseCandidateBundle(
      baseInput({
        leases: [
          lease("status_surface"),
          lease("mergeability_lease", { ok: false, blockers: ["mergeability lease expired"] }),
          lease("review_feedback_delta"),
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_failed_lease");
    assert.deepEqual(verdict.blockers, ["mergeability lease expired"]);
  });

  it("blocks non-progress actions from consuming release-candidate authority", () => {
    const verdict = compileReleaseCandidateBundle(
      baseInput({ requested_next_action: "duplicate_status_summary" }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
    assert.match(verdict.next_route, /choose merge command/);
  });
});
