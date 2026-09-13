import {
  admitSuccessorPrOpeningReceipt,
  type SuccessorPrOpeningReceiptInput,
} from "./successor-pr-opening-receipt.js";

function input(overrides: Partial<SuccessorPrOpeningReceiptInput> = {}): SuccessorPrOpeningReceiptInput {
  return {
    receipt_id: "successor-pr-opening-receipt-proof",
    spent_receipt_ids: [],
    consumed_pr: {
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
      merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
      merged: true,
      state: "closed",
    },
    successor_pr: {
      pr_number: 3,
      branch: "monday-platform-genesis-02",
      head_sha: "successor-head",
      state: "open",
      base_branch: "main",
    },
    expected_successor_branch: "monday-platform-genesis-02",
    expected_successor_head_sha: "successor-head",
    executable_delta_files: ["platform/packages/route-governor/src/successor-pr-opening-receipt.ts"],
    routing_artifacts: ["successor PR opening receipt routes continuation away from consumed PR #2"],
    ...overrides,
  };
}

function expectAction(name: string, value: SuccessorPrOpeningReceiptInput, action: string, ok: boolean): void {
  const verdict = admitSuccessorPrOpeningReceipt(value);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runSuccessorPrOpeningReceiptProof(): void {
  expectAction("open successor PR admitted", input(), "admit_successor_pr_sink", true);

  expectAction(
    "consumed PR cannot be reused",
    input({
      successor_pr: {
        pr_number: 2,
        branch: "monday-platform-genesis-01",
        head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
        state: "closed",
        base_branch: "main",
      },
    }),
    "block_consumed_pr_reuse",
    false,
  );

  expectAction(
    "closed successor PR is blocked",
    input({
      successor_pr: {
        ...input().successor_pr,
        state: "closed",
      },
    }),
    "block_closed_successor_pr",
    false,
  );

  expectAction(
    "moved successor head requires readback",
    input({
      successor_pr: {
        ...input().successor_pr,
        head_sha: "moved-head",
      },
    }),
    "block_branch_or_head_mismatch",
    false,
  );

  expectAction(
    "non-executable receipt is blocked",
    input({ executable_delta_files: ["README.md"] }),
    "block_missing_executable_delta",
    false,
  );

  expectAction(
    "routing artifact required",
    input({ routing_artifacts: [] }),
    "block_missing_routing_artifact",
    false,
  );

  expectAction(
    "receipt cannot be reused",
    input({ spent_receipt_ids: ["successor-pr-opening-receipt-proof"] }),
    "block_reused_receipt",
    false,
  );
}

runSuccessorPrOpeningReceiptProof();
