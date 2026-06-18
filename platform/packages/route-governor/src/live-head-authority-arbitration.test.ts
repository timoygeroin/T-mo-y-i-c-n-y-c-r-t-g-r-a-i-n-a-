import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
      changed_files: ["platform/packages/route-governor/src/live-head-authority-arbitration.ts"],
      behavior_artifacts: ["arbitrateLiveHeadAuthority"],
      routing_artifacts: ["live authority surface citation gate"],
      proof_artifacts: ["live-head-authority-arbitration.test"],
    },
    ...overrides,
  };
}

describe("arbitrateLiveHeadAuthority", () => {
  it("admits an embodiment only when it cites direct live metadata authority", () => {
    const verdict = arbitrateLiveHeadAuthority(scenario());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_live_authority_embodiment");
    assert.deepEqual(verdict.accepted_authority_surface_ids, ["connector-live-pr-metadata"]);
    assert.ok(verdict.historical_head_shas.includes(PR_BODY_HEAD));
    assert.ok(verdict.historical_head_shas.includes(REPAIRED_HEAD));
  });

  it("blocks PR-body readback summaries from authorizing live-head progress", () => {
    const verdict = arbitrateLiveHeadAuthority(
      scenario({
        candidate: {
          ...scenario().candidate,
          authority_surface_ids: ["pr-body-fresh-readback-summary"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_untrusted_authority_surface");
    assert.ok(verdict.rejected_authority_surface_ids.includes("pr-body-fresh-readback-summary"));
  });

  it("blocks prompt-carried repaired heads from authorizing a new embodiment", () => {
    const verdict = arbitrateLiveHeadAuthority(
      scenario({
        candidate: {
          ...scenario().candidate,
          authority_surface_ids: ["scheduled-prompt-repaired-head"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_untrusted_authority_surface");
    assert.ok(verdict.rejected_authority_surface_ids.includes("scheduled-prompt-repaired-head"));
  });

  it("blocks candidates based on a PR-body head after metadata reports a newer live head", () => {
    const verdict = arbitrateLiveHeadAuthority(
      scenario({
        candidate: {
          ...scenario().candidate,
          base_head_sha: PR_BODY_HEAD,
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_candidate_base");
  });

  it("admits fresh status readback only when a direct live-head status surface is cited", () => {
    const verdict = arbitrateLiveHeadAuthority(
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

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_live_status_readback");
  });
});
