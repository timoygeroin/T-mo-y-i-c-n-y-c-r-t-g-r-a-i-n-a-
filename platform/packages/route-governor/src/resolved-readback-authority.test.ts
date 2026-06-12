import test from "node:test";
import assert from "node:assert/strict";

import {
  compileResolvedReadbackAuthority,
  type ResolvedReadbackAuthorityInput,
  type ResolvedReadbackCheckReceipt,
} from "./resolved-readback-authority.js";

const RESOLVED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function checks(overrides: Partial<ResolvedReadbackCheckReceipt>[] = []): ResolvedReadbackCheckReceipt[] {
  const base: ResolvedReadbackCheckReceipt[] = [
    { run_id: "27049650678", workflow_name: "Monday Platform CI", event: "push", head_sha: RESOLVED_HEAD, conclusion: "success" },
    { run_id: "27049650677", workflow_name: "Route Governor Proof", event: "push", head_sha: RESOLVED_HEAD, conclusion: "success" },
    {
      run_id: "27049650682",
      workflow_name: "Monday Platform Route Governor",
      event: "push",
      head_sha: RESOLVED_HEAD,
      conclusion: "success",
    },
    {
      run_id: "27049651469",
      workflow_name: "Monday Platform Route Governor",
      event: "pull_request",
      head_sha: RESOLVED_HEAD,
      conclusion: "success",
    },
    { run_id: "27049651460", workflow_name: "Monday Platform CI", event: "pull_request", head_sha: RESOLVED_HEAD, conclusion: "success" },
    { run_id: "27049651459", workflow_name: "Route Governor Proof", event: "pull_request", head_sha: RESOLVED_HEAD, conclusion: "success" },
    {
      run_id: "27049651467",
      workflow_name: "PR Head Status Readback",
      event: "pull_request",
      head_sha: RESOLVED_HEAD,
      conclusion: "success",
    },
  ];

  return base.map((check, index) => ({ ...check, ...(overrides[index] ?? {}) }));
}

function input(overrides: Partial<ResolvedReadbackAuthorityInput> = {}): ResolvedReadbackAuthorityInput {
  return {
    active_branch: "monday-platform-genesis-01",
    branch: "monday-platform-genesis-01",
    resolved_head_sha: RESOLVED_HEAD,
    live_head_sha: RESOLVED_HEAD,
    issue_completed: true,
    blocker_label_removed: true,
    pr_ready_for_review: true,
    checks: checks(),
    warnings: ["Node.js 20 Actions deprecation notice"],
    candidate: {
      move_class: "external_platform_embodiment",
      artifact_class: "resolved-readback-authority",
      changed_files: ["platform/packages/route-governor/src/resolved-readback-authority.ts"],
      executable_artifacts: ["compileResolvedReadbackAuthority"],
      routing_artifacts: ["resolved repaired-head boundary cannot emit old blocker"],
      proof_artifacts: ["platform/packages/route-governor/src/resolved-readback-authority.test.ts"],
      spent_artifact_classes: ["post-status-embodiment-queue"],
    },
    ...overrides,
  };
}

test("admits post-resolution embodiment after all repaired-head boundary conditions are resolved", () => {
  const verdict = compileResolvedReadbackAuthority(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_post_resolution_embodiment");
  assert.equal(verdict.accepted_check_run_ids.length, 7);
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.quarantined_move_classes.includes("old_repaired_head_status_blocker"));
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("blocks the old repaired-head status blocker after the readback boundary is resolved", () => {
  const verdict = compileResolvedReadbackAuthority(
    input({
      candidate: {
        move_class: "old_repaired_head_status_blocker",
        artifact_class: "old-blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        spent_artifact_classes: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_old_repaired_head_blocker");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("repaired-head status-readback blocker is resolved")));
});

test("blocks duplicate summaries and metadata-style non-progress after resolution", () => {
  const verdict = compileResolvedReadbackAuthority(
    input({
      candidate: {
        move_class: "duplicate_ci_summary",
        artifact_class: "summary",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        spent_artifact_classes: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_replay");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("post-resolution move repeats non-progress class")));
});

test("requires the resolved boundary before advancing beyond status readback", () => {
  const verdict = compileResolvedReadbackAuthority(input({ blocker_label_removed: false, checks: checks([{ conclusion: "failure" }]) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unresolved_boundary");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("blocked: ci-status-readback label is still present")));
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("expected at least 7")));
});

test("requires behavior-bearing executable embodiment after resolution", () => {
  const verdict = compileResolvedReadbackAuthority(
    input({
      candidate: {
        move_class: "external_platform_embodiment",
        artifact_class: "proof-only",
        changed_files: ["platform/packages/route-governor/src/resolved-readback-authority.test.ts"],
        executable_artifacts: ["compileResolvedReadbackAuthority"],
        routing_artifacts: ["resolved readback authority"],
        proof_artifacts: ["platform/packages/route-governor/src/resolved-readback-authority.test.ts"],
        spent_artifact_classes: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("proof-only")));
});
