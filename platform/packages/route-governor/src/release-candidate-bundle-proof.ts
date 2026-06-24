import {
  compileReleaseCandidateBundle,
  type ReleaseCandidateBundleInput,
  type ReleaseCandidateLease,
} from "./release-candidate-bundle.js";

const liveHead = "release-candidate-live-head";

function lease(overrides: Partial<ReleaseCandidateLease> = {}): ReleaseCandidateLease {
  return {
    lease_id: "status-lease",
    kind: "status_surface",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    ok: true,
    action: "release_head_bound_status",
    evidence: ["Route Governor Proof succeeded", "Node.js 20 warning is non-blocking"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ReleaseCandidateBundleInput> = {}): ReleaseCandidateBundleInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    candidate_id: "release-candidate-bundle-01",
    spent_candidate_ids: [],
    requested_next_action: "merge_command",
    required_lease_kinds: [
      "status_surface",
      "mergeability_lease",
      "review_feedback_delta",
      "post_write_status_escrow",
      "finalization_surface_promotion",
    ],
    leases: [
      lease(),
      lease({
        lease_id: "mergeability-lease",
        kind: "mergeability_lease",
        action: "admit_mergeability_lease",
        evidence: ["mergeable true"],
        warnings: [],
      }),
      lease({
        lease_id: "review-feedback-delta",
        kind: "review_feedback_delta",
        action: "route_feedback_to_merge_gate",
        evidence: ["approved by reviewer"],
        warnings: [],
      }),
      lease({
        lease_id: "post-write-escrow",
        kind: "post_write_status_escrow",
        action: "release_head_bound_status",
        evidence: ["post-write status bound to moved head"],
        warnings: [],
      }),
      lease({
        lease_id: "finalization-surface-promotion",
        kind: "finalization_surface_promotion",
        action: "admit_finalization_surface_promotion",
        evidence: ["merge command surface promoted", "merge receipt surface promoted"],
        warnings: [],
      }),
    ],
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runReleaseCandidateBundleProof(): void {
  const admitted = compileReleaseCandidateBundle(baseInput());
  expectOk("release candidate bundle", admitted.ok, admitted.blockers);
  if (admitted.action !== "admit_release_candidate_bundle") {
    throw new Error(`unexpected bundle action: ${admitted.action}`);
  }
  if (admitted.admitted_lease_ids.length !== 5) {
    throw new Error("release candidate bundle did not admit all required leases");
  }
  if (!admitted.warnings.includes("Node.js 20 Actions deprecation notice")) {
    throw new Error("release candidate bundle dropped non-blocking warnings");
  }

  const stale = compileReleaseCandidateBundle(
    baseInput({ leases: [lease({ lease_id: "stale-status", head_sha: "old-head" })] }),
  );
  expectBlock("stale lease head", stale.ok, stale.blockers, "not live head");

  const failed = compileReleaseCandidateBundle(
    baseInput({
      leases: [
        lease({
          lease_id: "failed-status",
          ok: false,
          action: "block_failing_status_authority",
          blockers: ["Route Governor Proof failed"],
        }),
      ],
    }),
  );
  expectBlock("failed lease", failed.ok, failed.blockers, "Route Governor Proof failed");

  const missing = compileReleaseCandidateBundle(
    baseInput({
      required_lease_kinds: ["status_surface", "mergeability_lease"],
      leases: [lease()],
    }),
  );
  expectBlock("missing lease", missing.ok, missing.blockers, "mergeability_lease");

  const repeated = compileReleaseCandidateBundle(
    baseInput({ spent_candidate_ids: ["release-candidate-bundle-01"] }),
  );
  expectBlock("reused candidate", repeated.ok, repeated.blockers, "already spent");

  const nonProgress = compileReleaseCandidateBundle(
    baseInput({ requested_next_action: "metadata_reread" }),
  );
  expectBlock("non-progress action", nonProgress.ok, nonProgress.blockers, "metadata_reread");
}

runReleaseCandidateBundleProof();
