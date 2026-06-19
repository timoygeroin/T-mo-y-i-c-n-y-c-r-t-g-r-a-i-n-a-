import { describe, it } from "node:test";
import assert from "node:assert/strict";

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

describe("openPostWriteStatusEscrow", () => {
  it("opens escrow that binds status authority to the moved post-write head", () => {
    const verdict = openPostWriteStatusEscrow(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "open_post_write_status_escrow");
    assert.equal(verdict.base_head_sha, baseHead);
    assert.equal(verdict.required_status_head_sha, movedHead);
    assert.ok(verdict.decisive_evidence.includes(`required status head ${movedHead}`));
  });

  it("blocks repaired-head status authority after the branch has moved", () => {
    const verdict = openPostWriteStatusEscrow(
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

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_status_authority");
    assert.match(verdict.blockers.join("; "), /not post-write-status-escrow-head/);
  });

  it("blocks failing moved-head status before consumers can use the branch", () => {
    const verdict = openPostWriteStatusEscrow(
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
        requested_next_action: "fresh_status_readback",
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_failing_status_authority");
    assert.match(verdict.next_route, /repair only the moved-head failure/);
  });

  it("blocks pending moved-head status instead of reopening escrow as progress", () => {
    const verdict = openPostWriteStatusEscrow(
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
        requested_next_action: "fresh_status_readback",
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_pending_status_authority");
    assert.match(verdict.next_route, /wait for the moved-head status surface/);
  });

  it("blocks merge or review consumers before moved-head status is satisfied", () => {
    const verdict = openPostWriteStatusEscrow(baseInput({ requested_next_action: "merge_command" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_premature_next_action");
    assert.match(verdict.blockers.join("; "), /cannot consume the branch/);
  });

  it("blocks proof-only writes as post-write status receipts", () => {
    const verdict = openPostWriteStatusEscrow(
      baseInput({
        write_receipt: {
          commit_sha: movedHead,
          changed_files: ["platform/packages/route-governor/src/post-write-status-escrow-proof.ts"],
          behavior_artifacts: [],
          routing_artifacts: ["moved-head status escrow"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_write_delta");
  });

  it("releases only a status claim bound to the moved head", () => {
    const verdict = openPostWriteStatusEscrow(
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

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "release_head_bound_status");
    assert.ok(verdict.decisive_evidence.includes("moved-head-checks"));
  });
});
