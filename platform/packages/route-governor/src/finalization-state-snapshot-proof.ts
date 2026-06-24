import assert from "node:assert/strict";

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

const admitted = compileFinalizationStateSnapshot(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_external_platform_embodiment");
assert.ok(admitted.quarantined_heads.includes(repairedHead));
assert.ok(admitted.decisive_evidence.includes("compileFinalizationStateSnapshot"));

const staleReadback = compileFinalizationStateSnapshot(
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
assert.equal(staleReadback.ok, false);
assert.equal(staleReadback.action, "block_stale_status_readback");

const metadataReread = compileFinalizationStateSnapshot(
  input({
    candidate: {
      ...input().candidate,
      candidate_id: "metadata-reread",
      candidate_class: "pr_metadata_reread",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      new_check_runs: [],
    },
  }),
);
assert.equal(metadataReread.ok, false);
assert.equal(metadataReread.action, "block_repeated_or_prohibited_class");

console.log("finalization state snapshot proof passed");
