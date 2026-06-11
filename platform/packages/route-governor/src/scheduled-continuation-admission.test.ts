import assert from "node:assert/strict";
import { test } from "node:test";

import {
  admitScheduledContinuation,
  type ScheduledContinuationAdmissionInput,
} from "./scheduled-continuation-admission.js";

const branch = "monday-platform-genesis-01";
const resolvedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "5efd25e7835d39b389031c67f935c4e9919fff4c";
const blocker = "blocked: ci-status-readback";

function input(overrides: Partial<ScheduledContinuationAdmissionInput> = {}): ScheduledContinuationAdmissionInput {
  return {
    active_branch: branch,
    prompt_head_sha: resolvedHead,
    live_head_sha: liveHead,
    last_readback_head_sha: resolvedHead,
    resolved_repaired_head_sha: resolvedHead,
    resolved_repaired_head_blockers: [blocker],
    move_class: "external_platform_embodiment",
    spent_move_classes: ["metadata_reread", "duplicate_status_summary"],
    spent_candidate_ids: [],
    status_surface: {
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      check_run_ids: ["27090000001"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    },
    embodiment: {
      candidate_id: "scheduled-continuation-admission",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-continuation-admission.ts"],
      executable_artifacts: ["admitScheduledContinuation"],
      routing_artifacts: ["scheduled continuation admission gate"],
      proof_artifacts: ["scheduled-continuation-admission.test.ts"],
    },
    ...overrides,
  };
}

test("admits a live-head executable embodiment while preserving the resolved prompt head as history", () => {
  const verdict = admitScheduledContinuation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.quarantined_prompt_head, resolvedHead);
  assert.equal(verdict.admitted_candidate_id, "scheduled-continuation-admission");
  assert.match(verdict.next_route, /moved live head status/);
});

test("admits fresh readback only because the live head moved beyond the last readback", () => {
  const verdict = admitScheduledContinuation(
    input({
      move_class: "fresh_status_readback",
      embodiment: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
  assert.ok(verdict.decisive_evidence.some((line) => line.includes(`head moved from ${resolvedHead} to ${liveHead}`)));
});

test("blocks duplicate summaries, metadata rereads, and resolved blocker replay", () => {
  const duplicate = admitScheduledContinuation(input({ move_class: "duplicate_status_summary" }));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.action, "block_repeated_or_resolved_move");

  const metadata = admitScheduledContinuation(input({ move_class: "metadata_reread" }));
  assert.equal(metadata.ok, false);
  assert.equal(metadata.action, "block_repeated_or_resolved_move");

  const replay = admitScheduledContinuation(
    input({
      move_class: "exact_external_blocker",
      exact_blocker: blocker,
      embodiment: undefined,
    }),
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.action, "block_repeated_or_resolved_move");
});

test("blocks stale status surfaces and failing live-head status before embodiment", () => {
  const stale = admitScheduledContinuation(
    input({
      status_surface: {
        head_sha: resolvedHead,
        verdict: "passing",
        check_run_ids: ["old-check"],
        blocking_failures: [],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_unstable_status");

  const failing = admitScheduledContinuation(
    input({
      status_surface: {
        head_sha: liveHead,
        verdict: "failing",
        check_run_ids: ["failed-check"],
        blocking_failures: ["Route Governor Proof / proof examples failed"],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );
  assert.equal(failing.ok, false);
  assert.equal(failing.action, "block_unstable_status");
  assert.deepEqual(failing.blockers, ["Route Governor Proof / proof examples failed"]);
});

test("blocks embodiment candidates that are not bound to the live head or executable platform files", () => {
  const verdict = admitScheduledContinuation(
    input({
      embodiment: {
        candidate_id: "bad-candidate",
        base_head_sha: resolvedHead,
        changed_files: ["README.md"],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.some((line) => line.includes("is not live head")));
  assert.ok(verdict.blockers.some((line) => line.includes("changes no executable platform file")));
});

test("admits a new exact blocker only when it is live and not the resolved repaired-head blocker", () => {
  const verdict = admitScheduledContinuation(
    input({
      move_class: "exact_external_blocker",
      exact_blocker: "GitHub contents write permission denied for live branch",
      embodiment: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["GitHub contents write permission denied for live branch"]);
});
