import assert from "node:assert/strict";

import { compileFinalizationProgressContract, type FinalizationProgressInput } from "./finalization-progress-contract.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "7623d27d72d2cb72a367a7507f4b8577434c683f";
const artifactPath = "platform/packages/route-governor/src/finalization-progress-contract.ts";
const prohibitedRepairedHeadBlocker =
  "repaired-head status readback is still missing for b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<FinalizationProgressInput> = {}): FinalizationProgressInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    last_status_readback_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    resolved_repaired_head_succeeded: true,
    move_class: "external_platform_embodiment",
    changed_files: [artifactPath],
    executable_artifacts: ["compileFinalizationProgressContract"],
    routing_artifacts: ["finalization progress contract"],
    artifact_class: "finalization-progress-contract",
    spent_artifact_classes: [
      "github-status-readback-compiler",
      "continuation-receipt-replay-guard",
      "head-transition-lineage-guard",
      "embodiment-increment-planner",
      "proof-failure-repair-plan",
      "proof-chain-completeness",
    ],
    new_current_head_check_ids: [],
    prohibited_blockers: [prohibitedRepairedHeadBlocker],
    ...overrides,
  };
}

const embodiment = compileFinalizationProgressContract(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "commit_executable_embodiment");
assert.ok(embodiment.decisive_evidence.includes("compileFinalizationProgressContract"));
assert.ok(embodiment.next_route.includes("new PR head"));

const prohibitedBlocker = compileFinalizationProgressContract(
  input({
    move_class: "exact_external_blocker",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    exact_blocker: prohibitedRepairedHeadBlocker,
  }),
);
assert.equal(prohibitedBlocker.ok, false);
assert.equal(prohibitedBlocker.action, "block_non_progress");
assert.ok(prohibitedBlocker.blockers[0].includes("prohibited blocker"));

const metadataReread = compileFinalizationProgressContract(
  input({
    move_class: "metadata_reread",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
  }),
);
assert.equal(metadataReread.ok, false);
assert.equal(metadataReread.action, "block_non_progress");
assert.ok(metadataReread.blockers[0].includes("metadata_reread"));

const movedHeadReadback = compileFinalizationProgressContract(
  input({
    move_class: "fresh_status_readback",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    status_surface: {
      head_sha: liveHead,
      evidence_ids: ["actions-run-27150000001"],
    },
  }),
);
assert.equal(movedHeadReadback.ok, true);
assert.equal(movedHeadReadback.action, "read_live_head_status");
assert.ok(movedHeadReadback.decisive_evidence.some((line) => line.includes("head moved")));

const staleReadback = compileFinalizationProgressContract(
  input({
    move_class: "fresh_status_readback",
    live_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
  }),
);
assert.equal(staleReadback.ok, false);
assert.equal(staleReadback.action, "block_non_progress");
assert.ok(staleReadback.blockers[0].includes("moved PR head or new current-head checks"));

const staleStatusSurface = compileFinalizationProgressContract(
  input({
    move_class: "fresh_status_readback",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    status_surface: {
      head_sha: repairedHead,
      evidence_ids: ["old-run"],
    },
  }),
);
assert.equal(staleStatusSurface.ok, false);
assert.equal(staleStatusSurface.action, "block_incomplete_progress");
assert.ok(staleStatusSurface.blockers[0].includes("not live head"));

const repeatedArtifact = compileFinalizationProgressContract(
  input({
    artifact_class: "proof-chain-completeness",
  }),
);
assert.equal(repeatedArtifact.ok, false);
assert.equal(repeatedArtifact.action, "block_incomplete_progress");
assert.ok(repeatedArtifact.blockers[0].includes("repeats spent artifact class"));

const exactLiveBlocker = compileFinalizationProgressContract(
  input({
    move_class: "exact_external_blocker",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    exact_blocker: "GitHub contents API cannot write to monday-platform-genesis-01",
  }),
);
assert.equal(exactLiveBlocker.ok, true);
assert.equal(exactLiveBlocker.action, "emit_exact_external_blocker");

console.log("finalization-progress-contract proof passed");
