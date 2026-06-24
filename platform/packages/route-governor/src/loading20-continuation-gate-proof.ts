import assert from "node:assert/strict";

import { routeLoading20Continuation, type Loading20ContinuationInput } from "./loading20-continuation-gate.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "3e6a0dcc6fa65c4b40c8560ceed4a9752f10a9b3";

function base(overrides: Partial<Loading20ContinuationInput> = {}): Loading20ContinuationInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    move_class: "fresh_status_readback",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    new_current_head_checks: [],
    prohibited_blockers: ["repaired-head status readback blocker", "ci-status-readback blocker"],
    ...overrides,
  };
}

const movedHeadReadback = routeLoading20Continuation(
  base({
    status_surface: {
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Monday Platform CI / Route governor proof surface: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
  }),
);

assert.equal(movedHeadReadback.ok, true);
assert.equal(movedHeadReadback.action, "read_moved_head_status");
assert.deepEqual(movedHeadReadback.blockers, []);
assert.ok(movedHeadReadback.decisive_evidence.some((evidence) => evidence.includes(`PR head moved from ${repairedHead} to ${liveHead}`)));
assert.deepEqual(movedHeadReadback.warnings, ["Node.js 20 Actions deprecation notice"]);

const prohibitedOldBlocker = routeLoading20Continuation(
  base({
    move_class: "exact_external_blocker",
    exact_blocker: "repaired-head status readback blocker",
  }),
);

assert.equal(prohibitedOldBlocker.ok, false);
assert.equal(prohibitedOldBlocker.action, "block_release");
assert.ok(prohibitedOldBlocker.blockers[0].includes("prohibited blocker"));

const duplicateSummary = routeLoading20Continuation(base({ move_class: "duplicate_ci_summary" }));

assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_release");
assert.ok(duplicateSummary.blockers[0].includes("non-progress"));

const executableEmbodiment = routeLoading20Continuation(
  base({
    move_class: "external_platform_embodiment",
    changed_files: [
      "platform/packages/route-governor/src/loading20-continuation-gate.ts",
      "platform/packages/route-governor/src/loading20-continuation-gate-proof.ts",
    ],
    executable_artifacts: ["routeLoading20Continuation"],
    routing_artifacts: ["Loading20ContinuationVerdict.next_route"],
  }),
);

assert.equal(executableEmbodiment.ok, true);
assert.equal(executableEmbodiment.action, "commit_external_embodiment");
assert.ok(executableEmbodiment.decisive_evidence.includes("routeLoading20Continuation"));

const staleStatusSurface = routeLoading20Continuation(
  base({
    status_surface: {
      head_sha: repairedHead,
      verdict: "passing",
      decisive_successes: ["old success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: [],
    },
  }),
);

assert.equal(staleStatusSurface.ok, false);
assert.ok(staleStatusSurface.blockers[0].includes("not live PR head"));

const failingStatusBlocksEmbodiment = routeLoading20Continuation(
  base({
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/loading20-continuation-gate.ts"],
    executable_artifacts: ["routeLoading20Continuation"],
    routing_artifacts: ["Loading20ContinuationVerdict.next_route"],
    status_surface: {
      head_sha: liveHead,
      verdict: "failing",
      decisive_successes: [],
      blocking_failures: ["Route Governor Proof / Typecheck route governor: failure"],
      pending_surfaces: [],
      non_blocking_warnings: [],
    },
  }),
);

assert.equal(failingStatusBlocksEmbodiment.ok, false);
assert.equal(failingStatusBlocksEmbodiment.action, "block_release");
assert.ok(failingStatusBlocksEmbodiment.blockers.includes("Route Governor Proof / Typecheck route governor: failure"));

const exactLiveBlocker = routeLoading20Continuation(
  base({
    move_class: "exact_external_blocker",
    exact_blocker: "live PR head checks are pending for the moved head",
  }),
);

assert.equal(exactLiveBlocker.ok, true);
assert.equal(exactLiveBlocker.action, "emit_exact_external_blocker");
assert.deepEqual(exactLiveBlocker.blockers, ["live PR head checks are pending for the moved head"]);

console.log("loading20-continuation-gate proof passed");
