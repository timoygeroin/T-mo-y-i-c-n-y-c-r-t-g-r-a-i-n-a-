import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCapabilityEscalationPolicy,
  type CapabilityEscalationCandidate,
  type CapabilityEscalationPolicyInput,
} from "./capability-escalation-policy.js";

const branch = "monday-platform-genesis-01";
const head = "e2958542d55637b0351e313e00a5754b78119843";

function candidate(overrides: Partial<CapabilityEscalationCandidate> = {}): CapabilityEscalationCandidate {
  return {
    candidate_id: "capability-escalation-policy",
    branch,
    base_head_sha: head,
    move_class: "external_platform_embodiment",
    artifact_class: "capability_escalation_policy",
    capability_axis: "external_write",
    changed_files: ["platform/packages/route-governor/src/capability-escalation-policy.ts"],
    executable_artifacts: ["applyCapabilityEscalationPolicy"],
    routing_artifacts: ["capability axis floor must rise before another embodiment is admitted"],
    proof_artifacts: ["dist/capability-escalation-policy-proof.js"],
    compounds_axes: ["external_write", "runtime_execution"],
    ...overrides,
  };
}

function input(overrides: Partial<CapabilityEscalationPolicyInput> = {}): CapabilityEscalationPolicyInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    current_axis_floor: "proof_surface",
    spent_move_classes: [],
    spent_artifact_classes: [],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits a live-head embodiment that raises capability axis", () => {
  const verdict = applyCapabilityEscalationPolicy(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_escalated_embodiment");
  assert.equal(verdict.admitted_candidate_id, "capability-escalation-policy");
  assert.ok(verdict.decisive_evidence.includes("axis proof_surface -> external_write"));
});

test("blocks stale branch and head candidates", () => {
  const verdict = applyCapabilityEscalationPolicy(
    input({ candidate: candidate({ branch: "main", base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_or_head_mismatch");
  assert.ok(verdict.blockers.includes(`candidate branch main does not match active branch ${branch}`));
  assert.ok(verdict.blockers.includes(`candidate base b38ea247602ae8ebba80c4120ad03b41b26bd841 does not match live head ${head}`));
});

test("blocks non-embodiment move classes", () => {
  const verdict = applyCapabilityEscalationPolicy(input({ candidate: candidate({ move_class: "fresh_status_readback" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_embodiment_move");
});

test("blocks axis regression below the current floor", () => {
  const verdict = applyCapabilityEscalationPolicy(input({ candidate: candidate({ capability_axis: "source_routing" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_axis_regression");
});

test("allows runtime execution at the top floor when the artifact class is unspent", () => {
  const verdict = applyCapabilityEscalationPolicy(
    input({
      current_axis_floor: "runtime_execution",
      candidate: candidate({ capability_axis: "runtime_execution", compounds_axes: ["runtime_execution", "external_write"] }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_escalated_embodiment");
});

test("blocks spent move and artifact classes", () => {
  const verdict = applyCapabilityEscalationPolicy(
    input({ spent_move_classes: ["external_platform_embodiment"], spent_artifact_classes: ["capability_escalation_policy"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_class");
  assert.ok(verdict.blockers.includes("move class is already spent: external_platform_embodiment"));
  assert.ok(verdict.blockers.includes("artifact class is already spent: capability_escalation_policy"));
});

test("blocks incomplete candidates that do not compound capability", () => {
  const verdict = applyCapabilityEscalationPolicy(
    input({
      candidate: candidate({
        changed_files: ["platform/docs/capability.md"],
        executable_artifacts: [],
        compounds_axes: ["external_write"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.ok(verdict.blockers.includes("candidate changes no executable platform file"));
  assert.ok(verdict.blockers.includes("candidate has no executable artifact evidence"));
  assert.ok(verdict.blockers.includes("candidate does not compound into a second capability axis"));
});
