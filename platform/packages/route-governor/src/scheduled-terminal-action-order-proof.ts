import {
  compileScheduledTerminalActionOrder,
  type ScheduledTerminalActionOrderInput,
} from "./scheduled-terminal-action-order.js";

function base(overrides: Partial<ScheduledTerminalActionOrderInput> = {}): ScheduledTerminalActionOrderInput {
  return {
    order_id: "scheduled-terminal-action-order-proof",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    prompt_head_sha: "live-head",
    previous_status_head_sha: "previous-status-head",
    repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_order_ids: [],
    spent_candidate_ids: [],
    candidates: [
      {
        candidate_id: "proof-embodiment",
        kind: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        evidence: ["live PR head read before write"],
        changed_files: ["platform/packages/route-governor/src/scheduled-terminal-action-order.ts"],
        behavior_exports: ["compileScheduledTerminalActionOrder"],
        routing_effects: ["scheduled finalization collapses to one live-head terminal action"],
      },
    ],
    ...overrides,
  };
}

function expectAction(name: string, input: ScheduledTerminalActionOrderInput, action: string, ok: boolean): void {
  const verdict = compileScheduledTerminalActionOrder(input);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runScheduledTerminalActionOrderProof(): void {
  expectAction("embodiment terminal order", base(), "admit_external_platform_embodiment", true);

  expectAction(
    "old repaired head replay",
    base({ prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    "block_repaired_head_replay",
    false,
  );

  expectAction(
    "duplicate ci summary",
    base({
      candidates: [
        {
          candidate_id: "duplicate-ci-summary",
          kind: "duplicate_ci_summary",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["old CI summary"],
        },
      ],
    }),
    "block_non_progress_candidate",
    false,
  );

  expectAction(
    "earned fresh status",
    base({
      previous_status_head_sha: "live-head",
      candidates: [
        {
          candidate_id: "new-current-head-check",
          kind: "fresh_status_readback",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["new current-head check surfaced"],
          check_run_ids: ["fresh-check-run"],
        },
      ],
    }),
    "admit_fresh_status_readback",
    true,
  );

  expectAction(
    "exact blocker",
    base({
      candidates: [
        {
          candidate_id: "external-blocker",
          kind: "exact_external_blocker",
          branch: "monday-platform-genesis-01",
          head_sha: "live-head",
          evidence: ["write API returned permission failure"],
          exact_blocker: "GitHub contents API rejected branch write",
        },
      ],
    }),
    "emit_exact_external_blocker",
    true,
  );
}

runScheduledTerminalActionOrderProof();
