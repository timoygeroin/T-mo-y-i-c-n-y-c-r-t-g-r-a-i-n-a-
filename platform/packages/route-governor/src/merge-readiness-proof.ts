import { compileMergeReadiness, type MergeReadinessInput } from "./merge-readiness.js";

const branch = "monday-platform-genesis-01";
const head = "d4e377a9ff8f5e43df1f5aeba20a32fff90efbdb";

function input(overrides: Partial<MergeReadinessInput> = {}): MergeReadinessInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    active_branch: branch,
    head_sha: head,
    draft: false,
    mergeable: true,
    status_surface: {
      verdict: "passing_with_warnings",
      ok: true,
      decisive_successes: ["Route Governor Proof / proof examples: success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    evidence: {
      executable_artifacts: ["compileMergeReadiness"],
      routing_artifacts: ["merge readiness compiler"],
      status_surface_ids: ["27049651467"],
    },
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runMergeReadinessProof(): void {
  const ready = compileMergeReadiness(input());
  assert(ready.ok, "passing status, mergeability, and evidence should compile as merge-ready");
  assert(ready.action === "merge_ready", `expected merge_ready, got ${ready.action}`);
  assert(ready.warnings.length === 1, "Node.js 20 deprecation notice should remain a warning");

  const missingStatus = compileMergeReadiness(input({ status_surface: undefined }));
  assert(missingStatus.ok, "missing status should route to readback, not block outright");
  assert(
    missingStatus.action === "read_current_head_status",
    `expected read_current_head_status, got ${missingStatus.action}`,
  );

  const pending = compileMergeReadiness(
    input({
      status_surface: {
        verdict: "pending",
        ok: false,
        decisive_successes: [],
        blocking_failures: [],
        pending_surfaces: ["Monday Platform CI / Route governor proof surface"],
        non_blocking_warnings: [],
      },
    }),
  );
  assert(!pending.ok, "pending checks must not compile as merge-ready");
  assert(pending.action === "wait_for_checks", `expected wait_for_checks, got ${pending.action}`);

  const missingEvidence = compileMergeReadiness(
    input({
      evidence: {
        executable_artifacts: [],
        routing_artifacts: [],
        status_surface_ids: ["27049651467"],
      },
    }),
  );
  assert(!missingEvidence.ok, "missing embodiment evidence must block merge readiness");
  assert(
    missingEvidence.action === "continue_external_embodiment",
    `expected continue_external_embodiment, got ${missingEvidence.action}`,
  );

  const unmergeable = compileMergeReadiness(input({ mergeable: false }));
  assert(!unmergeable.ok, "unmergeable PR must not compile as merge-ready");
  assert(unmergeable.action === "block_release", `expected block_release, got ${unmergeable.action}`);
}

runMergeReadinessProof();
