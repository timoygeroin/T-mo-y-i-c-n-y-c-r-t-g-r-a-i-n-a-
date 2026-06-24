import assert from "node:assert/strict";
import test from "node:test";

import type { AdmittedCandidateWriteReceiptVerdict } from "./admitted-candidate-write-receipt.js";
import type { StatusReadbackAuthorityLeaseVerdict } from "./status-readback-authority-lease.js";
import {
  compileWriteReceiptStatusLeaseHandoff,
  type WriteReceiptStatusLeaseHandoffInput,
} from "./write-receipt-status-lease-handoff.js";

const BRANCH = "monday-platform-genesis-01";
const BASE_HEAD = "77c10f899d6a4a15b0d93d9145f59c80f13ca7f4";
const RESULT_HEAD = "b86c2cc90c1faee712dd3976d0f3571e87e31a51";

function acceptedReceipt(overrides: Partial<AdmittedCandidateWriteReceiptVerdict> = {}): AdmittedCandidateWriteReceiptVerdict {
  return {
    ok: true,
    action: "accept_admitted_candidate_write",
    branch: BRANCH,
    base_head_sha: BASE_HEAD,
    resulting_head_sha: RESULT_HEAD,
    write_receipt_id: "write-receipt-status-lease-handoff",
    decisive_evidence: [
      "write-receipt-status-lease-handoff",
      "platform/packages/route-governor/src/write-receipt-status-lease-handoff.ts",
    ],
    blockers: [],
    next_route: "open status lease for the resulting head",
    ...overrides,
  };
}

function admittedLease(overrides: Partial<StatusReadbackAuthorityLeaseVerdict> = {}): StatusReadbackAuthorityLeaseVerdict {
  return {
    ok: true,
    action: "admit_current_status_lease",
    branch: BRANCH,
    head_sha: RESULT_HEAD,
    lease_id: "status-lease-result-head",
    authority_head_sha: RESULT_HEAD,
    expired_head_shas: [BASE_HEAD],
    decisive_evidence: ["Route Governor Proof", "Monday Platform CI"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice is warning-only"],
    next_route: "choose next non-repeated embodiment",
    ...overrides,
  };
}

function input(overrides: Partial<WriteReceiptStatusLeaseHandoffInput> = {}): WriteReceiptStatusLeaseHandoffInput {
  return {
    active_branch: BRANCH,
    live_head_sha: RESULT_HEAD,
    handoff_id: "handoff-result-head-status-lease",
    spent_handoff_ids: [],
    write_receipt: acceptedReceipt(),
    status_lease: admittedLease(),
    requested_next_action: "external_platform_embodiment",
    ...overrides,
  };
}

test("admits a status lease bound to the accepted write result head", () => {
  const verdict = compileWriteReceiptStatusLeaseHandoff(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_write_receipt_status_lease");
  assert.equal(verdict.authority_lease_id, "status-lease-result-head");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes(`handoff ${input().handoff_id}`));
});

test("blocks status leases that belong to the pre-write head", () => {
  const verdict = compileWriteReceiptStatusLeaseHandoff(
    input({ status_lease: admittedLease({ head_sha: BASE_HEAD, authority_head_sha: BASE_HEAD }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_lease");
  assert.match(verdict.blockers.join("\n"), /not bound/);
});

test("blocks accepted write receipts that are no longer the live head", () => {
  const verdict = compileWriteReceiptStatusLeaseHandoff(
    input({
      live_head_sha: "newer-live-head",
      write_receipt: acceptedReceipt({ resulting_head_sha: RESULT_HEAD }),
      status_lease: admittedLease({ head_sha: "newer-live-head", authority_head_sha: "newer-live-head" }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("routes current-head repair when the resulting head has a failing status lease", () => {
  const verdict = compileWriteReceiptStatusLeaseHandoff(
    input({
      requested_next_action: "current_head_repair",
      status_lease: admittedLease({
        ok: true,
        action: "route_current_head_repair",
        blockers: ["Route governor proof examples failed on resulting head"],
        decisive_evidence: ["failing proof examples"],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_write_receipt_current_head_repair");
  assert.deepEqual(verdict.blockers, ["Route governor proof examples failed on resulting head"]);
});

test("blocks non-progress attempts to consume the handoff", () => {
  const verdict = compileWriteReceiptStatusLeaseHandoff(input({ requested_next_action: "duplicate_status_summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
});

test("blocks missing status lease before review merge or another embodiment", () => {
  const verdict = compileWriteReceiptStatusLeaseHandoff(input({ status_lease: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_status_lease");
});
