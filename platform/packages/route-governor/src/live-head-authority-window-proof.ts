import assert from "node:assert/strict";

import {
  openLiveHeadAuthorityWindow,
  type LiveHeadAuthorityCandidate,
  type LiveHeadAuthoritySurface,
  type LiveHeadAuthorityWindowInput,
} from "./live-head-authority-window.js";

const branch = "monday-platform-genesis-01";
const liveHead = "a6b8802308f806e3d3196655301cc9aaae53c785";
const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function surface(overrides: Partial<LiveHeadAuthoritySurface> = {}): LiveHeadAuthoritySurface {
  return {
    surface_id: "live-metadata-a6b8802",
    kind: "live_pr_metadata",
    branch,
    head_sha: liveHead,
    mergeable: true,
    evidence: [`live metadata reports ${liveHead}`],
    ...overrides,
  };
}

function candidate(overrides: Partial<LiveHeadAuthorityCandidate> = {}): LiveHeadAuthorityCandidate {
  return {
    requested_action: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/live-head-authority-window.ts"],
    behavior_artifacts: ["openLiveHeadAuthorityWindow"],
    routing_artifacts: ["live-head authority window"],
    proof_artifacts: ["platform/packages/route-governor/src/live-head-authority-window-proof.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<LiveHeadAuthorityWindowInput> = {}): LiveHeadAuthorityWindowInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    authority_window_id: "authority-window-a6b8802-001",
    spent_authority_window_ids: [],
    stale_head_shas: [staleHead, "3bf8e07dce32e59accf776357fb22278f57ba3f5"],
    surfaces: [
      surface(),
      surface({
        surface_id: "stale-pr-body-repaired-head",
        kind: "pr_body_summary",
        head_sha: staleHead,
        evidence: ["stale repaired-head summary retained as history"],
      }),
    ],
    candidate: candidate(),
    ...overrides,
  };
}

const embodiment = openLiveHeadAuthorityWindow(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_live_head_embodiment");
assert.deepEqual(embodiment.stale_surface_ids, ["stale-pr-body-repaired-head"]);

const staleBase = openLiveHeadAuthorityWindow(input({ candidate: candidate({ base_head_sha: staleHead }) }));
assert.equal(staleBase.ok, false);
assert.equal(staleBase.action, "block_stale_candidate_base");

const duplicateSummary = openLiveHeadAuthorityWindow(
  input({ candidate: candidate({ requested_action: "duplicate_ci_summary" }) }),
);
assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_non_progress_action");

const reviewWithoutStatus = openLiveHeadAuthorityWindow(
  input({ candidate: candidate({ requested_action: "review_request" }) }),
);
assert.equal(reviewWithoutStatus.ok, false);
assert.equal(reviewWithoutStatus.action, "block_missing_live_status");

const reviewWithLiveStatus = openLiveHeadAuthorityWindow(
  input({
    surfaces: [
      surface(),
      surface({
        surface_id: "checks-a6b8802",
        kind: "direct_status_surface",
        status: "passing_with_warnings",
        evidence: ["Route governor proof examples succeeded", "Node.js 20 Actions deprecation notice"],
      }),
    ],
    candidate: candidate({ requested_action: "review_request" }),
  }),
);
assert.equal(reviewWithLiveStatus.ok, true);
assert.equal(reviewWithLiveStatus.action, "admit_review_or_merge_authority");
assert.deepEqual(reviewWithLiveStatus.warnings, ["Node.js 20 Actions deprecation notice"]);

const mergeBlockedByMergeability = openLiveHeadAuthorityWindow(
  input({
    surfaces: [
      surface({ mergeable: false }),
      surface({
        surface_id: "checks-a6b8802",
        kind: "direct_status_surface",
        status: "passing",
        evidence: ["checks passed for live head"],
      }),
    ],
    candidate: candidate({ requested_action: "merge_command" }),
  }),
);
assert.equal(mergeBlockedByMergeability.ok, false);
assert.equal(mergeBlockedByMergeability.action, "block_unmergeable_live_head");

const exactBlocker = openLiveHeadAuthorityWindow(
  input({
    candidate: candidate({
      requested_action: "exact_external_blocker",
      exact_blocker: "direct live-head status is not surfaced yet for a6b8802308f806e3d3196655301cc9aaae53c785",
    }),
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "emit_exact_external_blocker");
