import assert from "node:assert/strict";

import { chooseNextEmbodiment, type EmbodimentChoiceInput } from "./embodiment-choice-kernel.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const input: EmbodimentChoiceInput = {
  branch: "monday-platform-genesis-01",
  live_head_sha: repairedHead,
  last_repaired_head_sha: repairedHead,
  exhausted_move_classes: [
    "metadata_reread",
    "duplicate_ci_summary",
    "duplicate_comment",
    "internal_memory_guard",
    "warning_repair",
  ],
  candidates: [
    {
      candidate_id: "duplicate-status-readback",
      changed_files: [],
      executable_exports: [],
      proof_artifacts: [],
      routing_effects: [],
      choice_classes: ["status_readback"],
      depends_on_head_move: true,
    },
    {
      candidate_id: "embodiment-choice-kernel",
      changed_files: [
        "platform/packages/route-governor/src/embodiment-choice-kernel.ts",
        "platform/packages/route-governor/src/embodiment-choice-kernel-proof.ts",
      ],
      executable_exports: ["chooseNextEmbodiment"],
      proof_artifacts: ["dist/embodiment-choice-kernel-proof.js"],
      routing_effects: ["rank executable embodiment increments before reread or warning-maintenance repeats"],
      choice_classes: ["runtime_behavior", "future_routing", "proof_surface"],
    },
  ],
};

const verdict = chooseNextEmbodiment(input);

assert.equal(verdict.ok, true);
assert.equal(verdict.branch, "monday-platform-genesis-01");
assert.equal(verdict.head_sha, repairedHead);
assert.equal(verdict.selected?.candidate_id, "embodiment-choice-kernel");
assert.ok(verdict.selected?.decisive_evidence.includes("chooseNextEmbodiment"));
assert.equal(verdict.rejected[0]?.candidate_id, "duplicate-status-readback");
assert.match(verdict.next_route, /commit the selected executable embodiment increment/);

console.log("embodiment choice kernel proof passed");
