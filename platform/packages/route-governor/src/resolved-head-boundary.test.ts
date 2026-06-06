import test from "node:test";
import assert from "node:assert/strict";

import { evaluateResolvedHeadBoundary, type ResolvedHeadBoundaryInput } from "./resolved-head-boundary.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const repairedRuns = [
  "27049650678",
  "27049650677",
  "27049650682",
  "27049651469",
  "27049651460",
  "27049651459",
  "27049651467",
];

function repairedBoundary(overrides: Partial<ResolvedHeadBoundaryInput> = {}): ResolvedHeadBoundaryInput {
  return {
    resolved_head_sha: repairedHead,
    current_head_sha: repairedHead,
    required_successful_run_ids: repairedRuns,
    surfaced_runs: repairedRuns.map((id) => ({ id, head_sha: repairedHead, conclusion: "success" })),
    blocker_issue_state: "closed",
    pr_is_draft: false,
    proposed_move_class: "external_platform_embodiment",
    notices: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

test("blocks reopening ci-status-readback for the resolved repaired head", () => {
  const verdict = evaluateResolvedHeadBoundary(
    repairedBoundary({ proposed_move_class: "reopen_repaired_head_status_blocker" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_reopen");
  assert.equal(verdict.resolved_boundary_survives, true);
  assert.deepEqual(verdict.blockers, [
    "do not reopen ci-status-readback for the repaired head without a moved head or new current-head failure",
  ]);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("allows continued external embodiment after the repaired-head boundary survives", () => {
  const verdict = evaluateResolvedHeadBoundary(repairedBoundary());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "continue_external_embodiment");
  assert.equal(verdict.resolved_boundary_survives, true);
  assert.equal(verdict.blockers.length, 0);
  assert.ok(verdict.decisive_evidence.includes(`resolved head ${repairedHead}`));
});

test("requires a fresh readback when the PR head moves", () => {
  const verdict = evaluateResolvedHeadBoundary(
    repairedBoundary({
      current_head_sha: "next-head",
      surfaced_runs: [],
      proposed_move_class: "external_platform_embodiment",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "read_fresh_status");
  assert.deepEqual(verdict.blockers, ["moved head requires fresh status readback before a repaired-head claim"]);
});

test("routes a new current-head failure to repair instead of the old blocker", () => {
  const verdict = evaluateResolvedHeadBoundary(
    repairedBoundary({
      surfaced_runs: [
        ...repairedRuns.slice(0, -1).map((id) => ({ id, head_sha: repairedHead, conclusion: "success" as const })),
        { id: repairedRuns.at(-1) ?? "27049651467", head_sha: repairedHead, conclusion: "failure" },
      ],
      proposed_move_class: "reopen_repaired_head_status_blocker",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_new_current_head_failure");
  assert.deepEqual(verdict.blockers, ["repair the new current-head failure instead of reopening the old blocker"]);
});

test("emits an exact blocker only when the resolved boundary is genuinely incomplete", () => {
  const verdict = evaluateResolvedHeadBoundary(
    repairedBoundary({
      surfaced_runs: repairedRuns.slice(1).map((id) => ({ id, head_sha: repairedHead, conclusion: "success" })),
      proposed_move_class: "exact_external_blocker",
      explicit_blocker: "missing successful repaired-head run 27049650678",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["missing successful repaired-head run 27049650678"]);
});
