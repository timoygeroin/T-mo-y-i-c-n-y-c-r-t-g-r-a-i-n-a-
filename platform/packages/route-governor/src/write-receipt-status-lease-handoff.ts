import type { AdmittedCandidateWriteReceiptVerdict } from "./admitted-candidate-write-receipt.js";
import type { StatusReadbackAuthorityLeaseVerdict } from "./status-readback-authority-lease.js";

export type WriteReceiptStatusLeaseNextAction =
  | "fresh_status_readback"
  | "current_head_repair"
  | "external_platform_embodiment"
  | "review_request"
  | "merge_command"
  | "metadata_reread"
  | "duplicate_status_summary";

export type WriteReceiptStatusLeaseHandoffAction =
  | "admit_write_receipt_status_lease"
  | "route_write_receipt_current_head_repair"
  | "block_write_receipt_not_accepted"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_reused_handoff"
  | "block_missing_status_lease"
  | "block_stale_status_lease"
  | "block_non_progress_action";

export interface WriteReceiptStatusLeaseHandoffInput {
  active_branch: string;
  live_head_sha: string;
  handoff_id: string;
  spent_handoff_ids: string[];
  write_receipt: AdmittedCandidateWriteReceiptVerdict;
  status_lease?: StatusReadbackAuthorityLeaseVerdict;
  requested_next_action: WriteReceiptStatusLeaseNextAction;
}

export interface WriteReceiptStatusLeaseHandoffVerdict {
  ok: boolean;
  action: WriteReceiptStatusLeaseHandoffAction;
  branch: string;
  head_sha: string;
  handoff_id: string | null;
  authority_lease_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_ACTIONS = new Set<WriteReceiptStatusLeaseNextAction>([
  "metadata_reread",
  "duplicate_status_summary",
]);

function base(input: WriteReceiptStatusLeaseHandoffInput): Pick<
  WriteReceiptStatusLeaseHandoffVerdict,
  "branch" | "head_sha" | "handoff_id" | "authority_lease_id" | "warnings"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    handoff_id: input.handoff_id.trim() || null,
    authority_lease_id: input.status_lease?.lease_id ?? null,
    warnings: input.status_lease?.warnings ?? [],
  };
}

function receiptEvidence(receipt: AdmittedCandidateWriteReceiptVerdict): string[] {
  return [
    `write receipt ${receipt.write_receipt_id ?? "<missing>"}`,
    `receipt branch ${receipt.branch}`,
    `receipt base ${receipt.base_head_sha}`,
    `receipt result ${receipt.resulting_head_sha}`,
    ...receipt.decisive_evidence,
  ];
}

function leaseEvidence(lease: StatusReadbackAuthorityLeaseVerdict): string[] {
  return [
    `lease ${lease.lease_id ?? "<missing>"}`,
    `lease branch ${lease.branch}`,
    `lease authority ${lease.authority_head_sha ?? "<none>"}`,
    ...lease.decisive_evidence,
  ];
}

function block(
  input: WriteReceiptStatusLeaseHandoffInput,
  action: Exclude<
    WriteReceiptStatusLeaseHandoffAction,
    "admit_write_receipt_status_lease" | "route_write_receipt_current_head_repair"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): WriteReceiptStatusLeaseHandoffVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileWriteReceiptStatusLeaseHandoff(
  input: WriteReceiptStatusLeaseHandoffInput,
): WriteReceiptStatusLeaseHandoffVerdict {
  const handoffId = input.handoff_id.trim();
  const receipt = input.write_receipt;

  if (!handoffId || input.spent_handoff_ids.includes(handoffId)) {
    return block(
      input,
      "block_reused_handoff",
      [handoffId ? `write receipt status handoff already spent: ${handoffId}` : "write receipt status handoff has no id"],
      "issue a fresh handoff id for the resulting PR head",
      receiptEvidence(receipt),
    );
  }

  if (!receipt.ok || receipt.action !== "accept_admitted_candidate_write") {
    return block(
      input,
      "block_write_receipt_not_accepted",
      receipt.blockers.length > 0 ? receipt.blockers : [`write receipt action is not accepted: ${receipt.action}`],
      "accept the admitted candidate write receipt before leasing status authority",
      receiptEvidence(receipt),
    );
  }

  if (receipt.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`write receipt branch ${receipt.branch} does not match active branch ${input.active_branch}`],
      "bind the handoff to the active PR branch before consuming status authority",
      receiptEvidence(receipt),
    );
  }

  if (receipt.resulting_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`write receipt result ${receipt.resulting_head_sha} does not match live head ${input.live_head_sha}`],
      "discard the stale write receipt and rebuild the handoff from the current PR head",
      receiptEvidence(receipt),
    );
  }

  if (NON_PROGRESS_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_non_progress_action",
      [`${input.requested_next_action} cannot consume write-receipt status handoff authority as progress`],
      "choose fresh status readback, current-head repair, embodiment, review, merge, or an exact blocker",
      receiptEvidence(receipt),
    );
  }

  const lease = input.status_lease;
  if (!lease) {
    return block(
      input,
      "block_missing_status_lease",
      [`no status authority lease is attached for write result ${receipt.resulting_head_sha}`],
      "obtain a status-readback authority lease bound to the write receipt resulting head",
      receiptEvidence(receipt),
    );
  }

  if (lease.branch !== input.active_branch || lease.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_lease",
      [`status lease ${lease.lease_id ?? "<missing>"} is not bound to ${input.active_branch}:${input.live_head_sha}`],
      "discard stale status authority and lease only the write receipt resulting head",
      [...receiptEvidence(receipt), ...leaseEvidence(lease)],
    );
  }

  if (lease.authority_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_lease",
      [`status lease authority ${lease.authority_head_sha ?? "<none>"} does not match write result ${input.live_head_sha}`],
      "obtain a current-head status lease before consuming the accepted write receipt",
      [...receiptEvidence(receipt), ...leaseEvidence(lease)],
    );
  }

  if (lease.action === "route_current_head_repair") {
    return {
      ...base(input),
      ok: true,
      action: "route_write_receipt_current_head_repair",
      decisive_evidence: [`handoff ${handoffId}`, ...receiptEvidence(receipt), ...leaseEvidence(lease)],
      blockers: lease.blockers,
      next_route: "repair only the current-head failure authorized by the status lease before review, merge, or another embodiment",
    };
  }

  if (!lease.ok || lease.action !== "admit_current_status_lease") {
    return block(
      input,
      "block_missing_status_lease",
      lease.blockers.length > 0 ? lease.blockers : [`status lease action is not admissible: ${lease.action}`],
      "obtain a passing current-head status lease before consuming write receipt authority",
      [...receiptEvidence(receipt), ...leaseEvidence(lease)],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_write_receipt_status_lease",
    decisive_evidence: [`handoff ${handoffId}`, ...receiptEvidence(receipt), ...leaseEvidence(lease)],
    blockers: [],
    next_route: "consume only this resulting-head status lease for review, merge, or the next non-repeated embodiment",
  };
}
