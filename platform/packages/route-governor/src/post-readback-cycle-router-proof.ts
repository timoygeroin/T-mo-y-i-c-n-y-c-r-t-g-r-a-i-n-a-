import {
  routePostReadbackCycle,
  type PostReadbackCycleInput,
} from "./post-readback-cycle-router.js";

const branch = "monday-platform-genesis-01";
const currentHead = "b505fab0ae543897f6dec954d4aa9c92f948aaa3";
const previousHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PostReadbackCycleInput> = {}): PostReadbackCycleInput {
  return {
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    last_readback_head_sha: currentHead,
    status_verdict: "passing_with_warnings",
    spent_move_classes: ["metadata_reread", "duplicate_comment", "duplicate_status_readback"],
    candidate: {
      candidate_id: "post-readback-cycle-router",
      move_class: "post_readback_cycle_router",
      changed_files: ["platform/packages/route-governor/src/post-readback-cycle-router.ts"],
      executable_artifacts: ["routePostReadbackCycle"],
      routing_artifacts: ["post-readback cycle forces moved-head readback, failure repair, or next embodiment"],
    },
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostReadbackCycleRouterProof(): void {
  const movedHead = routePostReadbackCycle(
    input({
      current_head_sha: currentHead,
      last_readback_head_sha: previousHead,
      status_verdict: "passing_with_warnings",
    }),
  );
  assert(movedHead.ok, `moved-head readback route should be allowed: ${movedHead.blockers.join("; ")}`);
  assert(movedHead.action === "read_current_head_status", `expected read_current_head_status, got ${movedHead.action}`);

  const actionableFailure = routePostReadbackCycle(
    input({
      status_verdict: "failing",
      candidate: undefined,
      failure_intake_action: "repair_from_actionable_failure",
    }),
  );
  assert(actionableFailure.ok, `actionable failure should route to repair: ${actionableFailure.blockers.join("; ")}`);
  assert(
    actionableFailure.action === "repair_current_head_failure",
    `expected repair_current_head_failure, got ${actionableFailure.action}`,
  );

  const publicOnlyFailure = routePostReadbackCycle(
    input({
      status_verdict: "failing",
      candidate: undefined,
      failure_intake_action: "obtain_stronger_actions_log",
      failure_intake_blockers: ["current-head failure surface has no actionable log excerpt or assertion"],
    }),
  );
  assert(!publicOnlyFailure.ok, "non-actionable failure surface must not select repair");
  assert(
    publicOnlyFailure.action === "obtain_current_head_failure_log",
    `expected obtain_current_head_failure_log, got ${publicOnlyFailure.action}`,
  );

  const repeatedCandidate = routePostReadbackCycle(
    input({
      spent_move_classes: ["post_readback_cycle_router"],
    }),
  );
  assert(!repeatedCandidate.ok, "spent embodiment class must not pass");
  assert(
    repeatedCandidate.action === "block_repeated_move_class",
    `expected block_repeated_move_class, got ${repeatedCandidate.action}`,
  );

  const nextEmbodiment = routePostReadbackCycle(input());
  assert(nextEmbodiment.ok, `new executable embodiment should pass: ${nextEmbodiment.blockers.join("; ")}`);
  assert(nextEmbodiment.action === "commit_next_embodiment", `expected commit_next_embodiment, got ${nextEmbodiment.action}`);
}

runPostReadbackCycleRouterProof();
