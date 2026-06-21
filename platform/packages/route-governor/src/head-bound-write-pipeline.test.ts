import test from "node:test";
import assert from "node:assert/strict";

import {
  compileHeadBoundWritePipeline,
  type HeadBoundWritePipelineInput,
} from "./head-bound-write-pipeline.js";

const HEAD = "a927e56b2369874b1c060c205957ad0fc896711c";
const NEXT_HEAD = "aa1e6be9e1818b41fb41780b869b65eed49623e2";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<HeadBoundWritePipelineInput> = {}): HeadBoundWritePipelineInput {
  const base: HeadBoundWritePipelineInput = {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: HEAD,
    candidate: {
      active_branch: "monday-platform-genesis-01",
      live_head_sha: HEAD,
      candidate_id: "head-bound-write-pipeline",
      candidate_branch: "monday-platform-genesis-01",
      candidate_head_sha: HEAD,
      artifact_class: "head-bound-write-pipeline",
      move_class: "external_platform_embodiment",
      spent_artifact_classes: ["post-write-status-escrow", "review-feedback-delta-router", "release-candidate-bundle"],
      spent_move_classes: ["metadata_reread", "duplicate_ci_summary", "duplicate_comment"],
      changed_files: ["platform/packages/route-governor/src/head-bound-write-pipeline.ts"],
      executable_behavior_exports: ["compileHeadBoundWritePipeline"],
      future_routing_effects: ["candidate admission must flow into write receipt and moved-head status escrow"],
    },
    write: {
      write_receipt_id: "head-bound-write-pipeline-write-001",
      write_base_head_sha: HEAD,
      resulting_head_sha: NEXT_HEAD,
      artifact_class: "head-bound-write-pipeline",
      changed_files: ["platform/packages/route-governor/src/head-bound-write-pipeline.ts"],
      behavior_artifacts: ["compileHeadBoundWritePipeline"],
      routing_artifacts: ["head-bound candidate write pipeline"],
    },
    escrow: {
      repaired_historical_heads: [REPAIRED_HEAD],
      spent_escrow_ids: [],
      escrow_id: "head-bound-write-pipeline-escrow-001",
      status_claims: [],
      requested_next_action: "fresh_status_readback",
    },
  };

  return {
    ...base,
    ...overrides,
    candidate: { ...base.candidate, ...overrides.candidate },
    write: { ...base.write, ...overrides.write },
    escrow: { ...base.escrow, ...overrides.escrow },
  };
}

test("opens moved-head status escrow after candidate admission and a real write receipt", () => {
  const verdict = compileHeadBoundWritePipeline(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "open_head_bound_post_write_status_escrow");
  assert.equal(verdict.base_head_sha, HEAD);
  assert.equal(verdict.resulting_head_sha, NEXT_HEAD);
  assert.equal(verdict.status_escrow?.required_status_head_sha, NEXT_HEAD);
  assert.ok(verdict.decisive_evidence.includes("compileHeadBoundWritePipeline"));
});

test("blocks candidates prepared for stale heads before any write receipt can count", () => {
  const verdict = compileHeadBoundWritePipeline(
    input({ candidate: { candidate_head_sha: REPAIRED_HEAD } }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_candidate_admission");
  assert.match(verdict.blockers[0], /does not match live head/);
  assert.equal(verdict.write_receipt, null);
});

test("blocks write receipts that do not move the branch head", () => {
  const verdict = compileHeadBoundWritePipeline(
    input({ write: { resulting_head_sha: HEAD } }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_write_receipt");
  assert.match(verdict.blockers[0], /did not move head/);
  assert.equal(verdict.status_escrow, null);
});

test("blocks repaired-head status reuse after the write moves the head", () => {
  const verdict = compileHeadBoundWritePipeline(
    input({
      escrow: {
        status_claims: [
          {
            source_id: "old-repaired-head-readback",
            branch: "monday-platform-genesis-01",
            head_sha: REPAIRED_HEAD,
            conclusion: "success",
            evidence: ["old repaired-head checks succeeded"],
          },
        ],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_post_write_status_escrow");
  assert.deepEqual(verdict.blockers, [
    `status source old-repaired-head-readback is bound to ${REPAIRED_HEAD}, not ${NEXT_HEAD}`,
  ]);
});
