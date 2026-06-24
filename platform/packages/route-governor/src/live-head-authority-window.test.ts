import assert from "node:assert/strict";
import { test } from "node:test";

import {
  openLiveHeadAuthorityWindow,
  type LiveHeadAuthorityCandidate,
  type LiveHeadAuthoritySurface,
  type LiveHeadAuthorityWindowInput,
} from "./live-head-authority-window.js";

const branch = "monday-platform-genesis-01";
const liveHead = "a6b8802308f806e3d3196655301cc9aaae53c785";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const prBodyHead = "3bf8e07dce32e59accf776357fb22278f57ba3f5";

function surface(overrides: Partial<LiveHeadAuthoritySurface> = {}): LiveHeadAuthoritySurface {
  return {
    surface_id: "live-metadata",
    kind: "live_pr_metadata",
    branch,
    head_sha: liveHead,
    mergeable: true,
    evidence: [`live metadata head ${liveHead}`],
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
    proof_artifacts: ["platform/packages/route-governor/src/live-head-authority-window.test.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<LiveHeadAuthorityWindowInput> = {}): LiveHeadAuthorityWindowInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    authority_window_id: "authority-window-a6b8802-test",
    spent_authority_window_ids: [],
    stale_head_shas: [repairedHead, prBodyHead],
    surfaces: [
      surface(),
      surface({
        surface_id: "repaired-head-summary",
        kind: "pr_body_summary",
        head_sha: repairedHead,
        evidence: ["resolved repaired-head status summary"],
      }),
      surface({
        surface_id: "older-current-head-summary",
        kind: "pr_body_summary",
        head_sha: prBodyHead,
        evidence: ["older PR body current-head summary"],
      }),
    ],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits behavior-bearing embodiment from live metadata while quarantining stale summaries", () => {
  const verdict = openLiveHeadAuthorityWindow(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_live_head_embodiment");
  assert.deepEqual(verdict.stale_surface_ids, ["repaired-head-summary", "older-current-head-summary"]);
  assert.match(verdict.next_route, /require status on the moved result head/);
});

test("blocks review authority until direct status is bound to the live head", () => {
  const verdict = openLiveHeadAuthorityWindow(input({ candidate: candidate({ requested_action: "review_request" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_live_status");
});

test("admits review authority only when status and mergeability are both live-head bound", () => {
  const verdict = openLiveHeadAuthorityWindow(
    input({
      surfaces: [
        surface(),
        surface({
          surface_id: "live-checks",
          kind: "direct_status_surface",
          status: "passing_with_warnings",
          evidence: ["Route governor proof examples succeeded", "Node.js 20 Actions deprecation notice"],
        }),
      ],
      candidate: candidate({ requested_action: "review_request" }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_or_merge_authority");
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("rejects non-progress summaries and stale candidate bases", () => {
  const duplicate = openLiveHeadAuthorityWindow(input({ candidate: candidate({ requested_action: "duplicate_ci_summary" }) }));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.action, "block_non_progress_action");

  const stale = openLiveHeadAuthorityWindow(input({ candidate: candidate({ base_head_sha: repairedHead }) }));
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_candidate_base");
});
