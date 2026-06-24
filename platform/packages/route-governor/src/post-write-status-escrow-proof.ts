import { runCurrentTurnManifestationGateProof } from "./current-turn-manifestation-gate-proof.js";
import { openPostWriteStatusEscrow, type PostWriteStatusEscrowInput } from "./post-write-status-escrow.js";

const baseHead = "d70bdc1134e9a326507f15426c9b91abca408de2";
const movedHead = "post-write-status-escrow-head";

function baseInput(overrides: Partial<PostWriteStatusEscrowInput> = {}): PostWriteStatusEscrowInput {
  return {
    active_branch: "monday-platform-genesis-01",
    branch: "monday-platform-genesis-01",
    base_head_sha: baseHead,
    resulting_head_sha: movedHead,
    repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_escrow_ids: [],
    escrow_id: "post-write-status-escrow",
    write_receipt: {
      commit_sha: movedHead,
      changed_files: ["platform/packages/route-governor/src/post-write-status-escrow.ts"],
      behavior_artifacts: ["openPostWriteStatusEscrow"],
      routing_artifacts: ["moved-head status escrow"],
    },
    status_claims: [],
    requested_next_action: "fresh_status_readback",
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runPostWriteStatusEscrowProof(): void {
  const opened = openPostWriteStatusEscrow(baseInput());
  expectOk("post-write status escrow", opened.ok, opened.blockers);
  if (opened.action !== "open_post_write_status_escrow") {
    throw new Error(`unexpected escrow action: ${opened.action}`);
  }
  if (opened.required_status_head_sha !== movedHead) {
    throw new Error("post-write escrow did not require the moved head");
  }

  const staleStatus = openPostWriteStatusEscrow(
    baseInput({
      status_claims: [
        {
          source_id: "old-repaired-head-checks",
          branch: "monday-platform-genesis-01",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          conclusion: "success",
          evidence: ["seven repaired-head checks succeeded"],
        },
      ],
    }),
  );
  expectBlock("stale status authority", staleStatus.ok, staleStatus.blockers, "not post-write-status-escrow-head");

  const failingStatus = openPostWriteStatusEscrow(
    baseInput({
      status_claims: [
        {
          source_id: "moved-head-route-governor-proof",
          branch: "monday-platform-genesis-01",
          head_sha: movedHead,
          conclusion: "failure",
          evidence: ["Route governor proof examples failed"],
        },
      ],
    }),
  );
  expectBlock("moved-head failure status", failingStatus.ok, failingStatus.blockers, "Route governor proof examples failed");
  if (failingStatus.action !== "block_failing_status_authority") {
    throw new Error(`unexpected failing status action: ${failingStatus.action}`);
  }

  const pendingStatus = openPostWriteStatusEscrow(
    baseInput({
      status_claims: [
        {
          source_id: "moved-head-checks-pending",
          branch: "monday-platform-genesis-01",
          head_sha: movedHead,
          conclusion: "pending",
          evidence: ["Route Governor Proof queued"],
        },
      ],
    }),
  );
  expectBlock("moved-head pending status", pendingStatus.ok, pendingStatus.blockers, "Route Governor Proof queued");
  if (pendingStatus.action !== "block_pending_status_authority") {
    throw new Error(`unexpected pending status action: ${pendingStatus.action}`);
  }

  const prematureMerge = openPostWriteStatusEscrow(baseInput({ requested_next_action: "merge_command" }));
  expectBlock("premature merge", prematureMerge.ok, prematureMerge.blockers, "cannot consume the branch");

  const noBehaviorReceipt = openPostWriteStatusEscrow(
    baseInput({
      write_receipt: {
        commit_sha: movedHead,
        changed_files: ["platform/packages/route-governor/src/post-write-status-escrow-proof.ts"],
        behavior_artifacts: [],
        routing_artifacts: ["moved-head status escrow"],
      },
    }),
  );
  expectBlock("missing behavior receipt", noBehaviorReceipt.ok, noBehaviorReceipt.blockers, "behavior-bearing");

  const headBoundStatus = openPostWriteStatusEscrow(
    baseInput({
      status_claims: [
        {
          source_id: "moved-head-checks",
          branch: "monday-platform-genesis-01",
          head_sha: movedHead,
          conclusion: "warning_only",
          evidence: ["Route Governor Proof succeeded", "Node.js 20 notice remains warning-only"],
        },
      ],
    }),
  );
  expectOk("head-bound status release", headBoundStatus.ok, headBoundStatus.blockers);
  if (headBoundStatus.action !== "release_head_bound_status") {
    throw new Error(`unexpected head-bound status action: ${headBoundStatus.action}`);
  }
}

runCurrentTurnManifestationGateProof();
runPostWriteStatusEscrowProof();