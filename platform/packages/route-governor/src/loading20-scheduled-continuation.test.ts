import assert from "node:assert/strict";
import { test } from "node:test";

import {
  routeLoading20ScheduledContinuation,
  type Loading20ScheduledContinuationInput,
} from "./loading20-scheduled-continuation.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "f8bfccd8e40d756d1c9b924333f48a3037c0b69d";

function input(overrides: Partial<Loading20ScheduledContinuationInput> = {}): Loading20ScheduledContinuationInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    last_repaired_status_head_sha: repairedHead,
    requested_move_class: "external_platform_embodiment",
    status_claim: "none",
    new_check_runs: [],
    increment: {
      candidate_id: "loading20-scheduled-continuation",
      base_head_sha: liveHead,
      changed_files: [
        "platform/packages/route-governor/src/loading20-scheduled-continuation.ts",
        "platform/packages/route-governor/src/loading20-scheduled-continuation.test.ts",
      ],
      executable_artifacts: ["routeLoading20ScheduledContinuation"],
      routing_artifacts: ["Loading 20 scheduled runs admit embodiment without stale status claims"],
      proof_artifacts: ["loading20-scheduled-continuation.test.ts"],
    },
    ...overrides,
  };
}

test("admits behavior-bearing Loading 20 embodiment without making a status claim", () => {
  const verdict = routeLoading20ScheduledContinuation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_live_external_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.quarantined_head_shas.includes(repairedHead));
  assert.ok(verdict.decisive_evidence.includes(`status claim withheld for live head ${liveHead}`));
  assert.ok(verdict.decisive_evidence.includes("routeLoading20ScheduledContinuation"));
});

test("blocks the old repaired-head blocker after the live head moved", () => {
  const verdict = routeLoading20ScheduledContinuation(input({ requested_move_class: "old_repaired_head_blocker" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_historical_head_replay");
  assert.deepEqual(verdict.blockers, [`repaired-head blocker belongs to historical head ${repairedHead}`]);
});

test("blocks stale pass/fail claims that are not bound to the live head", () => {
  const verdict = routeLoading20ScheduledContinuation(
    input({
      status_claim: "passing",
      status_claim_head_sha: repairedHead,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_claim");
  assert.deepEqual(verdict.blockers, [`status claim passing is bound to ${repairedHead}, not live head ${liveHead}`]);
});

test("admits fresh status readback only when the live head moved or live checks appear", () => {
  const moved = routeLoading20ScheduledContinuation(
    input({ requested_move_class: "fresh_status_readback", increment: undefined }),
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.action, "admit_fresh_live_status_readback");
  assert.match(moved.decisive_evidence.join("\n"), /head moved/);

  const sameHeadWithCheck = routeLoading20ScheduledContinuation(
    input({
      prompt_head_sha: liveHead,
      last_repaired_status_head_sha: liveHead,
      requested_move_class: "fresh_status_readback",
      increment: undefined,
      new_check_runs: [{ id: "new-live-check", head_sha: liveHead, name: "PR Head Status Readback" }],
    }),
  );
  assert.equal(sameHeadWithCheck.ok, true);
  assert.equal(sameHeadWithCheck.action, "admit_fresh_live_status_readback");
  assert.match(sameHeadWithCheck.decisive_evidence.join("\n"), /new-live-check/);
});

test("blocks duplicate readback, metadata rereads, and proof-only embodiment", () => {
  const duplicateReadback = routeLoading20ScheduledContinuation(
    input({
      prompt_head_sha: liveHead,
      last_repaired_status_head_sha: liveHead,
      requested_move_class: "fresh_status_readback",
      increment: undefined,
    }),
  );
  assert.equal(duplicateReadback.ok, false);
  assert.equal(duplicateReadback.action, "block_historical_head_replay");

  const metadata = routeLoading20ScheduledContinuation(input({ requested_move_class: "metadata_reread" }));
  assert.equal(metadata.ok, false);
  assert.equal(metadata.action, "block_non_progress_move");

  const proofOnly = routeLoading20ScheduledContinuation(
    input({
      increment: {
        candidate_id: "proof-only",
        base_head_sha: liveHead,
        changed_files: ["platform/packages/route-governor/src/loading20-scheduled-continuation.test.ts"],
        executable_artifacts: ["routeLoading20ScheduledContinuation"],
        routing_artifacts: ["proof-only routing note"],
        proof_artifacts: ["loading20-scheduled-continuation.test.ts"],
      },
    }),
  );
  assert.equal(proofOnly.ok, false);
  assert.equal(proofOnly.action, "block_incomplete_external_embodiment");
});

test("admits exact blocker only when blocker text is present", () => {
  const missing = routeLoading20ScheduledContinuation(
    input({ requested_move_class: "exact_external_blocker", increment: undefined }),
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_exact_blocker");

  const admitted = routeLoading20ScheduledContinuation(
    input({
      requested_move_class: "exact_external_blocker",
      increment: undefined,
      blocker: "GitHub contents API rejected writes to monday-platform-genesis-01",
    }),
  );
  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "emit_exact_external_blocker");
});
