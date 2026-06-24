import assert from "node:assert/strict";
import { test } from "node:test";

import {
  containProofChainFailure,
  type ProofChainFailureContainmentInput,
} from "./proof-chain-failure-containment.js";

const branch = "monday-platform-genesis-01";
const liveHead = "4d3cb5f972ee02f97f4f94ebf418e73c59b1a186";

function input(overrides: Partial<ProofChainFailureContainmentInput> = {}): ProofChainFailureContainmentInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    status_head_sha: liveHead,
    status_state: "failing",
    failing_check_name: "Monday Platform CI / Route governor proof surface",
    failing_step: "Run proof examples",
    spent_artifact_classes: [],
    candidate: {
      candidate_id: "proof-chain-containment",
      intent: "failure_detail_containment",
      artifact_class: "proof_chain_failure_containment",
      changed_files: ["platform/packages/route-governor/src/proof-chain-failure-containment.ts"],
      executable_artifacts: ["containProofChainFailure"],
      routing_artifacts: ["proof-chain failure containment gate"],
      proof_artifacts: ["platform/packages/route-governor/src/proof-chain-failure-containment-proof.ts"],
      appends_proof_command: false,
      claims_repair: false,
    },
    ...overrides,
  };
}

test("admits containment when proof chain fails without actionable detail", () => {
  const verdict = containProofChainFailure(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "allow_containment_increment");
  assert.equal(verdict.admitted_candidate_id, "proof-chain-containment");
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.next_route, "commit containment only, then obtain the actionable proof failure detail before repair");
});

test("blocks repair claims from headline-only proof failure", () => {
  const verdict = containProofChainFailure(
    input({
      candidate: {
        ...input().candidate!,
        candidate_id: "premature-repair",
        intent: "repair_current_failure",
        claims_repair: true,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_failure_detail");
  assert.deepEqual(verdict.blockers, ["current-head proof chain is failing without an actionable log line or assertion"]);
});

test("blocks proof-chain command extension while failure detail is missing", () => {
  const verdict = containProofChainFailure(
    input({
      candidate: {
        ...input().candidate!,
        candidate_id: "append-proof-too-early",
        intent: "extend_proof_chain",
        appends_proof_command: true,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_failure_detail");
});

test("admits bounded repair after actionable failure detail appears", () => {
  const verdict = containProofChainFailure(
    input({
      actionable_failure_detail: "AssertionError: proof chain expected containment before extension",
      candidate: {
        ...input().candidate!,
        candidate_id: "bounded-current-head-repair",
        intent: "repair_current_failure",
        artifact_class: "current_head_failure_repair",
        changed_files: ["platform/packages/route-governor/src/proof-chain.ts"],
        executable_artifacts: ["compileProofChain"],
        routing_artifacts: ["bounded current-head proof repair"],
        proof_artifacts: ["platform/packages/route-governor/src/proof-chain-proof.ts"],
        claims_repair: true,
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "allow_repair_from_detail");
  assert.equal(verdict.admitted_candidate_id, "bounded-current-head-repair");
  assert.equal(verdict.decisive_evidence.includes("AssertionError: proof chain expected containment before extension"), true);
});

test("blocks stale status from an older repaired head", () => {
  const verdict = containProofChainFailure(
    input({
      status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status");
  assert.deepEqual(verdict.blockers, [`status belongs to b38ea247602ae8ebba80c4120ad03b41b26bd841, not live head ${liveHead}`]);
});

test("blocks repeated containment artifact classes", () => {
  const verdict = containProofChainFailure(
    input({
      spent_artifact_classes: ["proof_chain_failure_containment"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_artifact");
  assert.deepEqual(verdict.blockers, ["candidate repeats spent artifact class: proof_chain_failure_containment"]);
});

test("allows proof-chain extension after non-failing status", () => {
  const verdict = containProofChainFailure(
    input({
      status_state: "passing_with_warnings",
      failing_check_name: undefined,
      failing_step: undefined,
      candidate: {
        ...input().candidate!,
        candidate_id: "next-proof-chain-extension",
        intent: "extend_proof_chain",
        artifact_class: "next_proof_chain_extension",
        appends_proof_command: true,
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "allow_proof_chain_extension");
  assert.equal(verdict.next_route, "commit the proof-chain extension, then bind status readback to the moved head");
});
