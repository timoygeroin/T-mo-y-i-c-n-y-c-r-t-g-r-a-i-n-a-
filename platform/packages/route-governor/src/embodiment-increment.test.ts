import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateEmbodimentIncrement,
  selectEmbodimentIncrement,
  type EmbodimentIncrementCandidate,
  type PriorEmbodimentReceipt,
} from "./embodiment-increment.js";

const priorReceipts: PriorEmbodimentReceipt[] = [
  {
    receipt_id: "head-transition-lineage-guard",
    head_sha: "5b59cbd1d5ef1e1711ff93eb58d0d9e3672cead1",
    move_class: "external_platform_embodiment",
    artifact_class: "head_transition_lineage_guard",
    changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
    executable_artifacts: ["compileHeadTransitionGuard"],
    routing_artifacts: ["latest-head lineage binding"],
  },
];

function candidate(overrides: Partial<EmbodimentIncrementCandidate> = {}): EmbodimentIncrementCandidate {
  return {
    candidate_id: "post-readback-embodiment-planner",
    branch: "monday-platform-genesis-01",
    current_head_sha: "next-head",
    move_class: "external_platform_embodiment",
    artifact_class: "post_readback_embodiment_planner",
    changed_files: ["platform/packages/route-governor/src/embodiment-increment.ts"],
    executable_artifacts: ["evaluateEmbodimentIncrement", "selectEmbodimentIncrement"],
    routing_artifacts: ["blocks repeated artifact classes before branch release"],
    prohibited_move_classes: ["metadata_reread", "duplicate_status_readback", "duplicate_comment", "internal_memory_guard"],
    ...overrides,
  };
}

test("accepts a new executable embodiment artifact class", () => {
  const verdict = evaluateEmbodimentIncrement(candidate(), priorReceipts);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_increment");
  assert.equal(verdict.candidate_id, "post-readback-embodiment-planner");
  assert.deepEqual(verdict.failures, []);
  assert.ok(verdict.decisive_evidence.includes("platform/packages/route-governor/src/embodiment-increment.ts"));
  assert.ok(verdict.decisive_evidence.includes("evaluateEmbodimentIncrement"));
});

test("blocks prohibited continuation move classes", () => {
  const verdict = evaluateEmbodimentIncrement(candidate({ move_class: "metadata_reread" }), priorReceipts);

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("move class is prohibited")));
  assert.ok(verdict.failures.some((failure) => failure.includes("only admits external platform embodiment")));
});

test("blocks a candidate that only repeats a prior artifact class", () => {
  const verdict = evaluateEmbodimentIncrement(
    candidate({
      artifact_class: "head_transition_lineage_guard",
      changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
      executable_artifacts: ["compileHeadTransitionGuard"],
      routing_artifacts: ["latest-head lineage binding"],
    }),
    priorReceipts,
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("repeats artifact class head_transition_lineage_guard")));
});

test("blocks non-executable platform changes", () => {
  const verdict = evaluateEmbodimentIncrement(
    candidate({ changed_files: ["platform/docs/manifestation-contract.md"] }),
    priorReceipts,
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("must change an executable platform package file")));
});

test("selects the surviving non-repeated executable increment", () => {
  const verdict = selectEmbodimentIncrement(
    [
      candidate({
        candidate_id: "repeat-head-transition",
        artifact_class: "head_transition_lineage_guard",
        changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
        executable_artifacts: ["compileHeadTransitionGuard"],
        routing_artifacts: ["latest-head lineage binding"],
      }),
      candidate({ candidate_id: "new-planner" }),
    ],
    priorReceipts,
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.candidate_id, "new-planner");
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.rejected.length, 1);
});

test("reports one blocker when every candidate repeats spent progress", () => {
  const verdict = selectEmbodimentIncrement(
    [
      candidate({
        candidate_id: "metadata-only",
        move_class: "metadata_reread",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
      }),
    ],
    priorReceipts,
  );

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failures, ["no non-repeated executable embodiment increment survived planning"]);
  assert.equal(verdict.selected, null);
});
