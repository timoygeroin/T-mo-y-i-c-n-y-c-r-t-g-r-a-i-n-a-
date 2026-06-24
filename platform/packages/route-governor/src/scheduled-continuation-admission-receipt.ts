import type { ScheduledContinuationAdmissionVerdict } from "./scheduled-continuation-admission.js";

export type ScheduledContinuationReceiptReleaseClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "blocked";

export interface ScheduledContinuationAdmissionReceiptInput {
  receipt_id: string;
  active_branch: string;
  live_head_sha: string;
  admission: ScheduledContinuationAdmissionVerdict;
}

export interface ScheduledContinuationAdmissionReceipt {
  ok: boolean;
  receipt_id: string;
  branch: string;
  head_sha: string;
  release_class: ScheduledContinuationReceiptReleaseClass;
  quarantined_prompt_head: string | null;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function releaseClass(admission: ScheduledContinuationAdmissionVerdict): ScheduledContinuationReceiptReleaseClass {
  switch (admission.action) {
    case "admit_external_embodiment":
      return "external_platform_embodiment";
    case "admit_fresh_status_readback":
      return "fresh_status_readback";
    case "admit_exact_external_blocker":
      return "exact_external_blocker";
    default:
      return "blocked";
  }
}

export function compileScheduledContinuationAdmissionReceipt(
  input: ScheduledContinuationAdmissionReceiptInput,
): ScheduledContinuationAdmissionReceipt {
  const blockers: string[] = [];

  if (!input.receipt_id.trim()) blockers.push("scheduled admission receipt has no receipt id");
  if (input.admission.branch !== input.active_branch) {
    blockers.push(`admission branch ${input.admission.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.admission.head_sha !== input.live_head_sha) {
    blockers.push(`admission head ${input.admission.head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (input.admission.quarantined_prompt_head === input.live_head_sha) {
    blockers.push("quarantined prompt head cannot equal the live head");
  }

  if (!input.admission.ok) {
    return {
      ok: false,
      receipt_id: input.receipt_id,
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      release_class: "blocked",
      quarantined_prompt_head: input.admission.quarantined_prompt_head,
      admitted_candidate_id: null,
      decisive_evidence: [],
      blockers: [...blockers, ...input.admission.blockers],
      warnings: input.admission.warnings,
      next_route: input.admission.next_route,
    };
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      receipt_id: input.receipt_id,
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      release_class: "blocked",
      quarantined_prompt_head: input.admission.quarantined_prompt_head,
      admitted_candidate_id: input.admission.admitted_candidate_id,
      decisive_evidence: input.admission.decisive_evidence,
      blockers,
      warnings: input.admission.warnings,
      next_route: "discard the mismatched scheduled admission receipt before release",
    };
  }

  const selectedReleaseClass = releaseClass(input.admission);
  return {
    ok: selectedReleaseClass !== "blocked",
    receipt_id: input.receipt_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    release_class: selectedReleaseClass,
    quarantined_prompt_head: input.admission.quarantined_prompt_head,
    admitted_candidate_id: input.admission.admitted_candidate_id,
    decisive_evidence: [
      `scheduled admission receipt ${input.receipt_id}`,
      `live head ${input.live_head_sha}`,
      ...input.admission.decisive_evidence,
    ],
    blockers: input.admission.blockers,
    warnings: input.admission.warnings,
    next_route:
      selectedReleaseClass === "external_platform_embodiment"
        ? "commit the admitted embodiment, then bind status readback to the moved head"
        : input.admission.next_route,
  };
}
