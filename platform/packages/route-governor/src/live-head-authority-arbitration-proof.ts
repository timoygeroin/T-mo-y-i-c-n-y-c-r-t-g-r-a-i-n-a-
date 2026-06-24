import {
  arbitrateLiveHeadAuthority,
  type LiveHeadAuthorityInput,
} from "./live-head-authority-arbitration.js";

const LIVE_HEAD = "c0ab1f8014b2eb4fd01fa03b8ee8bdc5bb1a468f";
const PR_BODY_HEAD = "3bf8e07dce32e59accf776357fb22278f57ba3f5";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function scenario(overrides: Partial<LiveHeadAuthorityInput> = {}): LiveHeadAuthorityInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    last_status_readback_head_sha: PR_BODY_HEAD,
    resolved_historical_heads: [REPAIRED_HEAD],
    surfaces: [
      {
        surface_id: "connector-live-pr-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: LIVE_HEAD,
        evidence: [`connector metadata reports live PR head ${LIVE_HEAD}`],
      },
      {
        surface_id: "pr-body-fresh-readback-summary",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: PR_BODY_HEAD,
        status_verdict: "passing_with_warnings",
        evidence: [`PR body says fresh live-head readback was ${PR_BODY_HEAD}`],
      },
      {
        surface_id: "scheduled-prompt-repaired-head",
        kind: "prompt_instruction",
        branch: "monday-platform-genesis-01",
        head_sha: REPAIRED_HEAD,
        status_verdict: "passing_with_warnings",
        evidence: [`scheduled prompt carried repaired head ${REPAIRED_HEAD}`],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: LIVE_HEAD,
      authority_surface_ids: ["connector-live-pr-metadata"],
      changed_files: [
        "platform/packages/route-governor/src/live-head-authority-arbitration.ts",
        "platform/packages/route-governor/src/live-head-authority-arbitration-proof.ts",
      ],
      behavior_artifacts: ["arbitrateLiveHeadAuthority"],
      routing_artifacts: ["live authority surface citation gate"],
      proof_artifacts: ["live-head-authority-arbitration-proof"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runLiveHeadAuthorityArbitrationProof(): void {
  const admitted = arbitrateLiveHeadAuthority(scenario());
  expect(admitted.ok, `expected live authority embodiment admission: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_live_authority_embodiment", `unexpected admitted action ${admitted.action}`);
  expect(
    admitted.accepted_authority_surface_ids.includes("connector-live-pr-metadata"),
    "connector metadata must be accepted as the live authority surface",
  );
  expect(
    admitted.historical_head_shas.includes(PR_BODY_HEAD) && admitted.historical_head_shas.includes(REPAIRED_HEAD),
    "non-live PR-body and repaired heads must be historical, not current authority",
  );

  const prBodyAuthority = arbitrateLiveHeadAuthority(
    scenario({
      candidate: {
        ...scenario().candidate,
        authority_surface_ids: ["pr-body-fresh-readback-summary"],
      },
    }),
  );
  expect(!prBodyAuthority.ok, "PR-body summary must not authorize a live embodiment");
  expect(
    prBodyAuthority.action === "block_untrusted_authority_surface",
    `unexpected PR-body authority action ${prBodyAuthority.action}`,
  );
  expect(
    prBodyAuthority.rejected_authority_surface_ids.includes("pr-body-fresh-readback-summary"),
    "PR-body readback summary must be rejected when connector metadata has a newer live head",
  );

  const stalePromptAuthority = arbitrateLiveHeadAuthority(
    scenario({
      candidate: {
        ...scenario().candidate,
        authority_surface_ids: ["scheduled-prompt-repaired-head"],
      },
    }),
  );
  expect(!stalePromptAuthority.ok, "scheduled prompt repaired head must not authorize a live embodiment");
  expect(
    stalePromptAuthority.action === "block_untrusted_authority_surface",
    `unexpected scheduled prompt action ${stalePromptAuthority.action}`,
  );

  const staleBase = arbitrateLiveHeadAuthority(
    scenario({
      candidate: {
        ...scenario().candidate,
        base_head_sha: PR_BODY_HEAD,
      },
    }),
  );
  expect(!staleBase.ok, "candidate based on PR-body head must not pass");
  expect(staleBase.action === "block_stale_candidate_base", `unexpected stale-base action ${staleBase.action}`);

  const statusReadback = arbitrateLiveHeadAuthority(
    scenario({
      surfaces: [
        ...scenario().surfaces,
        {
          surface_id: "direct-live-status",
          kind: "direct_status_surface",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          status_verdict: "passing_with_warnings",
          evidence: ["direct status surface for the connector live head passed with warning-only notices"],
        },
      ],
      candidate: {
        ...scenario().candidate,
        move_class: "fresh_status_readback",
        authority_surface_ids: ["connector-live-pr-metadata", "direct-live-status"],
        changed_files: [],
        behavior_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expect(statusReadback.ok, `direct live status readback should pass: ${statusReadback.blockers.join("; ")}`);
  expect(statusReadback.action === "admit_live_status_readback", `unexpected status action ${statusReadback.action}`);

  const duplicateSummary = arbitrateLiveHeadAuthority(
    scenario({
      candidate: {
        ...scenario().candidate,
        move_class: "duplicate_ci_summary",
      },
    }),
  );
  expect(!duplicateSummary.ok, "duplicate CI summary must not carry live authority");
  expect(duplicateSummary.action === "block_non_progress_move", `unexpected duplicate action ${duplicateSummary.action}`);
}

runLiveHeadAuthorityArbitrationProof();
