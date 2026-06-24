import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sequencePostReadyEmbodiment, type PostReadyEmbodimentSequenceInput } from "./post-ready-embodiment-sequencer.js";

const liveHead = "d4ef701b4ae73b1ebf93fa221066d483b7d38ae2";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const priorStatusHead = "2ec77068cb2df8e3c65890e24ca1e88f15675feb";

function baseInput(overrides: Partial<PostReadyEmbodimentSequenceInput> = {}): PostReadyEmbodimentSequenceInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    pr_is_draft: false,
    live_status_verdict: "passing_with_warnings",
    resolved_boundary_ids: ["issue-1-ci-status-readback", "repaired-head-checks-succeeded"],
    resolved_historical_heads: [repairedHead, priorStatusHead],
    last_status_readback_head_sha: priorStatusHead,
    spent_increments: [
      {
        increment_id: "post-write-status-escrow",
        capability_class: "post_write_status",
        future_consumer: "moved-head status authority",
      },
    ],
    candidate: {
      increment_id: "post-ready-embodiment-sequencer",
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      capability_class: "post_ready_embodiment",
      future_consumer: "next executable platform increment selection",
      changed_files: ["platform/packages/route-governor/src/post-ready-embodiment-sequencer.ts"],
      behavior_artifacts: ["sequencePostReadyEmbodiment"],
      routing_artifacts: ["capability-consumer anti-repeat sequencing"],
      proof_artifacts: ["post-ready embodiment sequencer tests"],
    },
    ...overrides,
  };
}

describe("sequencePostReadyEmbodiment", () => {
  it("admits a ready-review embodiment with a new capability-consumer pair", () => {
    const verdict = sequencePostReadyEmbodiment(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_post_ready_embodiment");
    assert.equal(verdict.head_sha, liveHead);
    assert.equal(verdict.capability_class, "post_ready_embodiment");
    assert.ok(verdict.decisive_evidence.includes("future consumer next executable platform increment selection"));
  });

  it("blocks candidates based on the repaired historical head", () => {
    const verdict = sequencePostReadyEmbodiment(
      baseInput({ candidate: { ...baseInput().candidate, base_head_sha: repairedHead } }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_resolved_head_replay");
    assert.match(verdict.blockers.join("; "), /not live head/);
  });

  it("blocks duplicate comments and status summaries as progress", () => {
    const verdict = sequencePostReadyEmbodiment(
      baseInput({ candidate: { ...baseInput().candidate, move_class: "duplicate_comment" } }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_move");
  });

  it("blocks a repeated capability-consumer pair even with a fresh increment id", () => {
    const verdict = sequencePostReadyEmbodiment(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          increment_id: "second-post-write-status-wrapper",
          capability_class: "post_write_status",
          future_consumer: "moved-head status authority",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_repeated_capability_consumer");
  });

  it("admits a moved-head status readback only when the live head changed since the last readback", () => {
    const verdict = sequencePostReadyEmbodiment(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          increment_id: "live-head-status-readback",
          move_class: "fresh_status_readback",
          changed_files: [],
          behavior_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_moved_head_status_readback");
    assert.match(verdict.decisive_evidence.join("; "), /head moved/);
  });

  it("blocks stale status readback when the live head equals the last readback head", () => {
    const verdict = sequencePostReadyEmbodiment(
      baseInput({
        last_status_readback_head_sha: liveHead,
        candidate: {
          ...baseInput().candidate,
          increment_id: "stale-status-readback",
          move_class: "fresh_status_readback",
          changed_files: [],
          behavior_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_move");
  });

  it("blocks proof-only embodiment increments", () => {
    const verdict = sequencePostReadyEmbodiment(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          changed_files: ["platform/packages/route-governor/src/post-ready-embodiment-sequencer.test.ts"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_incomplete_embodiment");
    assert.match(verdict.blockers.join("; "), /no behavior-bearing platform file/);
  });
});
