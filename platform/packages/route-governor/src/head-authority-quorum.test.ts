import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileHeadAuthorityQuorum, type HeadAuthorityQuorumInput } from "./head-authority-quorum.js";

function input(overrides: Partial<HeadAuthorityQuorumInput> = {}): HeadAuthorityQuorumInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    sources: [
      {
        source_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: "live-head",
        mergeable: true,
        evidence: ["PR #2 metadata readback"],
      },
      {
        source_id: "prompt-repaired-head",
        kind: "user_instruction",
        branch: "monday-platform-genesis-01",
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        status_verdict: "passing",
        evidence: ["prompt carried repaired head"],
      },
      {
        source_id: "pr-body-older-head",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: "older-pr-body-head",
        status_verdict: "passing_with_warnings",
        evidence: ["PR body names an older live-head readback"],
      },
      {
        source_id: "memory-older-head",
        kind: "memory_receipt",
        branch: "monday-platform-genesis-01",
        head_sha: "older-memory-head",
        evidence: ["local memory receipt names a prior branch head"],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: "live-head",
      changed_files: ["platform/packages/route-governor/src/head-authority-quorum.ts"],
      executable_artifacts: ["compileHeadAuthorityQuorum"],
      routing_artifacts: ["head authority quorum"],
      proof_artifacts: ["platform/packages/route-governor/src/head-authority-quorum-proof.ts"],
    },
    ...overrides,
  };
}

describe("compileHeadAuthorityQuorum", () => {
  it("admits a live-head embodiment while quarantining stale authority surfaces", () => {
    const verdict = compileHeadAuthorityQuorum(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_live_head_embodiment");
    assert.deepEqual(verdict.accepted_authority_ids, ["live-pr-metadata"]);
    assert.deepEqual(verdict.historical_authority_ids, ["prompt-repaired-head"]);
    assert.deepEqual(verdict.quarantined_authority_ids.sort(), ["memory-older-head", "pr-body-older-head"]);
    assert.deepEqual(verdict.summary_authority_ids.sort(), ["memory-older-head", "pr-body-older-head", "prompt-repaired-head"]);
  });

  it("blocks a stale candidate base even when stale summaries claim success", () => {
    const verdict = compileHeadAuthorityQuorum(
      input({
        candidate: {
          ...input().candidate,
          base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_candidate_base");
    assert.match(verdict.blockers.join("; "), /not live PR head/);
  });

  it("blocks fresh status readback without direct live-head status authority", () => {
    const verdict = compileHeadAuthorityQuorum(
      input({
        candidate: {
          ...input().candidate,
          move_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_status_readback");
    assert.match(verdict.blockers.join("; "), /no direct live-head status/);
  });

  it("admits direct live-head status readback when the quorum contains status authority", () => {
    const verdict = compileHeadAuthorityQuorum(
      input({
        sources: [
          ...input().sources,
          {
            source_id: "checks-live-head",
            kind: "direct_status_surface",
            branch: "monday-platform-genesis-01",
            head_sha: "live-head",
            status_verdict: "passing_with_warnings",
            evidence: ["Route governor proof examples succeeded"],
          },
        ],
        candidate: {
          ...input().candidate,
          move_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_live_status_readback");
    assert.deepEqual(verdict.accepted_authority_ids.sort(), ["checks-live-head", "live-pr-metadata"]);
  });

  it("blocks failure repair when only stale summary failures exist", () => {
    const verdict = compileHeadAuthorityQuorum(
      input({
        sources: [
          ...input().sources,
          {
            source_id: "stale-failure-summary",
            kind: "pr_body_summary",
            branch: "monday-platform-genesis-01",
            head_sha: "older-failing-head",
            status_verdict: "failing",
            evidence: ["old proof-examples failure"],
          },
        ],
        candidate: {
          ...input().candidate,
          move_class: "current_failure_repair",
          failure_signature: "old proof-examples failure",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_failure_repair");
    assert.match(verdict.blockers.join("; "), /stale failure summary/);
  });

  it("rejects non-progress move classes before release", () => {
    const verdict = compileHeadAuthorityQuorum(
      input({
        candidate: {
          ...input().candidate,
          move_class: "metadata_reread",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_move");
  });
});
