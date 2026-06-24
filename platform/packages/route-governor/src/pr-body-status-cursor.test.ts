import assert from "node:assert/strict";

import {
  compilePrBodyStatusCursor,
  type PrBodyStatusCursorInput,
} from "./pr-body-status-cursor.js";

const branch = "monday-platform-genesis-01";
const liveHead = "ad36276a50d4ba3406bf9b2749a9a82c14ea3d60";
const staleBodyHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";
const resolvedRepairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PrBodyStatusCursorInput> = {}): PrBodyStatusCursorInput {
  return {
    active_branch: branch,
    live_pr_branch: branch,
    live_pr_head_sha: liveHead,
    pr_body_status_head_sha: staleBodyHead,
    prompt_status_head_sha: resolvedRepairedHead,
    resolved_historical_head_shas: [resolvedRepairedHead],
    direct_status_surfaces: [],
    candidate: {
      candidate_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/pr-body-status-cursor.ts"],
      executable_artifacts: ["compilePrBodyStatusCursor"],
      routing_artifacts: ["stale PR-body and prompt status heads cannot authorize live-head repair or readback"],
    },
    ...overrides,
  };
}

const embodiment = compilePrBodyStatusCursor(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_live_head_embodiment");
assert.deepEqual(embodiment.quarantined_summary_heads, [staleBodyHead]);
assert.deepEqual(embodiment.historical_status_heads, [resolvedRepairedHead]);
assert.ok(embodiment.decisive_evidence.includes("compilePrBodyStatusCursor"));

const staleCandidate = compilePrBodyStatusCursor(
  input({
    candidate: {
      ...input().candidate,
      base_head_sha: resolvedRepairedHead,
    },
  }),
);
assert.equal(staleCandidate.ok, false);
assert.equal(staleCandidate.action, "block_stale_candidate_base");
assert.ok(staleCandidate.blockers.some((blocker) => blocker.includes(resolvedRepairedHead)));

const readbackWithoutSurface = compilePrBodyStatusCursor(
  input({
    candidate: {
      ...input().candidate,
      candidate_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    },
  }),
);
assert.equal(readbackWithoutSurface.ok, false);
assert.equal(readbackWithoutSurface.action, "require_live_head_status_readback");
assert.ok(readbackWithoutSurface.blockers.some((blocker) => blocker.includes(liveHead)));

const liveFailure = compilePrBodyStatusCursor(
  input({
    direct_status_surfaces: [
      {
        surface_id: "actions-current-head",
        head_sha: liveHead,
        verdict: "failing",
        decisive_items: ["Run proof examples exited 1"],
        warnings: ["Node.js 20 deprecation notice"],
      },
      {
        surface_id: "stale-actions",
        head_sha: resolvedRepairedHead,
        verdict: "passing",
        decisive_items: ["old repaired-head checks passed"],
        warnings: [],
      },
    ],
  }),
);
assert.equal(liveFailure.ok, false);
assert.equal(liveFailure.action, "route_live_head_failure_repair");
assert.deepEqual(liveFailure.accepted_status_surface_ids, ["actions-current-head"]);
assert.deepEqual(liveFailure.stale_status_surface_ids, ["stale-actions"]);
assert.deepEqual(liveFailure.blockers, ["Run proof examples exited 1"]);
assert.deepEqual(liveFailure.warnings, ["Node.js 20 deprecation notice"]);

const passingReadback = compilePrBodyStatusCursor(
  input({
    direct_status_surfaces: [
      {
        surface_id: "actions-current-head-passing",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        decisive_items: ["7 current-head checks succeeded"],
        warnings: ["Node.js 20 deprecation notice"],
      },
    ],
    candidate: {
      ...input().candidate,
      candidate_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    },
  }),
);
assert.equal(passingReadback.ok, true);
assert.equal(passingReadback.action, "require_live_head_status_readback");
assert.deepEqual(passingReadback.accepted_status_surface_ids, ["actions-current-head-passing"]);
assert.deepEqual(passingReadback.blockers, []);

console.log("pr body status cursor tests passed");
