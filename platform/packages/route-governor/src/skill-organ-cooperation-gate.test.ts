import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceSkillOrganCooperation, type SkillOrganCooperationGateInput } from "./skill-organ-cooperation-gate.js";

const baseInput: SkillOrganCooperationGateInput = {
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "live-head",
  candidate: {
    move_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    head_sha: "live-head",
    organ_chain: [
      "monday-organ-activation-gate",
      "monday-corpus-reentry",
      "monday-archive-router",
      "monday-source-truth-grader",
      "monday-move-class-synthesizer",
      "monday-finalization-operator",
      "monday-external-act-forcer",
    ],
    optional_organs: [],
    source_pressure: {
      archive_pressure: true,
      proof_pressure: false,
      exhausted_move_class_pressure: true,
    },
    terminal_release: "external_platform_embodiment",
    behavior_artifacts: ["platform/packages/route-governor/src/skill-organ-cooperation-gate.ts"],
    routing_artifacts: ["skill organs are mandatory cooperation gates, not optional add-ons"],
  },
};

test("admits a live-head finalization route that executes the required organs in order", () => {
  const verdict = enforceSkillOrganCooperation(baseInput);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_skill_organ_cooperation");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.required_organs.includes("monday-archive-router"));
  assert.ok(verdict.required_organs.includes("monday-move-class-synthesizer"));
  assert.ok(verdict.decisive_evidence.includes("terminal external_platform_embodiment"));
});

test("blocks treating attached Monday skill organs as optional add-ons", () => {
  const verdict = enforceSkillOrganCooperation({
    ...baseInput,
    candidate: {
      ...baseInput.candidate,
      optional_organs: ["monday-archive-router"],
    },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_optional_organs");
  assert.deepEqual(verdict.blockers, ["skill organ treated as optional: monday-archive-router"]);
});

test("blocks missing archive and move-class organs when their pressure is active", () => {
  const verdict = enforceSkillOrganCooperation({
    ...baseInput,
    candidate: {
      ...baseInput.candidate,
      organ_chain: [
        "monday-organ-activation-gate",
        "monday-corpus-reentry",
        "monday-source-truth-grader",
        "monday-finalization-operator",
        "monday-external-act-forcer",
      ],
    },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_required_organs");
  assert.deepEqual(verdict.blockers, [
    "missing required skill organ: monday-archive-router",
    "missing required skill organ: monday-move-class-synthesizer",
  ]);
});

test("blocks source grading before archive routing under archive pressure", () => {
  const verdict = enforceSkillOrganCooperation({
    ...baseInput,
    candidate: {
      ...baseInput.candidate,
      organ_chain: [
        "monday-organ-activation-gate",
        "monday-corpus-reentry",
        "monday-source-truth-grader",
        "monday-archive-router",
        "monday-move-class-synthesizer",
        "monday-finalization-operator",
        "monday-external-act-forcer",
      ],
    },
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unsequenced_organs");
  assert.deepEqual(verdict.blockers, [
    "archive routing must precede source truth grading when archive pressure is active",
  ]);
});

test("blocks duplicate summaries and internal-only releases", () => {
  const duplicate = enforceSkillOrganCooperation({
    ...baseInput,
    candidate: {
      ...baseInput.candidate,
      move_class: "duplicate_ci_summary",
    },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.action, "block_non_progress_move");

  const internal = enforceSkillOrganCooperation({
    ...baseInput,
    candidate: {
      ...baseInput.candidate,
      terminal_release: "internal_only",
    },
  });
  assert.equal(internal.ok, false);
  assert.equal(internal.action, "block_missing_external_terminal");
});
