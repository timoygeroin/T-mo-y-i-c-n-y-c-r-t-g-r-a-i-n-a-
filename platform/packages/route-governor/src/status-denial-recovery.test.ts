import assert from "node:assert/strict";
import { test } from "node:test";

import {
  recoverFromStatusDenial,
  type StatusDenialReceipt,
  type StatusDenialRecoveryCandidate,
  type StatusDenialRecoveryInput,
} from "./status-denial-recovery.js";

const branch = "monday-platform-genesis-01";
const previousStatusHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "b14ce943c7f19eb58a247cfc7e32fd5e98f98e7f";

function denial(overrides: Partial<StatusDenialReceipt> = {}): StatusDenialReceipt {
  return {
    receipt_id: "checks-api-403-b14ce943",
    surface_kind: "checks_api",
    branch,
    head_sha: liveHead,
    reason: "http_403",
    detail: "GitHub Checks API returned 403 for the live head in this runtime",
    ...overrides,
  };
}

function candidate(overrides: Partial<StatusDenialRecoveryCandidate> = {}): StatusDenialRecoveryCandidate {
  return {
    candidate_id: "status-denial-recovery-router",
    artifact_class: "status-denial-recovery",
    changed_files: ["platform/packages/route-governor/src/status-denial-recovery.ts"],
    executable_artifacts: ["recoverFromStatusDenial"],
    routing_artifacts: ["live-head status denial can trigger no-status-claim embodiment only with a writable surface"],
    proof_artifacts: ["dist/status-denial-recovery-proof.js"],
    ...overrides,
  };
}

function input(overrides: Partial<StatusDenialRecoveryInput> = {}): StatusDenialRecoveryInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    last_status_readback_head_sha: previousStatusHead,
    writable_external_surface: true,
    known_live_failures: [],
    status_denials: [denial()],
    spent_denial_receipt_ids: [],
    spent_artifact_classes: [],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits denial recovery embodiment when status readback is denied for a moved live head", () => {
  const verdict = recoverFromStatusDenial(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_denial_recovery_embodiment");
  assert.equal(verdict.status_claim, "none");
  assert.equal(verdict.admitted_candidate_id, "status-denial-recovery-router");
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.decisive_evidence.join("\n"), /head moved from/);
});

test("blocks stale denials that are not bound to the live head", () => {
  const verdict = recoverFromStatusDenial(
    input({
      status_denials: [denial({ head_sha: previousStatusHead })],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_denial");
  assert.match(verdict.blockers.join("\n"), /stale status denial/);
});

test("blocks repeated denial receipts as progress triggers", () => {
  const verdict = recoverFromStatusDenial(input({ spent_denial_receipt_ids: ["checks-api-403-b14ce943"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_denial");
  assert.deepEqual(verdict.blockers, ["status denial receipt already spent: checks-api-403-b14ce943"]);
});

test("blocks known live failures before denial recovery", () => {
  const verdict = recoverFromStatusDenial(input({ known_live_failures: ["Route governor proof surface failed"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_known_live_failure");
  assert.deepEqual(verdict.blockers, ["Route governor proof surface failed"]);
});

test("emits an exact blocker when both readback and writable embodiment are unavailable", () => {
  const verdict = recoverFromStatusDenial(
    input({
      writable_external_surface: false,
      candidate: candidate({ changed_files: [] }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_status_denial_blocker");
  assert.equal(verdict.status_claim, "requires_live_readback");
  assert.match(verdict.blockers.join("\n"), /no writable embodiment surface/);
});

test("blocks incomplete candidates when a writable surface exists", () => {
  const verdict = recoverFromStatusDenial(input({ candidate: candidate({ executable_artifacts: [] }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert(verdict.blockers.includes("status denial recovery candidate has no executable artifact evidence"));
});

test("routes to status readback when the head has not moved beyond the last readback", () => {
  const verdict = recoverFromStatusDenial(input({ last_status_readback_head_sha: liveHead }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_status_readback");
  assert.match(verdict.next_route, /read live-head status/);
});

test("blocks branch mismatch before accepting a denial receipt", () => {
  const verdict = recoverFromStatusDenial(input({ branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
});
