import assert from "node:assert/strict";
import { test } from "node:test";

import {
  intakeCurrentHeadProofArtifact,
  type CurrentHeadProofArtifact,
  type CurrentHeadProofArtifactIntakeInput,
} from "./current-head-proof-artifact-intake.js";

const branch = "monday-platform-genesis-01";
const head = "aa2e40805664866cf56b7128a36d4e175babf040";

function artifact(overrides: Partial<CurrentHeadProofArtifact> = {}): CurrentHeadProofArtifact {
  return {
    artifact_id: "route-governor-proof-output-aa2e408",
    kind: "proof_output_log",
    branch,
    head_sha: head,
    verdict: "passing_with_warnings",
    source_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/current/artifacts/route-governor-proof-output.log",
    decisive_lines: ["proof-chain-proof passed"],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    ...overrides,
  };
}

function input(overrides: Partial<CurrentHeadProofArtifactIntakeInput> = {}): CurrentHeadProofArtifactIntakeInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    artifact: artifact(),
    spent_artifact_ids: [],
    derivative_surface_ids: [],
    ...overrides,
  };
}

test("admits direct passing proof output for the live head", () => {
  const verdict = intakeCurrentHeadProofArtifact(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_passing_proof_artifact");
  assert.equal(verdict.accepted_artifact_id, "route-governor-proof-output-aa2e408");
  assert.deepEqual(verdict.blockers, []);
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("routes a concrete live-head failure signature to repair", () => {
  const verdict = intakeCurrentHeadProofArtifact(
    input({
      artifact: artifact({
        artifact_id: "route-governor-proof-output-aa2e408-failing",
        verdict: "failing",
        failure_signature: "AssertionError: review request command should reject placeholder target",
        decisive_lines: ["AssertionError: review request command should reject placeholder target"],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_failure_signature_repair");
  assert.deepEqual(verdict.blockers, ["AssertionError: review request command should reject placeholder target"]);
});

test("blocks stale proof output from an older head", () => {
  const verdict = intakeCurrentHeadProofArtifact(
    input({ artifact: artifact({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_artifact_head");
  assert.deepEqual(verdict.blockers, [
    `artifact route-governor-proof-output-aa2e408 belongs to b38ea247602ae8ebba80c4120ad03b41b26bd841, not live head ${head}`,
  ]);
});

test("blocks derivative PR-body and memory surfaces", () => {
  const verdict = intakeCurrentHeadProofArtifact(
    input({ artifact: artifact({ artifact_id: "pr-body-current-head-summary", kind: "connector_pr_body" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_derivative_artifact");
});

test("blocks failing artifacts without a concrete signature", () => {
  const verdict = intakeCurrentHeadProofArtifact(
    input({ artifact: artifact({ verdict: "failing", failure_signature: "", decisive_lines: ["proof exited 1"] }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_failure_signature");
});

test("blocks replaying a proof artifact that was already spent", () => {
  const verdict = intakeCurrentHeadProofArtifact(input({ spent_artifact_ids: ["route-governor-proof-output-aa2e408"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_artifact");
});
