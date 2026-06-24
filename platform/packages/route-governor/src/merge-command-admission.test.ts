import assert from "node:assert/strict";
import { test } from "node:test";

import { admitMergeCommand, type MergeCommandAdmissionInput } from "./merge-command-admission.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";

const head = "49b306d41115c96012815b3b33c56572ceda149f";
const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function readiness(overrides: Partial<MergeReadinessVerdict> = {}): MergeReadinessVerdict {
  return {
    ok: true,
    action: "merge_ready",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: ["current-head status surface 27049651460", "approved by external-reviewer"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review or merge through the authorized GitHub boundary",
    ...overrides,
  };
}

function input(overrides: Partial<MergeCommandAdmissionInput> = {}): MergeCommandAdmissionInput {
  return {
    readiness: readiness(),
    live_head_sha: head,
    command_id: "merge-command-live-head-001",
    merge_method: "squash",
    external_boundary: "github_pull_request_merge",
    spent_command_ids: [],
    ...overrides,
  };
}

test("compiles a guarded GitHub merge command from live-head merge readiness", () => {
  const verdict = admitMergeCommand(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_command");
  assert.equal(verdict.command?.expected_head_sha, head);
  assert.equal(verdict.command?.merge_method, "squash");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks unready merge verdicts", () => {
  const verdict = admitMergeCommand(
    input({
      readiness: readiness({
        ok: false,
        action: "wait_for_checks",
        blockers: ["current-head checks are pending"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unready_merge_verdict");
  assert.deepEqual(verdict.blockers, [
    "current-head checks are pending",
    "merge readiness action is wait_for_checks, not merge_ready",
  ]);
});

test("blocks stale merge readiness heads", () => {
  const verdict = admitMergeCommand(input({ readiness: readiness({ head_sha: staleHead }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_merge_head");
  assert.deepEqual(verdict.blockers, [`merge readiness head ${staleHead} is not live head ${head}`]);
});

test("blocks repeated merge command ids", () => {
  const verdict = admitMergeCommand(input({ spent_command_ids: ["merge-command-live-head-001"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_merge_command");
  assert.deepEqual(verdict.blockers, ["merge command already spent: merge-command-live-head-001"]);
});

test("blocks missing merge method", () => {
  const verdict = admitMergeCommand(input({ merge_method: "" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_merge_method");
  assert.deepEqual(verdict.blockers, ["merge command has no merge method"]);
});

test("blocks non-GitHub merge release boundaries", () => {
  const verdict = admitMergeCommand(input({ external_boundary: "comment" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unsafe_merge_boundary");
  assert.deepEqual(verdict.blockers, ["merge command cannot be released through comment"]);
});
