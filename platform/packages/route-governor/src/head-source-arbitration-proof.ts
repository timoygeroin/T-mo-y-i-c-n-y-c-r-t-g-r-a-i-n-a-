import { arbitrateHeadSources, type HeadSourceArbitrationInput } from "./head-source-arbitration.js";

const branch = "monday-platform-genesis-01";
const liveHead = "ca93bbd5d0698cbffeae5457a1922d779cf471e2";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const prBodyHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function input(overrides: Partial<HeadSourceArbitrationInput> = {}): HeadSourceArbitrationInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    prohibited_heads: [],
    prohibited_blockers: ["repaired-head status-readback blocker for b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    sources: [
      {
        source_id: "prompt-carried-repaired-head",
        kind: "prompt",
        head_sha: promptHead,
        status_verdict: "passing_with_warnings",
        evidence: ["prompt says repaired head b38ea247 succeeded"],
      },
      {
        source_id: "pr-body-moved-head-failure",
        kind: "pr_body_readback",
        head_sha: prBodyHead,
        status_verdict: "failing",
        evidence: ["PR body says df3a403 failed Run proof examples"],
      },
      {
        source_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        head_sha: liveHead,
        evidence: ["GitHub PR metadata reports live head ca93bbd"],
      },
    ],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runHeadSourceArbitrationProof(): void {
  const moved = arbitrateHeadSources(input());
  assert(moved.ok, `moved live head should route to status readback: ${moved.blockers.join("; ")}`);
  assert(moved.action === "read_live_head_status", `expected read_live_head_status, got ${moved.action}`);
  assert(moved.head_sha === liveHead, `expected live head ${liveHead}, got ${moved.head_sha}`);

  const prohibited = arbitrateHeadSources(
    input({ attempted_blocker: "repaired-head status-readback blocker for b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );
  assert(!prohibited.ok, "prohibited repaired-head blocker must not pass after live head movement");
  assert(prohibited.action === "block_stale_source", `expected block_stale_source, got ${prohibited.action}`);

  const liveFailure = arbitrateHeadSources(
    input({
      sources: [
        {
          source_id: "prompt-carried-repaired-head",
          kind: "prompt",
          head_sha: promptHead,
          status_verdict: "passing_with_warnings",
          evidence: ["prompt says repaired head b38ea247 succeeded"],
        },
        {
          source_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          head_sha: liveHead,
          evidence: ["GitHub PR metadata reports live head ca93bbd"],
        },
        {
          source_id: "live-actions-failure",
          kind: "actions_readback",
          head_sha: liveHead,
          status_verdict: "failing",
          evidence: ["Run proof examples failed on live head"],
        },
      ],
    }),
  );
  assert(!liveFailure.ok, "live-head failure must not be hidden behind stale repaired-head success");
  assert(liveFailure.action === "repair_live_failure", `expected repair_live_failure, got ${liveFailure.action}`);
}

runHeadSourceArbitrationProof();
