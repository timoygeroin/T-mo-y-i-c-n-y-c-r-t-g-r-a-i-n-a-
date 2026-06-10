import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyHeadMove, type HeadMoveClassifierInput } from "./head-move-classifier.js";

const branch = "monday-platform-genesis-01";
const previous = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const live = "b260656791b757bbeb14253a7757418c9b0764a4";

function input(overrides: Partial<HeadMoveClassifierInput> = {}): HeadMoveClassifierInput {
  return {
    branch,
    active_branch: branch,
    previous_head_sha: previous,
    live_head_sha: live,
    changed_files: [
      {
        path: "platform/packages/route-governor/src/head-move-classifier.ts",
        class: "executable_behavior",
      },
    ],
    executable_artifacts: ["classifyHeadMove"],
    routing_artifacts: ["head movement is separated into embodiment, readback, or blocker routes"],
    proof_artifacts: ["dist/head-move-classifier-proof.js"],
    status_surface_ids: [],
    ...overrides,
  };
}

test("accepts moved heads that carry executable behavior and proof evidence", () => {
  const verdict = classifyHeadMove(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "external_embodiment_increment");
  assert.match(verdict.next_route, /require live-head status readback/);
});

test("routes proof-wiring-only head movement to fresh status readback", () => {
  const verdict = classifyHeadMove(
    input({
      changed_files: [{ path: "platform/packages/route-governor/package.json", class: "proof_wiring" }],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "fresh_status_readback_required");
  assert.match(verdict.next_route, /not as external embodiment progress/);
});

test("blocks unmoved heads with no status surface or blocker", () => {
  const verdict = classifyHeadMove(
    input({
      live_head_sha: previous,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.release_class, "blocked_non_progress");
});

test("admits current-head status surfaces without requiring a new behavior file", () => {
  const verdict = classifyHeadMove(
    input({
      live_head_sha: previous,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      status_surface_ids: ["Route Governor Proof / proof examples"],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.release_class, "fresh_status_readback_required");
});

test("blocks behavior-bearing moves when executable evidence is incomplete", () => {
  const verdict = classifyHeadMove(input({ executable_artifacts: [] }));

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, ["moved head has behavior files but no executable artifact names"]);
});
