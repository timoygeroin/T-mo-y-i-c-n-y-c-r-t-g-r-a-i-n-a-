import { compileBranchProtectionReadiness, type BranchProtectionReadinessInput } from "./branch-protection-readiness.js";

const head = "765137c22cc6fc4e02568b44b8e0f049b9e77749";

function proofInput(overrides: Partial<BranchProtectionReadinessInput> = {}): BranchProtectionReadinessInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    rule_source: {
      source_id: "branch-protection-ruleset-proof",
      branch: "monday-platform-genesis-01",
      require_status_contexts: ["Monday Platform CI", "Route Governor Proof"],
      required_approving_review_count: 1,
      evidence: ["branch protection requires status and approving review before merge handoff"],
    },
    statuses: [
      {
        context: "Monday Platform CI",
        head_sha: head,
        state: "success",
        evidence: ["CI success on live head"],
      },
      {
        context: "Route Governor Proof",
        head_sha: head,
        state: "success",
        evidence: ["proof success on live head"],
      },
    ],
    reviews: [
      {
        reviewer: "platform-review-team",
        head_sha: head,
        state: "approved",
        evidence: ["approval on live head"],
      },
    ],
    ...overrides,
  };
}

function assertAction(name: string, input: BranchProtectionReadinessInput, action: string, ok: boolean): void {
  const verdict = compileBranchProtectionReadiness(input);
  if (verdict.ok !== ok || verdict.action !== action) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runBranchProtectionReadinessProof(): void {
  assertAction("ready branch protection", proofInput(), "branch_protection_ready", true);
  assertAction(
    "stale repaired-head evidence",
    proofInput({
      statuses: [
        {
          context: "Monday Platform CI",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          state: "success",
          evidence: ["old repaired-head success"],
        },
      ],
    }),
    "block_stale_evidence_head",
    false,
  );
  assertAction("missing required approval", proofInput({ reviews: [] }), "route_to_required_review", false);
}

runBranchProtectionReadinessProof();
