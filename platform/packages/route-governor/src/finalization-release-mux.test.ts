import assert from "node:assert/strict";
import { test } from "node:test";

import { routeFinalizationReleaseMux, type FinalizationReleaseMuxInput } from "./finalization-release-mux.js";

const branch = "monday-platform-genesis-01";
const liveHead = "115d0241e1efd3c72e2b0a716f4e840a182c5339";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<FinalizationReleaseMuxInput> = {}): FinalizationReleaseMuxInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    resolved_historical_heads: [repairedHead],
    prohibited_release_classes: [
      "pr_metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_resolved_blocker",
    ],
    spent_release_ids: [],
    candidate: {
      release_id: "finalization-release-mux-embodiment",
      release_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      resulting_head_sha: "post-write-head",
      side_effects: ["branch_commit"],
      changed_files: [
        "platform/packages/route-governor/src/finalization-release-mux.ts",
        "platform/packages/route-governor/src/finalization-release-mux.test.ts",
      ],
      executable_artifacts: ["routeFinalizationReleaseMux"],
      routing_artifacts: ["single terminal release operation per live head"],
      proof_artifacts: ["dist/finalization-release-mux.test.js"],
    },
    ...overrides,
  };
}

test("admits one behavior-bearing external embodiment release", () => {
  const verdict = routeFinalizationReleaseMux(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "release_external_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.quarantined_head_shas.includes(repairedHead));
  assert.match(verdict.next_route, /bind the next status readback/);
});

test("blocks non-progress classes even when they carry plausible evidence", () => {
  const verdict = routeFinalizationReleaseMux(
    input({
      candidate: {
        ...input().candidate,
        release_id: "metadata-reread-repeat",
        release_class: "pr_metadata_reread",
        side_effects: [],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_release");
  assert.deepEqual(verdict.blockers, ["release class is not terminal progress: pr_metadata_reread"]);
});

test("blocks bundled side effects on an embodiment release", () => {
  const verdict = routeFinalizationReleaseMux(
    input({
      candidate: {
        ...input().candidate,
        side_effects: ["branch_commit", "pr_comment", "memory_update"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_bundled_release");
  assert.deepEqual(verdict.blockers, [
    "side effect cannot ride this release class: pr_comment",
    "side effect cannot ride this release class: memory_update",
  ]);
});

test("blocks stale repaired-head status as fresh status authority", () => {
  const verdict = routeFinalizationReleaseMux(
    input({
      candidate: {
        ...input().candidate,
        release_id: "stale-status-readback",
        release_class: "fresh_status_readback",
        side_effects: ["status_claim"],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_authority");
  assert.deepEqual(verdict.blockers, [`status head ${repairedHead} is not live head ${liveHead}`]);
});

test("blocks proof-only embodiment candidates", () => {
  const verdict = routeFinalizationReleaseMux(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/route-governor/src/finalization-release-mux.test.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("release embodiment has no behavior-bearing platform file"));
});

test("admits one exact external blocker without comment or label side effects", () => {
  const verdict = routeFinalizationReleaseMux(
    input({
      candidate: {
        release_id: "no-write-surface-blocker",
        release_class: "exact_external_blocker",
        branch,
        base_head_sha: liveHead,
        side_effects: [],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "no writable external branch surface is available",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "release_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["no writable external branch surface is available"]);
});
