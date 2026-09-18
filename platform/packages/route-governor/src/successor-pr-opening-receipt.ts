export type SuccessorPrOpeningReceiptAction =
  | "admit_successor_pr_sink"
  | "block_reused_receipt"
  | "block_consumed_pr_reuse"
  | "block_closed_successor_pr"
  | "block_branch_or_head_mismatch"
  | "block_missing_executable_delta"
  | "block_missing_routing_artifact";

export interface ConsumedPrSurface {
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_commit_sha: string;
  merged: boolean;
  state: "open" | "closed";
}

export interface SuccessorPrSurface {
  pr_number: number;
  branch: string;
  head_sha: string;
  state: "open" | "closed";
  base_branch: string;
}

export interface SuccessorPrOpeningReceiptInput {
  receipt_id: string;
  spent_receipt_ids: string[];
  consumed_pr: ConsumedPrSurface;
  successor_pr: SuccessorPrSurface;
  expected_successor_branch: string;
  expected_successor_head_sha: string;
  executable_delta_files: string[];
  routing_artifacts: string[];
}

export interface SuccessorPrOpeningReceiptVerdict {
  ok: boolean;
  action: SuccessorPrOpeningReceiptAction;
  receipt_id: string | null;
  consumed_pr_number: number;
  successor_pr_number: number | null;
  successor_branch: string;
  successor_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableDeltas(paths: string[]): string[] {
  return [...new Set(paths)]
    .map((path) => path.trim())
    .filter((path) => path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path))
    .sort((left, right) => left.localeCompare(right));
}

function evidence(input: SuccessorPrOpeningReceiptInput): string[] {
  return [
    `receipt ${input.receipt_id.trim() || "<missing>"}`,
    `consumed PR #${input.consumed_pr.pr_number}`,
    `consumed merge ${input.consumed_pr.merge_commit_sha}`,
    `successor PR #${input.successor_pr.pr_number}`,
    `successor branch ${input.successor_pr.branch}`,
    `successor head ${input.successor_pr.head_sha}`,
    ...executableDeltas(input.executable_delta_files).map((path) => `executable delta ${path}`),
    ...input.routing_artifacts,
  ];
}

function block(
  input: SuccessorPrOpeningReceiptInput,
  action: Exclude<SuccessorPrOpeningReceiptAction, "admit_successor_pr_sink">,
  blockers: string[],
  nextRoute: string,
): SuccessorPrOpeningReceiptVerdict {
  return {
    ok: false,
    action,
    receipt_id: input.receipt_id.trim() || null,
    consumed_pr_number: input.consumed_pr.pr_number,
    successor_pr_number: input.successor_pr.pr_number || null,
    successor_branch: input.successor_pr.branch,
    successor_head_sha: input.successor_pr.head_sha,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

export function admitSuccessorPrOpeningReceipt(
  input: SuccessorPrOpeningReceiptInput,
): SuccessorPrOpeningReceiptVerdict {
  const receiptId = input.receipt_id.trim();

  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_reused_receipt",
      [receiptId ? `successor PR opening receipt already spent: ${receiptId}` : "successor PR opening receipt has no id"],
      "capture a new successor PR opening receipt before claiming post-merge continuation progress",
    );
  }

  if (!input.consumed_pr.merged || input.consumed_pr.state !== "closed" || !input.consumed_pr.merge_commit_sha.trim()) {
    return block(
      input,
      "block_consumed_pr_reuse",
      [`PR #${input.consumed_pr.pr_number} has not been proven consumed by merge`],
      "prove the prior PR is merged and closed before successor PR routing",
    );
  }

  if (input.successor_pr.pr_number === input.consumed_pr.pr_number) {
    return block(
      input,
      "block_consumed_pr_reuse",
      [`PR #${input.consumed_pr.pr_number} is consumed and cannot be reopened as the successor sink`],
      "open a distinct successor PR before continuing post-merge embodiment",
    );
  }

  if (input.successor_pr.state !== "open") {
    return block(
      input,
      "block_closed_successor_pr",
      [`successor PR #${input.successor_pr.pr_number} is not open`],
      "open or select an open successor PR before claiming continuation progress",
    );
  }

  if (
    input.successor_pr.branch !== input.expected_successor_branch ||
    input.successor_pr.head_sha !== input.expected_successor_head_sha
  ) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [
        `successor surface ${input.successor_pr.branch}@${input.successor_pr.head_sha} does not match expected ${input.expected_successor_branch}@${input.expected_successor_head_sha}`,
      ],
      "read back the live successor PR head before admitting the receipt",
    );
  }

  const deltas = executableDeltas(input.executable_delta_files);
  if (deltas.length === 0) {
    return block(
      input,
      "block_missing_executable_delta",
      ["successor PR opening receipt has no executable platform delta"],
      "attach an executable platform delta before treating successor sink creation as embodiment progress",
    );
  }

  if (input.routing_artifacts.length === 0) {
    return block(
      input,
      "block_missing_routing_artifact",
      ["successor PR opening receipt has no routing artifact"],
      "attach a future-routing artifact before admitting successor PR continuation",
    );
  }

  return {
    ok: true,
    action: "admit_successor_pr_sink",
    receipt_id: receiptId,
    consumed_pr_number: input.consumed_pr.pr_number,
    successor_pr_number: input.successor_pr.pr_number,
    successor_branch: input.successor_pr.branch,
    successor_head_sha: input.successor_pr.head_sha,
    decisive_evidence: evidence(input),
    blockers: [],
    next_route: "continue finalization on the open successor PR; do not add new embodiment increments to the consumed merged PR surface",
  };
}
