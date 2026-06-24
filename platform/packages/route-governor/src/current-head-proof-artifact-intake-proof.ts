import assert from "node:assert/strict";

import {
  intakeCurrentHeadProofArtifact,
  type CurrentHeadProofArtifact,
  type CurrentHeadProofArtifactIntakeInput,
} from "./current-head-proof-artifact-intake.js";

const branch = "monday-platform-genesis-01";
const head = "aa2e40805664866cf56b7128a36d4e175babf040";

function artifact(overrides: Partial<CurrentHeadProofArtifact> = {}): CurrentHeadProofArtifact {
  return {
    artifact_id: "proof-output-aa2e408",
    kind: "github_step_summary",
    branch,
    head_sha: head,
    verdict: "passing",
    source_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/current",
    decisive_lines: ["current-head proof examples completed"],
    non_blocking_warnings: [],
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

const passing = intakeCurrentHeadProofArtifact(input());
assert.equal(passing.ok, true);
assert.equal(passing.action, "admit_passing_proof_artifact");

const failing = intakeCurrentHeadProofArtifact(
  input({
    artifact: artifact({
      artifact_id: "proof-output-aa2e408-failing",
      verdict: "failing",
      failure_signature: "TypeError: compileReviewRequestCommand received no real reviewer target",
      decisive_lines: ["TypeError: compileReviewRequestCommand received no real reviewer target"],
    }),
  }),
);
assert.equal(failing.ok, true);
assert.equal(failing.action, "route_failure_signature_repair");

const derivative = intakeCurrentHeadProofArtifact(
  input({ artifact: artifact({ artifact_id: "memory-summary-aa2e408", kind: "memory_receipt" }) }),
);
assert.equal(derivative.ok, false);
assert.equal(derivative.action, "block_derivative_artifact");

const stale = intakeCurrentHeadProofArtifact(
  input({ artifact: artifact({ head_sha: "8c0cfaf8517bb0d66ec5412482955a1a5f7fd63c" }) }),
);
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_artifact_head");

console.log("current-head proof artifact intake proof passed");
