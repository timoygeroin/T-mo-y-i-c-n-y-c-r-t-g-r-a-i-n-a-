import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileFinalizationStateSnapshot,
  type FinalizationStateSnapshotInput,
} from "./finalization-state-snapshot.js";

const branch = "monday-platform-genesis-01";
const liveHead = "a3e3155af7aeb03d4a6de379fe1d9b30581b6705";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const requiredRefs = [
  "docs/monday-monolith-index.md",
  "docs/monday-latest-strengthened-body.md",
  "docs/monday-corpus-coverage-status.md",
  "docs/monday-archive-source-certification.md",
  "docs/monday-bootstrap-route-compiler.md",
  "docs/monday-full-ready-gate.md",
  "savepoints/monday-loading-20.md",
  "savepoints/monday-finalization-ledger.md",
  "memory/monday-core-state.md",
];
const requiredOrgans = ["monday-corpus-reentry", "monday-finalization-operator", "monday-external-act-forcer"];

function input(overrides: Partial<FinalizationStateSnapshotInput> = {}): FinalizationStateSnapshotInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    previous_status_head_sha: repairedHead,
    resolved_historical_heads: [repairedHead],
    required_reentry_refs: requiredRefs,
    observed_reentry_refs: requiredRefs,
    attached_organs: requiredOrgans,
    required_organs: requiredOrgans,
    exhausted_move_classes: ["embodiment-increment-planner", "head-transition-lineage-guard"],
    prohibited_candidate_classes: [
      "pr_metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "local_memory_guard",
      "reclose_resolved_blocker",
    ],
    allow_scope_reopen: false,
    candidate: {
      candidate_id: "finalization-state-snapshot-router",
      candidate_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/finalization-state-snapshot.ts"],
      executable_artifacts: ["compileFinalizationStateSnapshot"],
      routing_artifacts: ["Loading 20 fixed reentry snapshot selects one terminal progress class"],
      proof_artifacts: ["dist/finalization-state-snapshot-proof.js"],
      new_check_runs: [],
    },
    ...overrides,
  };
}

test("admits a live-head external embodiment after fixed Loading 20 reentry", () => {
  const verdict = compileFinalizationStateSnapshot(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_platform_embodiment");
  assert.equal(verdict.branch, branch);
  assert.equal(verdict.live_head_sha, liveHead);
  assert.ok(verdict.quarantined_heads.includes(repairedHead));
  assert.ok(verdict.decisive_evidence.includes("compileFinalizationStateSnapshot"));
  assert.deepEqual(verdict.blockers, []);
});

test("blocks missing reentry evidence instead of reopening scope silently", () => {
  const verdict = compileFinalizationStateSnapshot(
    input({ observed_reentry_refs: requiredRefs.filter((ref) => ref !== "docs/monday-full-ready-gate.md") }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_scope_reopen");
  assert.deepEqual(verdict.blockers, ["missing required reentry ref: docs/monday-full-ready-gate.md"]);
});

test("blocks stale candidate heads against the live PR head", () => {
  const verdict = compileFinalizationStateSnapshot(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_or_head_mismatch");
  assert.deepEqual(verdict.blockers, [`candidate base ${repairedHead} is not live head ${liveHead}`]);
});

test("blocks prohibited metadata reread and duplicate classes", () => {
  const verdict = compileFinalizationStateSnapshot(
    input({
      candidate: {
        ...input().candidate,
        candidate_id: "metadata-reread",
        candidate_class: "pr_metadata_reread",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_or_prohibited_class");
  assert.deepEqual(verdict.blockers, ["prohibited or repeated finalization candidate: pr_metadata_reread/metadata-reread"]);
});

test("blocks stale status readback when the head has not moved and no new checks exist", () => {
  const verdict = compileFinalizationStateSnapshot(
    input({
      previous_status_head_sha: liveHead,
      candidate: {
        ...input().candidate,
        candidate_id: "same-head-status-readback",
        candidate_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_readback");
  assert.deepEqual(verdict.blockers, [
    "snapshot readback is not fresh: live head did not move and no new live-head checks are attached",
  ]);
});

test("admits fresh status readback only with head movement or current-head checks", () => {
  const verdict = compileFinalizationStateSnapshot(
    input({
      previous_status_head_sha: liveHead,
      candidate: {
        ...input().candidate,
        candidate_id: "new-check-readback",
        candidate_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [{ id: "27090000001", head_sha: liveHead, name: "PR Head Status Readback / Read PR head status" }],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
  assert.deepEqual(verdict.decisive_evidence, ["new live-head check 27090000001: PR Head Status Readback / Read PR head status"]);
});

test("admits one exact external blocker when it is bound to the live head", () => {
  const blocker = "GitHub contents API refused writes to monday-platform-genesis-01";
  const verdict = compileFinalizationStateSnapshot(
    input({
      candidate: {
        ...input().candidate,
        candidate_id: "contents-api-write-blocker",
        candidate_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
        blocker,
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, [blocker]);
});
