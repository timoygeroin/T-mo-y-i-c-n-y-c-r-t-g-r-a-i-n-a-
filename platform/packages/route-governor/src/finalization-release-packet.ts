import type { FinalizationTerminalProgressVerdict } from "./finalization-terminal-progress-contract.js";
import type { LiveProgressReceiptVerdict } from "./live-progress-receipt.js";

export type FinalizationReleasePacketClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type FinalizationReleasePacketAction =
  | "release_external_embodiment_packet"
  | "release_fresh_status_packet"
  | "release_exact_blocker_packet"
  | "block_terminal_progress"
  | "block_receipt_mismatch"
  | "block_status_claim_before_readback";

export interface FinalizationReleasePacketInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  terminal: FinalizationTerminalProgressVerdict;
  receipt: LiveProgressReceiptVerdict;
  release_class: FinalizationReleasePacketClass;
  status_claim: "none" | "passing" | "passing_with_warnings" | "pending" | "failing";
  status_readback_head_sha?: string;
}

export interface FinalizationReleasePacketVerdict {
  ok: boolean;
  action: FinalizationReleasePacketAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  release_class: FinalizationReleasePacketClass;
  decisive_evidence: string[];
  blockers: string[];
  next_status_expected_head: string | null;
  next_route: string;
}

function base(input: FinalizationReleasePacketInput): Pick<
  FinalizationReleasePacketVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "release_class" | "next_status_expected_head"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.receipt.head_sha,
    release_class: input.release_class,
    next_status_expected_head: input.receipt.next_status_expected_head,
  };
}

function block(
  input: FinalizationReleasePacketInput,
  action: Exclude<
    FinalizationReleasePacketAction,
    "release_external_embodiment_packet" | "release_fresh_status_packet" | "release_exact_blocker_packet"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): FinalizationReleasePacketVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function terminalActionFor(releaseClass: FinalizationReleasePacketClass): FinalizationTerminalProgressVerdict["action"] {
  switch (releaseClass) {
    case "external_platform_embodiment":
      return "admit_external_embodiment";
    case "fresh_status_readback":
      return "admit_fresh_status_readback";
    case "exact_external_blocker":
      return "admit_exact_external_blocker";
  }
}

function receiptActionFor(releaseClass: FinalizationReleasePacketClass): LiveProgressReceiptVerdict["action"] {
  switch (releaseClass) {
    case "external_platform_embodiment":
      return "accept_external_progress_receipt";
    case "fresh_status_readback":
      return "accept_status_receipt";
    case "exact_external_blocker":
      return "accept_blocker_receipt";
  }
}

function releaseActionFor(releaseClass: FinalizationReleasePacketClass): FinalizationReleasePacketAction {
  switch (releaseClass) {
    case "external_platform_embodiment":
      return "release_external_embodiment_packet";
    case "fresh_status_readback":
      return "release_fresh_status_packet";
    case "exact_external_blocker":
      return "release_exact_blocker_packet";
  }
}

export function compileFinalizationReleasePacket(
  input: FinalizationReleasePacketInput,
): FinalizationReleasePacketVerdict {
  if (!input.terminal.ok) {
    return block(
      input,
      "block_terminal_progress",
      input.terminal.blockers.length > 0 ? input.terminal.blockers : ["terminal progress was not admitted"],
      input.terminal.next_route,
    );
  }

  const expectedTerminalAction = terminalActionFor(input.release_class);
  if (input.terminal.action !== expectedTerminalAction) {
    return block(
      input,
      "block_receipt_mismatch",
      [`terminal action ${input.terminal.action} does not match release class ${input.release_class}`],
      "recompile terminal progress for the release class before packet release",
      input.terminal.decisive_evidence,
    );
  }

  if (!input.receipt.ok) {
    return block(
      input,
      "block_receipt_mismatch",
      input.receipt.blockers.length > 0 ? input.receipt.blockers : ["live progress receipt was not accepted"],
      input.receipt.next_route,
      input.terminal.decisive_evidence,
    );
  }

  const expectedReceiptAction = receiptActionFor(input.release_class);
  if (input.receipt.action !== expectedReceiptAction) {
    return block(
      input,
      "block_receipt_mismatch",
      [`receipt action ${input.receipt.action} does not match release class ${input.release_class}`],
      "bind the release packet to the matching live progress receipt before release",
      [...input.terminal.decisive_evidence, ...input.receipt.decisive_evidence],
    );
  }

  if (input.terminal.branch !== input.active_branch || input.receipt.branch !== input.active_branch) {
    return block(
      input,
      "block_receipt_mismatch",
      [
        ...(input.terminal.branch !== input.active_branch
          ? [`terminal branch ${input.terminal.branch} is not active branch ${input.active_branch}`]
          : []),
        ...(input.receipt.branch !== input.active_branch
          ? [`receipt branch ${input.receipt.branch} is not active branch ${input.active_branch}`]
          : []),
      ],
      "rebind terminal progress and live receipt to the active PR branch",
    );
  }

  if (input.terminal.head_sha !== input.receipt.head_sha) {
    return block(
      input,
      "block_receipt_mismatch",
      [`terminal head ${input.terminal.head_sha} does not match receipt head ${input.receipt.head_sha}`],
      "release only a packet whose terminal admission and live receipt share one head",
      [...input.terminal.decisive_evidence, ...input.receipt.decisive_evidence],
    );
  }

  if (input.release_class === "external_platform_embodiment") {
    if (input.status_claim !== "none" && input.status_readback_head_sha !== input.receipt.head_sha) {
      return block(
        input,
        "block_status_claim_before_readback",
        [
          input.status_readback_head_sha
            ? `status claim ${input.status_claim} belongs to ${input.status_readback_head_sha}, not release head ${input.receipt.head_sha}`
            : `status claim ${input.status_claim} has no readback bound to release head ${input.receipt.head_sha}`,
        ],
        "release the embodiment packet without a status claim, then read the moved-head checks",
        input.receipt.decisive_evidence,
      );
    }
  }

  return {
    ...base(input),
    ok: true,
    action: releaseActionFor(input.release_class),
    decisive_evidence: [
      `${input.repository_full_name}#${input.pr_number}`,
      ...input.terminal.decisive_evidence,
      ...input.receipt.decisive_evidence,
      ...(input.status_claim === "none"
        ? ["no status claim made in release packet"]
        : [`status ${input.status_claim} bound to ${input.status_readback_head_sha}`]),
    ],
    blockers: [],
    next_route:
      input.release_class === "external_platform_embodiment"
        ? "read status only for the packet head before making pass/fail claims"
        : "continue only from the packet head and release class recorded here",
  };
}
