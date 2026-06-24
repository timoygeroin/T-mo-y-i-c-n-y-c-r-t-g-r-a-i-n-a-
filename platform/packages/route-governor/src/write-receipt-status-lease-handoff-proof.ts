import type { AdmittedCandidateWriteReceiptVerdict } from "./admitted-candidate-write-receipt.js";
import type { StatusReadbackAuthorityLeaseVerdict } from "./status-readback-authority-lease.js";
import { compileWriteReceiptStatusLeaseHandoff } from "./write-receipt-status-lease-handoff.js";

const branch = "monday-platform-genesis-01";
const baseHead = "77c10f899d6a4a15b0d93d9145f59c80f13ca7f4";
const resultHead = "b86c2cc90c1faee712dd3976d0f3571e87e31a51";

function receipt(overrides: Partial<AdmittedCandidateWriteReceiptVerdict> = {}): AdmittedCandidateWriteReceiptVerdict {
  return {
    ok: true,
    action: "accept_admitted_candidate_write",
    branch,
    base_head_sha: baseHead,
    resulting_head_sha: resultHead,
    write_receipt_id: "write-receipt-status-lease-handoff-proof",
    decisive_evidence: ["accepted write receipt", "write-receipt-status-lease-handoff.ts"],
    blockers: [],
    next_route: "lease status for the resulting head",
    ...overrides,
  };
}

function lease(overrides: Partial<StatusReadbackAuthorityLeaseVerdict> = {}): StatusReadbackAuthorityLeaseVerdict {
  return {
    ok: true,
    action: "admit_current_status_lease",
    branch,
    head_sha: resultHead,
    lease_id: "result-head-status-lease",
    authority_head_sha: resultHead,
    expired_head_shas: [baseHead],
    decisive_evidence: ["current-head checks succeeded"],
    blockers: [],
    warnings: [],
    next_route: "consume resulting-head status authority only",
    ...overrides,
  };
}

function expectAction(name: string, action: string, expected: string): void {
  if (action !== expected) throw new Error(`${name} used ${action}, expected ${expected}`);
}

export function runWriteReceiptStatusLeaseHandoffProof(): void {
  const admitted = compileWriteReceiptStatusLeaseHandoff({
    active_branch: branch,
    live_head_sha: resultHead,
    handoff_id: "proof-handoff",
    spent_handoff_ids: [],
    write_receipt: receipt(),
    status_lease: lease(),
    requested_next_action: "external_platform_embodiment",
  });
  if (!admitted.ok) throw new Error(`resulting-head status lease should admit: ${admitted.blockers.join("; ")}`);
  expectAction("resulting-head lease", admitted.action, "admit_write_receipt_status_lease");

  const staleLease = compileWriteReceiptStatusLeaseHandoff({
    active_branch: branch,
    live_head_sha: resultHead,
    handoff_id: "proof-stale-lease",
    spent_handoff_ids: [],
    write_receipt: receipt(),
    status_lease: lease({ head_sha: baseHead, authority_head_sha: baseHead }),
    requested_next_action: "review_request",
  });
  if (staleLease.ok) throw new Error("pre-write status lease should not consume write receipt authority");
  expectAction("stale lease", staleLease.action, "block_stale_status_lease");

  const nonProgress = compileWriteReceiptStatusLeaseHandoff({
    active_branch: branch,
    live_head_sha: resultHead,
    handoff_id: "proof-non-progress",
    spent_handoff_ids: [],
    write_receipt: receipt(),
    status_lease: lease(),
    requested_next_action: "metadata_reread",
  });
  if (nonProgress.ok) throw new Error("metadata reread should not consume write-receipt handoff authority");
  expectAction("non-progress action", nonProgress.action, "block_non_progress_action");
}

runWriteReceiptStatusLeaseHandoffProof();
