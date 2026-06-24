import { routePromptHeadMove, type PromptHeadMoveRouterInput } from "./prompt-head-move-router.js";

const BRANCH = "monday-platform-genesis-01";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const LIVE_HEAD = "9a883c7ec3fbfb9bd48ec1ddd85723c00fc22d3e";

function scenario(overrides: Partial<PromptHeadMoveRouterInput> = {}): PromptHeadMoveRouterInput {
  return {
    active_branch: BRANCH,
    expected_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    prompt_head_sha: REPAIRED_HEAD,
    last_repaired_head_sha: REPAIRED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    requested_progress_class: "fresh_status_readback",
    surfaces: [
      {
        surface_id: "scheduled-prompt-repaired-head",
        kind: "scheduled_prompt",
        branch: BRANCH,
        head_sha: REPAIRED_HEAD,
        evidence: [`scheduled prompt carried repaired head ${REPAIRED_HEAD}`],
      },
      {
        surface_id: "live-pr-metadata",
        kind: "pr_metadata",
        branch: BRANCH,
        head_sha: LIVE_HEAD,
        evidence: [`PR #2 live head ${LIVE_HEAD}`],
      },
    ],
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPromptHeadMoveRouterProof(): void {
  const moved = routePromptHeadMove(scenario());
  expect(moved.ok, `moved prompt head should admit fresh readback route: ${moved.blockers.join("; ")}`);
  expect(moved.action === "require_fresh_status_readback", `unexpected moved-head action ${moved.action}`);
  expect(
    moved.decisive_evidence.some((line) => line.includes(REPAIRED_HEAD) && line.includes(LIVE_HEAD)),
    "moved-head evidence must name both repaired prompt head and live head",
  );
  expect(
    moved.stale_surface_ids.includes("scheduled-prompt-repaired-head"),
    "scheduled repaired-head prompt must be classified as stale after live head moves",
  );

  const repairedBlocker = routePromptHeadMove(
    scenario({ requested_progress_class: "repaired_head_blocker" }),
  );
  expect(!repairedBlocker.ok, "repaired-head blocker reuse must not pass after live head moves");
  expect(
    repairedBlocker.action === "block_repaired_head_blocker_reuse",
    `unexpected repaired-blocker action ${repairedBlocker.action}`,
  );

  const liveStatus = routePromptHeadMove(
    scenario({
      surfaces: [
        {
          surface_id: "live-pr-metadata",
          kind: "pr_metadata",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: [`PR #2 live head ${LIVE_HEAD}`],
        },
        {
          surface_id: "live-status-checks",
          kind: "direct_status_surface",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: ["current-head status surface is available"],
        },
      ],
    }),
  );
  expect(liveStatus.ok, `live status surface should pass: ${liveStatus.blockers.join("; ")}`);
  expect(liveStatus.action === "admit_live_head_status_surface", `unexpected live-status action ${liveStatus.action}`);

  const sameHead = routePromptHeadMove(
    scenario({
      prompt_head_sha: LIVE_HEAD,
      last_status_readback_head_sha: LIVE_HEAD,
      requested_progress_class: "external_platform_embodiment",
      surfaces: [
        {
          surface_id: "live-pr-metadata",
          kind: "pr_metadata",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: [`PR #2 live head ${LIVE_HEAD}`],
        },
      ],
    }),
  );
  expect(sameHead.ok, `same-head continuation should pass: ${sameHead.blockers.join("; ")}`);
  expect(sameHead.action === "admit_same_head_continuation", `unexpected same-head action ${sameHead.action}`);
}

runPromptHeadMoveRouterProof();
