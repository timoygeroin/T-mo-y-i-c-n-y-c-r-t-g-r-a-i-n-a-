import assert from "node:assert/strict";
import { test } from "node:test";

import {
  admitResolvedBoundaryHeadMove,
  type ResolvedBoundaryHeadMoveAdmissionInput,
} from "./resolved-boundary-head-move-admission.js";

const branch = "monday-platform-genesis-01";
const resolvedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "557d3d33ccd642c4e46bf80ea66c124bee4b24d3";

function input(overrides: Partial<ResolvedBoundaryHeadMoveAdmissionInput> = {}): ResolvedBoundaryHeadMoveAdmissionInput {
  return {
    branch,
    active_branch: branch,
    prompt_resolved_head_sha: resolvedHead,
    live_head_sha: liveHead,
    last_status_readback_head_sha: resolvedHead,
    requested_move_class: "external_platform_embodiment",
    status_verdict: "passing_with_warnings",
    new_check_run_ids: [],
    increment: {
      changed_files: ["platform/packages/route-governor/src/resolved-boundary-head-move-admission.ts"],
      executable_artifacts: ["admitResolvedBoundaryHeadMove"],
      routing_artifacts: ["resolved-head blocker is demoted when the live PR head has moved"],
      proof_artifacts: ["resolved-boundary-head-move-admission.test.ts"],
    },
    ...overrides,
  };
}

test("admits executable embodiment when prompt resolved head is historical", () => {
  const verdict = admitResolvedBoundaryHeadMove(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes(`prompt resolved head preserved as historical: ${resolvedHead}`));
  assert.ok(verdict.decisive_evidence.includes(`last readback head is stale: ${resolvedHead}`));
  assert.equal(verdict.live_head_sha, liveHead);
});

test("blocks reusing the old repaired-head blocker after the live PR head moved", () => {
  const verdict = admitResolvedBoundaryHeadMove(input({ requested_move_class: "old_resolved_head_blocker" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_old_resolved_head_reuse");
  assert.deepEqual(verdict.blockers, [`resolved-head blocker belongs to ${resolvedHead}, but live head is ${liveHead}`]);
  assert.match(verdict.next_route, /live head/);
});

test("admits fresh status readback only when the readback target is stale or new checks exist", () => {
  const verdict = admitResolvedBoundaryHeadMove(input({ requested_move_class: "fresh_status_readback", increment: undefined }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
  assert.deepEqual(verdict.decisive_evidence, [`status readback moved from ${resolvedHead} to ${liveHead}`]);
});

test("blocks duplicate readback when live head and checks have not moved", () => {
  const verdict = admitResolvedBoundaryHeadMove(
    input({
      live_head_sha: resolvedHead,
      last_status_readback_head_sha: resolvedHead,
      requested_move_class: "fresh_status_readback",
      increment: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_duplicate_or_internal_move");
  assert.deepEqual(verdict.blockers, ["fresh status readback requires a moved head or new current-head checks"]);
});

test("blocks metadata, comments, summaries, and local memory guards as non-progress", () => {
  for (const moveClass of ["duplicate_ci_summary", "metadata_reread", "duplicate_comment", "local_memory_guard"] as const) {
    const verdict = admitResolvedBoundaryHeadMove(input({ requested_move_class: moveClass }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_duplicate_or_internal_move");
    assert.deepEqual(verdict.blockers, [`non-progress move class requested: ${moveClass}`]);
  }
});

test("blocks external embodiment that lacks executable platform changes", () => {
  const verdict = admitResolvedBoundaryHeadMove(
    input({
      increment: {
        changed_files: ["platform/docs/status-note.md"],
        executable_artifacts: ["admitResolvedBoundaryHeadMove"],
        routing_artifacts: ["doc-only routing note"],
        proof_artifacts: ["resolved-boundary-head-move-admission.test.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_external_embodiment");
  assert.deepEqual(verdict.blockers, ["external embodiment must change executable platform files under platform/packages"]);
});
