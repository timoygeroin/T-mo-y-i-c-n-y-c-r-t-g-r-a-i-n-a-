import { routePostReadbackContinuation, type PostReadbackContinuationInput } from "./post-readback-continuation-router.js";

const branch = "monday-platform-genesis-01";
const currentHead = "2c07846d3e9035005755dbb6a3db6b9f9f16abe4";

function input(overrides: Partial<PostReadbackContinuationInput> = {}): PostReadbackContinuationInput {
  return {
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    readback_head_sha: currentHead,
    status_verdict: "passing_with_warnings",
    move_class: "external_platform_embodiment",
    changed_files: [
      "platform/packages/route-governor/src/post-readback-continuation-router.ts",
      "platform/packages/route-governor/src/post-readback-continuation-router-proof.ts",
      "platform/packages/route-governor/package.json",
    ],
    executable_artifacts: ["routePostReadbackContinuation"],
    routing_artifacts: ["post-readback moves must become embodiment, exact blocker, or blocked duplicate"],
    current_head_blockers: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostReadbackContinuationRouterProof(): void {
  const embodiment = routePostReadbackContinuation(input());
  assert(embodiment.ok, `passing readback should allow executable embodiment: ${embodiment.blockers.join("; ")}`);
  assert(embodiment.action === "commit_external_embodiment", `expected commit_external_embodiment, got ${embodiment.action}`);
  assert(
    embodiment.warnings.includes("Node.js 20 Actions deprecation notice"),
    "non-blocking warnings must be carried without becoming blockers",
  );

  const staleReadback = routePostReadbackContinuation(input({ readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));
  assert(!staleReadback.ok, "stale readback must not authorize a post-readback move");
  assert(staleReadback.blockers.some((blocker) => blocker.includes("not current PR head")), "stale readback blocker should name the head mismatch");

  const duplicateReadback = routePostReadbackContinuation(
    input({ move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [] }),
  );
  assert(!duplicateReadback.ok, "same-head status reread must be blocked after readback");
  assert(duplicateReadback.action === "block_duplicate_or_incomplete", `expected duplicate block, got ${duplicateReadback.action}`);

  const failingWithoutBlocker = routePostReadbackContinuation(
    input({
      status_verdict: "failing",
      current_head_blockers: ["Route governor proof examples failed at Run proof examples"],
    }),
  );
  assert(!failingWithoutBlocker.ok, "failing current-head status must block embodiment without an exact blocker release");

  const failingWithBlocker = routePostReadbackContinuation(
    input({
      status_verdict: "failing",
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      current_head_blockers: ["Route governor proof examples failed at Run proof examples"],
      exact_blocker: "current-head proof examples log is required before repair can be targeted",
    }),
  );
  assert(failingWithBlocker.ok, `exact current-head blocker should be releasable: ${failingWithBlocker.blockers.join("; ")}`);
  assert(failingWithBlocker.action === "emit_exact_external_blocker", `expected emit_exact_external_blocker, got ${failingWithBlocker.action}`);

  const incompleteEmbodiment = routePostReadbackContinuation(
    input({ changed_files: ["platform/docs/note.md"], executable_artifacts: [], routing_artifacts: [] }),
  );
  assert(!incompleteEmbodiment.ok, "documentation-only continuation must not pass as embodiment");
}

runPostReadbackContinuationRouterProof();
