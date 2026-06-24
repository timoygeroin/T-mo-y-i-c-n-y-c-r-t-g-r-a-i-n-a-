import {
  gateSuccessorHeadProgress,
  type SuccessorHeadProgressInput,
} from "./successor-head-progress-gate.js";

const BRANCH = "monday-platform-genesis-01";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const SUCCESSOR_HEAD = "d8aec6659324aeba6af142a07b6d509716fbcc32";

function scenario(overrides: Partial<SuccessorHeadProgressInput> = {}): SuccessorHeadProgressInput {
  return {
    active_branch: BRANCH,
    live_head_sha: SUCCESSOR_HEAD,
    repaired_head_sha: REPAIRED_HEAD,
    repaired_head_status_resolved: true,
    last_status_readback_head_sha: REPAIRED_HEAD,
    closed_blocker_ids: ["issue-1-closed-completed", "blocked:ci-status-readback"],
    live_status_verdict: "passing_with_warnings",
    candidate: {
      progress_class: "external_platform_embodiment",
      branch: BRANCH,
      base_head_sha: SUCCESSOR_HEAD,
      changed_files: [
        "platform/packages/route-governor/src/successor-head-progress-gate.ts",
        "platform/packages/route-governor/src/successor-head-progress-gate-proof.ts",
      ],
      executable_artifacts: ["gateSuccessorHeadProgress"],
      routing_artifacts: ["successor-head post-readback progress gate"],
      proof_artifacts: ["successor-head-progress-gate-proof"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runSuccessorHeadProgressGateProof(): void {
  const admitted = gateSuccessorHeadProgress(scenario());
  expect(admitted.ok, `expected successor embodiment admission: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_successor_embodiment", `unexpected action ${admitted.action}`);
  expect(admitted.successor_head, "live head must be recognized as successor to repaired head");
  expect(admitted.retired_head_shas.includes(REPAIRED_HEAD), "repaired head must be retired as historical evidence");
  expect(
    admitted.retired_blocker_ids.includes("blocked:ci-status-readback"),
    "closed status-readback blocker must be retired as non-repeatable evidence",
  );

  const repairedReplay = gateSuccessorHeadProgress(
    scenario({
      live_head_sha: REPAIRED_HEAD,
      last_status_readback_head_sha: REPAIRED_HEAD,
      candidate: {
        progress_class: "repaired_head_status_replay",
        branch: BRANCH,
        base_head_sha: REPAIRED_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expect(!repairedReplay.ok, "repaired-head status replay must not be admitted");
  expect(repairedReplay.action === "block_repaired_head_replay", `unexpected replay action ${repairedReplay.action}`);

  const staleBase = gateSuccessorHeadProgress(
    scenario({
      candidate: {
        progress_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: REPAIRED_HEAD,
        changed_files: ["platform/packages/route-governor/src/successor-head-progress-gate.ts"],
        executable_artifacts: ["gateSuccessorHeadProgress"],
        routing_artifacts: ["successor-head post-readback progress gate"],
        proof_artifacts: ["successor-head-progress-gate-proof"],
      },
    }),
  );
  expect(!staleBase.ok, "candidate based on repaired head must be blocked after successor head appears");
  expect(staleBase.action === "block_repaired_head_replay", `unexpected stale-base action ${staleBase.action}`);

  const proofOnly = gateSuccessorHeadProgress(
    scenario({
      candidate: {
        progress_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: SUCCESSOR_HEAD,
        changed_files: ["platform/packages/route-governor/src/successor-head-progress-gate-proof.ts"],
        executable_artifacts: ["gateSuccessorHeadProgress"],
        routing_artifacts: ["successor-head post-readback progress gate"],
        proof_artifacts: ["successor-head-progress-gate-proof"],
      },
    }),
  );
  expect(!proofOnly.ok, "proof-only successor embodiment must not count as behavior progress");
  expect(proofOnly.action === "block_incomplete_embodiment", `unexpected proof-only action ${proofOnly.action}`);

  const movedReadback = gateSuccessorHeadProgress(
    scenario({
      candidate: {
        progress_class: "fresh_status_readback",
        branch: BRANCH,
        base_head_sha: SUCCESSOR_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expect(movedReadback.ok, `successor-head readback should be admitted: ${movedReadback.blockers.join("; ")}`);
  expect(movedReadback.action === "admit_successor_status_readback", `unexpected readback action ${movedReadback.action}`);

  const exactBlocker = gateSuccessorHeadProgress(
    scenario({
      candidate: {
        progress_class: "exact_external_blocker",
        branch: BRANCH,
        base_head_sha: SUCCESSOR_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "live successor-head Checks surface is unreachable from the connector",
      },
    }),
  );
  expect(exactBlocker.ok, `exact blocker should be admitted: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "emit_successor_exact_blocker", `unexpected blocker action ${exactBlocker.action}`);
}

runSuccessorHeadProgressGateProof();
