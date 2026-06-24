import assert from "node:assert/strict";
import test from "node:test";

import {
  compileContinuationAuthority,
  type ContinuationAuthorityCandidate,
  type ContinuationAuthorityInput,
} from "./continuation-authority.js";

const liveHead = "417515e7cef9fb083d1b6255c1c57200a696ab4c";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function embodiment(overrides: Partial<ContinuationAuthorityCandidate> = {}): ContinuationAuthorityCandidate {
  return {
    candidate_id: "continuation-authority-embodiment",
    source_tier: "current_instruction",
    progress_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    claimed_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/continuation-authority.ts"],
    executable_artifacts: ["compileContinuationAuthority"],
    routing_artifacts: ["live-head source-tier continuation authority"],
    proof_artifacts: ["platform/packages/route-governor/src/continuation-authority.test.ts"],
    new_check_surface_ids: [],
    artifact_class: "continuation_authority_compiler",
    ...overrides,
  };
}

function input(candidates: ContinuationAuthorityCandidate[], overrides: Partial<ContinuationAuthorityInput> = {}): ContinuationAuthorityInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    prohibited_progress_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
      "old_repaired_head_blocker",
    ],
    spent_artifact_classes: ["embodiment_increment_planner", "head_transition_lineage_guard"],
    prohibited_blockers: [`old repaired-head blocker cannot be emitted for ${repairedHead}`],
    candidates,
    ...overrides,
  };
}

test("selects executable embodiment over stale prompt-carried repaired head", () => {
  const verdict = compileContinuationAuthority(
    input([
      {
        candidate_id: "stale-repaired-head-blocker",
        source_tier: "prompt_carried_summary",
        progress_class: "old_repaired_head_blocker",
        branch: "monday-platform-genesis-01",
        claimed_head_sha: repairedHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_surface_ids: [],
        blocker_text: `old repaired-head blocker cannot be emitted for ${repairedHead}`,
      },
      embodiment(),
    ]),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_external_platform_embodiment");
  assert.equal(verdict.selected?.candidate_id, "continuation-authority-embodiment");
  assert.equal(verdict.rejected[0]?.candidate_id, "stale-repaired-head-blocker");
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /stale head/);
});

test("blocks summary-tier status readback even when the head moved", () => {
  const verdict = compileContinuationAuthority(
    input([
      {
        candidate_id: "pr-body-status-summary",
        source_tier: "pr_body_summary",
        progress_class: "fresh_status_readback",
        branch: "monday-platform-genesis-01",
        claimed_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_surface_ids: ["pr-body-says-checks-passed"],
      },
    ]),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_authorized_candidate");
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /cannot be selected from pr_body_summary/);
});

test("admits live-head status readback from direct status surface", () => {
  const verdict = compileContinuationAuthority(
    input([
      {
        candidate_id: "live-status-surface",
        source_tier: "live_status_surface",
        progress_class: "fresh_status_readback",
        branch: "monday-platform-genesis-01",
        claimed_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_surface_ids: ["check-run-27090000001"],
      },
    ]),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_fresh_status_readback");
  assert.equal(verdict.selected?.candidate_id, "live-status-surface");
});

test("blocks executable embodiment candidates that repeat a spent artifact class", () => {
  const verdict = compileContinuationAuthority(
    input([embodiment({ artifact_class: "embodiment_increment_planner" })]),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /repeats spent artifact class/);
});

test("requires executable, routing, and proof evidence for embodiment", () => {
  const verdict = compileContinuationAuthority(
    input([
      embodiment({
        changed_files: ["platform/docs/manifestation-contract.md"],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    ]),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /no executable platform file/);
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /no executable artifact/);
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /no routing artifact/);
  assert.match(verdict.rejected[0]?.blockers.join("; ") ?? "", /no proof artifact/);
});
