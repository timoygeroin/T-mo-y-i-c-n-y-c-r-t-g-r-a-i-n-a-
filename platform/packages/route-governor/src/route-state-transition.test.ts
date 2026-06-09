import assert from "node:assert/strict";

import { advanceRouteContinuationState, type RouteStateTransitionInput } from "./route-state-transition.js";

const previousHead = "2428a37bd6186e5d20d6173be801d8af27fbf146";
const currentHead = "next-head";
const branch = "monday-platform-genesis-01";

function input(overrides: Partial<RouteStateTransitionInput> = {}): RouteStateTransitionInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    previous_head_sha: previousHead,
    current_head_sha: currentHead,
    move_class: "external_platform_embodiment",
    artifact_class: "route-state-transition",
    spent_artifact_classes: ["status-to-embodiment-handoff", "next-embodiment-selector"],
    spent_move_classes: ["fresh_status_readback"],
    committed_files: ["platform/packages/route-governor/src/route-state-transition.ts"],
    executable_artifacts: ["advanceRouteContinuationState"],
    routing_artifacts: ["new embodiment commits advance a required status cursor for the moved head"],
    proof_artifacts: ["dist/route-state-transition-proof.js"],
    status_claim: "none",
    ...overrides,
  };
}

const advanced = advanceRouteContinuationState(input());
assert.equal(advanced.ok, true);
assert.equal(advanced.action, "advance_after_embodiment");
assert.equal(advanced.next_state.required_status_head_sha, currentHead);
assert.equal(advanced.next_state.status_cursor, "required");
assert.equal(advanced.next_state.spent_artifact_classes.includes("route-state-transition"), true);
assert.match(advanced.next_route, /open status cursor/);

const boundStatus = advanceRouteContinuationState(input({ status_claim: "passing", status_readback_head_sha: currentHead }));
assert.equal(boundStatus.ok, true);
assert.equal(boundStatus.next_state.status_cursor, "satisfied");

const staleStatus = advanceRouteContinuationState(input({ status_claim: "passing_with_warnings", status_readback_head_sha: previousHead }));
assert.equal(staleStatus.ok, false);
assert.deepEqual(staleStatus.blockers, [
  `status claim passing_with_warnings belongs to ${previousHead}, not current head ${currentHead}`,
]);

const noHeadMove = advanceRouteContinuationState(input({ current_head_sha: previousHead }));
assert.equal(noHeadMove.ok, false);
assert.deepEqual(noHeadMove.blockers, [`route state did not move head from ${previousHead}`]);

const spentClass = advanceRouteContinuationState(input({ spent_artifact_classes: ["route-state-transition"] }));
assert.equal(spentClass.ok, false);
assert.deepEqual(spentClass.blockers, ["route state repeats spent artifact class: route-state-transition"]);

const blocker = advanceRouteContinuationState(
  input({
    move_class: "exact_external_blocker",
    exact_blocker: "GITHUB_CONTENTS_WRITE_FORBIDDEN",
    current_head_sha: previousHead,
  }),
);
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "hold_for_exact_blocker");
assert.equal(blocker.next_state.status_cursor, "blocked");
assert.deepEqual(blocker.blockers, ["GITHUB_CONTENTS_WRITE_FORBIDDEN"]);

console.log("route state transition proof passed");
