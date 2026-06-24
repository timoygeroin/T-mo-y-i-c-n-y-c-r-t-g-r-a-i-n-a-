import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseNextEmbodiment, type EmbodimentChoiceInput } from "./embodiment-choice-kernel.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<EmbodimentChoiceInput> = {}): EmbodimentChoiceInput {
  return {
    branch,
    live_head_sha: repairedHead,
    last_repaired_head_sha: repairedHead,
    exhausted_move_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "internal_memory_guard",
      "warning_repair",
    ],
    candidates: [],
    ...overrides,
  };
}

test("selects executable embodiment over status-only candidates", () => {
  const verdict = chooseNextEmbodiment(
    input({
      candidates: [
        {
          candidate_id: "status-reread",
          changed_files: [],
          executable_exports: [],
          proof_artifacts: [],
          routing_effects: [],
          choice_classes: ["status_readback"],
          depends_on_head_move: true,
        },
        {
          candidate_id: "choice-kernel",
          changed_files: ["platform/packages/route-governor/src/embodiment-choice-kernel.ts"],
          executable_exports: ["chooseNextEmbodiment"],
          proof_artifacts: ["dist/embodiment-choice-kernel-proof.js"],
          routing_effects: ["future runs rank executable embodiment before duplicate readback"],
          choice_classes: ["runtime_behavior", "future_routing", "proof_surface"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.candidate_id, "choice-kernel");
  assert.equal(verdict.rejected[0]?.candidate_id, "status-reread");
});

test("rejects an exhausted move class even when files are executable", () => {
  const verdict = chooseNextEmbodiment(
    input({
      candidates: [
        {
          candidate_id: "warning-repair-repeat",
          changed_files: ["platform/packages/route-governor/src/warning-maintenance-router.ts"],
          executable_exports: ["routeWarningMaintenance"],
          proof_artifacts: ["dist/warning-maintenance-router-proof.js"],
          routing_effects: ["repairs a non-blocking warning"],
          choice_classes: ["runtime_behavior"],
          repeats_move_class: "warning_repair",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.selected, null);
  assert.deepEqual(verdict.rejected[0]?.reasons, ["candidate repeats exhausted move class: warning_repair"]);
});

test("rejects moved-head-dependent readback when the repaired head has not moved", () => {
  const verdict = chooseNextEmbodiment(
    input({
      candidates: [
        {
          candidate_id: "fresh-readback-without-move",
          changed_files: ["platform/packages/route-governor/src/live-head-readback-cursor.ts"],
          executable_exports: ["routeLiveHeadReadback"],
          proof_artifacts: ["dist/live-head-readback-cursor-proof.js"],
          routing_effects: ["read status again"],
          choice_classes: ["status_readback"],
          depends_on_head_move: true,
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.rejected[0]?.reasons.join("; ") ?? "", /live head has not moved/);
});
