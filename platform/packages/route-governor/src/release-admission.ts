import type { ContinuationReleaseReceipt } from "./index.js";

export type AdmittedReleaseAction =
  | "publish_external_embodiment"
  | "publish_fresh_status_readback"
  | "publish_exact_blocker"
  | "block_release";

export interface ReleaseAdmissionInput {
  expected_branch: string;
  expected_head_sha: string;
  receipt: ContinuationReleaseReceipt;
}

export interface ReleaseAdmissionVerdict {
  ok: boolean;
  action: AdmittedReleaseAction;
  release_class: ContinuationReleaseReceipt["release_class"];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
}

function targetFailures(input: ReleaseAdmissionInput): string[] {
  const failures: string[] = [];

  if (input.receipt.branch !== input.expected_branch) {
    failures.push(`receipt branch ${input.receipt.branch} does not match expected branch ${input.expected_branch}`);
  }

  if (input.receipt.head_sha !== input.expected_head_sha) {
    failures.push(`receipt head ${input.receipt.head_sha} does not match expected head ${input.expected_head_sha}`);
  }

  return failures;
}

function blockReceipt(
  input: ReleaseAdmissionInput,
  blockers: string[],
  decisiveEvidence: string[] = input.receipt.decisive_evidence,
): ReleaseAdmissionVerdict {
  return {
    ok: false,
    action: "block_release",
    release_class: input.receipt.release_class,
    decisive_evidence: decisiveEvidence,
    blockers,
    warnings: input.receipt.warnings,
  };
}

function requireEvidence(input: ReleaseAdmissionInput): string[] {
  return input.receipt.decisive_evidence.length === 0 ? ["release receipt has no decisive evidence"] : [];
}

export function admitContinuationRelease(input: ReleaseAdmissionInput): ReleaseAdmissionVerdict {
  const targetBlockers = targetFailures(input);
  if (targetBlockers.length > 0) {
    return blockReceipt(input, targetBlockers);
  }

  if (!input.receipt.ok || input.receipt.release_instruction === "block_release") {
    return blockReceipt(input, input.receipt.blockers.length > 0 ? input.receipt.blockers : ["release receipt is blocked"]);
  }

  const evidenceBlockers = requireEvidence(input);
  if (evidenceBlockers.length > 0) {
    return blockReceipt(input, evidenceBlockers);
  }

  if (input.receipt.release_class === "external_embodiment") {
    if (input.receipt.blockers.length > 0) {
      return blockReceipt(input, input.receipt.blockers);
    }

    return {
      ok: true,
      action: "publish_external_embodiment",
      release_class: input.receipt.release_class,
      decisive_evidence: input.receipt.decisive_evidence,
      blockers: [],
      warnings: input.receipt.warnings,
    };
  }

  if (input.receipt.release_class === "fresh_status_readback") {
    if (input.receipt.blockers.length > 0) {
      return blockReceipt(input, input.receipt.blockers);
    }

    return {
      ok: true,
      action: "publish_fresh_status_readback",
      release_class: input.receipt.release_class,
      decisive_evidence: input.receipt.decisive_evidence,
      blockers: [],
      warnings: input.receipt.warnings,
    };
  }

  if (input.receipt.release_class === "exact_external_blocker") {
    return {
      ok: true,
      action: "publish_exact_blocker",
      release_class: input.receipt.release_class,
      decisive_evidence: input.receipt.decisive_evidence,
      blockers: input.receipt.blockers.length > 0 ? input.receipt.blockers : input.receipt.decisive_evidence,
      warnings: input.receipt.warnings,
    };
  }

  return blockReceipt(input, input.receipt.blockers.length > 0 ? input.receipt.blockers : ["release class is blocked"]);
}
