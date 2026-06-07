import { classifyProgressBoundary, type ProgressBoundaryInput } from "./progress-boundary.js";

const branch = "monday-platform-genesis-01";
const currentHead = "b855e547c76b5107c2fa0010961b07844feaf1ef";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ProgressBoundaryInput> = {}): ProgressBoundaryInput {
  return {
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    last_readback_head_sha: repairedHead,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/progress-boundary.ts"],
    executable_artifacts: ["classifyProgressBoundary"],
    routing_artifacts: ["non-progress classes are blocked before release"],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runProgressBoundaryProof(): void {
  const embodiment = classifyProgressBoundary(input());
  assert(embodiment.ok, `embodiment should pass: ${embodiment.blockers.join("; ")}`);
  assert(
    embodiment.action === "commit_external_embodiment",
    `expected commit_external_embodiment, got ${embodiment.action}`,
  );

  for (const move_class of [
    "metadata_reread",
    "duplicate_ci_summary",
    "duplicate_comment",
    "duplicate_label",
    "local_memory_guard",
    "guessed_future_ci",
    "reclose_completed_blocker",
    "duplicate_status_readback",
  ] as const) {
    const verdict = classifyProgressBoundary(input({ move_class, changed_files: [], executable_artifacts: [], routing_artifacts: [] }));
    assert(!verdict.ok, `${move_class} must not count as progress`);
    assert(verdict.action === "block_non_progress", `expected block_non_progress for ${move_class}, got ${verdict.action}`);
  }

  const movedHeadReadback = classifyProgressBoundary(
    input({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );
  assert(movedHeadReadback.ok, `moved-head readback should pass: ${movedHeadReadback.blockers.join("; ")}`);
  assert(
    movedHeadReadback.action === "read_current_head_status",
    `expected read_current_head_status, got ${movedHeadReadback.action}`,
  );

  const staleReadback = classifyProgressBoundary(
    input({
      move_class: "fresh_status_readback",
      current_head_sha: currentHead,
      last_readback_head_sha: currentHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [{ id: "old-check", head_sha: repairedHead }],
    }),
  );
  assert(!staleReadback.ok, "stale check evidence must not authorize fresh status readback");
  assert(staleReadback.action === "block_incomplete_progress", `expected block_incomplete_progress, got ${staleReadback.action}`);

  const newCurrentCheckReadback = classifyProgressBoundary(
    input({
      move_class: "fresh_status_readback",
      current_head_sha: currentHead,
      last_readback_head_sha: currentHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [{ id: "current-check", head_sha: currentHead }],
    }),
  );
  assert(newCurrentCheckReadback.ok, `current-head check readback should pass: ${newCurrentCheckReadback.blockers.join("; ")}`);

  const blocker = classifyProgressBoundary(
    input({
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      exact_blocker: "no writable external branch surface is available",
    }),
  );
  assert(blocker.ok, `exact blocker should pass: ${blocker.blockers.join("; ")}`);
  assert(blocker.action === "emit_exact_external_blocker", `expected emit_exact_external_blocker, got ${blocker.action}`);
}

runProgressBoundaryProof();
