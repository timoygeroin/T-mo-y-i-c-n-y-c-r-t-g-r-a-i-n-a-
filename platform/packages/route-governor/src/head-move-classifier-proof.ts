import assert from "node:assert/strict";

import { classifyHeadMove, type HeadMoveClassifierInput } from "./head-move-classifier.js";

const branch = "monday-platform-genesis-01";
const previous = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const proofWiringHead = "b260656791b757bbeb14253a7757418c9b0764a4";
const behaviorHead = "74a7a0ba4be30fc0c6b5045168cb8213a79a6071";

function base(overrides: Partial<HeadMoveClassifierInput> = {}): HeadMoveClassifierInput {
  return {
    branch,
    active_branch: branch,
    previous_head_sha: previous,
    live_head_sha: behaviorHead,
    changed_files: [
      {
        path: "platform/packages/route-governor/src/head-move-classifier.ts",
        class: "executable_behavior",
      },
    ],
    executable_artifacts: ["classifyHeadMove"],
    routing_artifacts: ["proof-wiring-only head movement cannot be counted as embodiment progress"],
    proof_artifacts: ["dist/head-move-classifier-proof.js"],
    status_surface_ids: [],
    ...overrides,
  };
}

const proofWiringOnly = classifyHeadMove(
  base({
    live_head_sha: proofWiringHead,
    changed_files: [{ path: "platform/packages/route-governor/package.json", class: "proof_wiring" }],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
  }),
);
assert.equal(proofWiringOnly.ok, true);
assert.equal(proofWiringOnly.release_class, "fresh_status_readback_required");

const executableMove = classifyHeadMove(base());
assert.equal(executableMove.ok, true);
assert.equal(executableMove.release_class, "external_embodiment_increment");
assert.ok(executableMove.decisive_evidence.includes("classifyHeadMove"));

const metadataOnly = classifyHeadMove(
  base({
    changed_files: [{ path: "platform/README.md", class: "documentation" }],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
  }),
);
assert.equal(metadataOnly.ok, true);
assert.equal(metadataOnly.release_class, "fresh_status_readback_required");

console.log("head move classifier proof passed");
