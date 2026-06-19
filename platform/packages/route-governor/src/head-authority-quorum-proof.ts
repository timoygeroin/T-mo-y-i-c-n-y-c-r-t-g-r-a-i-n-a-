import { compileHeadAuthorityQuorum, type HeadAuthorityQuorumInput } from "./head-authority-quorum.js";

function proofInput(overrides: Partial<HeadAuthorityQuorumInput> = {}): HeadAuthorityQuorumInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "f90189a0ab1d6ab4fe858c8657c271849f0c66aa",
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    sources: [
      {
        source_id: "live-pr-metadata-f90189a",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: "f90189a0ab1d6ab4fe858c8657c271849f0c66aa",
        mergeable: true,
        evidence: ["PR #2 connector metadata reports live head f90189a0ab1d6ab4fe858c8657c271849f0c66aa"],
      },
      {
        source_id: "prompt-repaired-head-b38ea24",
        kind: "user_instruction",
        branch: "monday-platform-genesis-01",
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        status_verdict: "passing",
        evidence: ["current scheduled prompt preserves repaired-head success only as resolved boundary"],
      },
      {
        source_id: "pr-body-head-3bf8e07",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
        status_verdict: "passing_with_warnings",
        evidence: ["PR body names an older fresh live-head readback"],
      },
      {
        source_id: "memory-head-2ec7706",
        kind: "memory_receipt",
        branch: "monday-platform-genesis-01",
        head_sha: "2ec77068cb2df8e3c65890e24ca1e88f15675feb",
        evidence: ["memory receipt names a prior post-write escrow head"],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: "f90189a0ab1d6ab4fe858c8657c271849f0c66aa",
      changed_files: ["platform/packages/route-governor/src/head-authority-quorum.ts"],
      executable_artifacts: ["compileHeadAuthorityQuorum"],
      routing_artifacts: ["head authority quorum"],
      proof_artifacts: ["platform/packages/route-governor/src/head-authority-quorum-proof.ts"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runHeadAuthorityQuorumProof(): void {
  const admitted = compileHeadAuthorityQuorum(proofInput());
  expect(admitted.ok, `live-head quorum should admit embodiment: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_live_head_embodiment", `unexpected action: ${admitted.action}`);
  expect(
    admitted.historical_authority_ids.includes("prompt-repaired-head-b38ea24"),
    "resolved repaired head must be preserved as historical authority",
  );
  expect(
    admitted.quarantined_authority_ids.includes("pr-body-head-3bf8e07") &&
      admitted.quarantined_authority_ids.includes("memory-head-2ec7706"),
    "older PR-body and memory heads must be quarantined",
  );

  const staleBase = compileHeadAuthorityQuorum(
    proofInput({
      candidate: {
        ...proofInput().candidate,
        base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );
  expect(!staleBase.ok, "stale repaired head must not authorize a new embodiment base");
  expect(staleBase.action === "block_stale_candidate_base", `unexpected stale-base action: ${staleBase.action}`);

  const replayedStatus = compileHeadAuthorityQuorum(
    proofInput({
      candidate: {
        ...proofInput().candidate,
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expect(!replayedStatus.ok, "summary-only status readback must not pass as fresh status");
  expect(replayedStatus.action === "block_stale_status_readback", `unexpected readback action: ${replayedStatus.action}`);
}

runHeadAuthorityQuorumProof();
