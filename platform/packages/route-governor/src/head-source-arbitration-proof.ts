import { arbitrateHeadSources, type HeadSourceArbitrationInput } from "./head-source-arbitration.js";

const branch = "monday-platform-genesis-01";
const liveHead = "33b2839902222146e6ac9b3699b2b4d333188f26";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const prBodyHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";
const stalePublicChecksHead = "dcc3d553e4ef41cd6eeeb7f54eba7f03388c3e0f";

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
        source_id: "public-checks-page-stale",
        kind: "public_checks_page",
        head_sha: stalePublicChecksHead,
        status_verdict: "passing_with_warnings",
        evidence: ["public PR checks page shows dcc3d55 succeeded with only the Node.js 20 warning"],
      },
      {
        source_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        head_sha: liveHead,
        evidence: ["GitHub PR metadata reports live head 33b2839"],
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
  assert(
    moved.decisive_evidence.some((line) => line.includes("public_checks_page") && line.includes(stalePublicChecksHead)),
    "stale public checks page must be named as stale evidence",
  );

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
          evidence: ["GitHub PR metadata reports live head 33b2839"],
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

  const livePublicChecks = arbitrateHeadSources(
    input({
      sources: [
        {
          source_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          head_sha: liveHead,
          evidence: ["GitHub PR metadata reports live head 33b2839"],
        },
        {
          source_id: "live-public-checks-page",
          kind: "public_checks_page",
          head_sha: liveHead,
          status_verdict: "passing_with_warnings",
          evidence: [
            "public PR checks page shows seven check groups for the live head",
            "Node.js 20 actions deprecation warning remains non-blocking",
          ],
        },
      ],
    }),
  );
  assert(livePublicChecks.ok, `live public checks should be accepted: ${livePublicChecks.blockers.join("; ")}`);
  assert(livePublicChecks.action === "accept_live_status", `expected accept_live_status, got ${livePublicChecks.action}`);
  assert(livePublicChecks.accepted_source_id === "live-public-checks-page", "live public checks should be the accepted status source");
  assert(livePublicChecks.warnings.length === 1, "Node.js 20 warning should remain a warning");
}

runHeadSourceArbitrationProof();
