import assert from "node:assert/strict";

import {
  admitSourceRankedFinalizationMove,
  type SourceRankedFinalizationAdmissionInput,
} from "./source-ranked-finalization-admission.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "2e4de66b18c8c3579e13f1cead4fd2dd93ef682c";

function input(overrides: Partial<SourceRankedFinalizationAdmissionInput> = {}): SourceRankedFinalizationAdmissionInput {
  return {
    active_branch: branch,
    target_branch: branch,
    candidate_class: "external_platform_embodiment",
    candidate_head_sha: liveHead,
    prior_status_head_sha: promptHead,
    head_sources: [
      {
        source_id: "prompt-carried-head",
        tier: "current_instruction",
        head_sha: promptHead,
        observed_at: "2026-06-09T06:04:01.000Z",
      },
      {
        source_id: "github-pr-metadata",
        tier: "live_pr_metadata",
        head_sha: liveHead,
        observed_at: "2026-06-09T06:12:03.000Z",
      },
      {
        source_id: "memory-receipt",
        tier: "memory_receipt",
        head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        observed_at: "2026-06-07T00:00:00.000Z",
      },
    ],
    changed_files: ["platform/packages/route-governor/src/source-ranked-finalization-admission.ts"],
    executable_artifacts: ["admitSourceRankedFinalizationMove"],
    routing_artifacts: ["live PR metadata controls volatile head binding before finalization admission"],
    proof_artifacts: ["dist/source-ranked-finalization-admission-proof.js"],
    artifact_class: "source-ranked-finalization-admission",
    spent_artifact_classes: ["prompt-head-reconciliation", "current-head-failure-intake"],
    ...overrides,
  };
}

const admitted = admitSourceRankedFinalizationMove(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_live_head_embodiment");
assert.equal(admitted.head_sha, liveHead);
assert.equal(admitted.controlling_source?.source_id, "github-pr-metadata");
assert.match(admitted.next_route, /resulting new PR head/);

const stalePromptHead = admitSourceRankedFinalizationMove(input({ candidate_head_sha: promptHead }));
assert.equal(stalePromptHead.ok, false);
assert.equal(stalePromptHead.action, "block_stale_head_binding");
assert.deepEqual(stalePromptHead.blockers, [
  `candidate is bound to ${promptHead}, but strongest head source github-pr-metadata reports ${liveHead}`,
]);

const repeatedOldBlocker = admitSourceRankedFinalizationMove(
  input({ candidate_class: "old_repaired_head_blocker" }),
);
assert.equal(repeatedOldBlocker.ok, false);
assert.equal(repeatedOldBlocker.action, "block_repeated_non_progress");

const freshMovedHeadStatus = admitSourceRankedFinalizationMove(
  input({
    candidate_class: "fresh_status_readback",
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    artifact_class: "status-readback",
  }),
);
assert.equal(freshMovedHeadStatus.ok, true);
assert.equal(freshMovedHeadStatus.action, "admit_live_head_status_readback");
assert.match(freshMovedHeadStatus.next_route, /source-ranked live PR head/);

const repeatedSameHeadStatus = admitSourceRankedFinalizationMove(
  input({
    candidate_class: "fresh_status_readback",
    prior_status_head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    artifact_class: "status-readback",
  }),
);
assert.equal(repeatedSameHeadStatus.ok, false);
assert.equal(repeatedSameHeadStatus.action, "block_repeated_non_progress");
assert.deepEqual(repeatedSameHeadStatus.blockers, [`status for ${liveHead} has already been read back`]);

const incompleteEmbodiment = admitSourceRankedFinalizationMove(
  input({
    changed_files: ["README.md"],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
  }),
);
assert.equal(incompleteEmbodiment.ok, false);
assert.equal(incompleteEmbodiment.action, "block_incomplete_embodiment");
assert.ok(incompleteEmbodiment.blockers.includes("source-ranked embodiment has no executable platform file change"));
assert.ok(incompleteEmbodiment.blockers.includes("source-ranked embodiment has no executable artifact evidence"));

const spentArtifact = admitSourceRankedFinalizationMove(
  input({ spent_artifact_classes: ["source-ranked-finalization-admission"] }),
);
assert.equal(spentArtifact.ok, false);
assert.equal(spentArtifact.action, "block_incomplete_embodiment");
assert.deepEqual(spentArtifact.blockers, [
  "source-ranked embodiment repeats spent artifact class: source-ranked-finalization-admission",
]);

const missingHeadSource = admitSourceRankedFinalizationMove(input({ head_sources: [] }));
assert.equal(missingHeadSource.ok, false);
assert.equal(missingHeadSource.action, "block_missing_head_source");

console.log("source-ranked finalization admission proof passed");
