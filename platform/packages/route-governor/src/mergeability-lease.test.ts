import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileMergeabilityLease, type MergeabilityLeaseInput } from "./mergeability-lease.js";

const liveHead = "fc98d7cb5ba3ce0285d1d38d120120afb2d8c899";

function baseInput(overrides: Partial<MergeabilityLeaseInput> = {}): MergeabilityLeaseInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    lease_id: "mergeability-live-head-001",
    spent_lease_ids: [],
    target: "merge_command",
    source: {
      source_id: "pr-2-live-metadata",
      kind: "live_pr_metadata",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      mergeable: true,
      evidence: ["PR #2 metadata mergeable true"],
    },
    ...overrides,
  };
}

describe("compileMergeabilityLease", () => {
  it("admits mergeability only from live PR metadata bound to the current head", () => {
    const verdict = compileMergeabilityLease(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_mergeability_lease");
    assert.equal(verdict.head_sha, liveHead);
    assert.equal(verdict.lease_id, "mergeability-live-head-001");
    assert.ok(verdict.decisive_evidence.includes("mergeable true"));
  });

  it("blocks PR body summaries as mergeability authority", () => {
    const verdict = compileMergeabilityLease(
      baseInput({
        source: {
          ...baseInput().source,
          source_id: "pr-body-mergeable-summary",
          kind: "pr_body_summary",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_live_source");
    assert.match(verdict.blockers.join("; "), /pr_body_summary/);
  });

  it("blocks mergeability attached to a stale head", () => {
    const verdict = compileMergeabilityLease(
      baseInput({
        source: {
          ...baseInput().source,
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_head");
  });

  it("blocks missing or false mergeability verdicts", () => {
    const missing = compileMergeabilityLease(
      baseInput({ source: { ...baseInput().source, mergeable: null } }),
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.action, "block_missing_mergeability");

    const unmergeable = compileMergeabilityLease(
      baseInput({ source: { ...baseInput().source, mergeable: false } }),
    );
    assert.equal(unmergeable.ok, false);
    assert.equal(unmergeable.action, "block_unmergeable_pr");
  });

  it("blocks repeated lease ids", () => {
    const verdict = compileMergeabilityLease(
      baseInput({ spent_lease_ids: ["mergeability-live-head-001"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_repeated_lease");
  });
});
