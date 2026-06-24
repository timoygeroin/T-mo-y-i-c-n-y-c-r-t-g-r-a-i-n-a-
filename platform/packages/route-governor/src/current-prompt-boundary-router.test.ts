import assert from "node:assert/strict";
import { test } from "node:test";

import { routeCurrentPromptBoundary, type PromptBoundaryInput } from "./current-prompt-boundary-router.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "4c3b89c3ee7a3154796a26d81c9c6729c9bbb370";

function input(overrides: Partial<PromptBoundaryInput> = {}): PromptBoundaryInput {
  return {
    active_branch: branch,
    target_branch: branch,
    prompt_head_sha: promptHead,
    live_head_sha: liveHead,
    current_check_run_ids: [],
    requested_move_class: "external_platform_embodiment",
    embodiment: {
      changed_files: ["platform/packages/route-governor/src/current-prompt-boundary-router.ts"],
      executable_artifacts: ["routeCurrentPromptBoundary"],
      routing_artifacts: ["stale repaired-head blocker is rejected after prompt/live head drift"],
      proof_artifacts: ["dist/current-prompt-boundary-router.test.js"],
    },
    ...overrides,
  };
}

test("admits executable embodiment after prompt head moved", () => {
  const verdict = routeCurrentPromptBoundary(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("routeCurrentPromptBoundary"));
  assert.ok(verdict.decisive_evidence.some((entry) => entry.includes(promptHead)));
});

test("blocks the resolved repaired-head blocker as stale", () => {
  const verdict = routeCurrentPromptBoundary(input({ requested_move_class: "repaired_head_blocker" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_repaired_head");
  assert.deepEqual(verdict.blockers, [`prompt repaired-head blocker is stale for ${promptHead}`]);
  assert.match(verdict.next_route, /live PR head/);
});

test("admits fresh readback only when head moved or checks are new", () => {
  const moved = routeCurrentPromptBoundary(input({ requested_move_class: "fresh_status_readback" }));
  assert.equal(moved.ok, true);
  assert.equal(moved.action, "admit_fresh_status_readback");
  assert.ok(moved.decisive_evidence.some((entry) => entry.includes(liveHead)));

  const unchangedNoChecks = routeCurrentPromptBoundary(
    input({
      prompt_head_sha: liveHead,
      live_head_sha: liveHead,
      requested_move_class: "fresh_status_readback",
    }),
  );
  assert.equal(unchangedNoChecks.ok, false);
  assert.equal(unchangedNoChecks.action, "block_non_progress_move");

  const unchangedWithChecks = routeCurrentPromptBoundary(
    input({
      prompt_head_sha: liveHead,
      live_head_sha: liveHead,
      current_check_run_ids: ["27049651467"],
      requested_move_class: "fresh_status_readback",
    }),
  );
  assert.equal(unchangedWithChecks.ok, true);
  assert.equal(unchangedWithChecks.action, "admit_fresh_status_readback");
});

test("blocks duplicate summaries and local-only progress classes", () => {
  for (const requested_move_class of ["duplicate_ci_summary", "metadata_reread", "local_memory_guard", "guess_future_ci"] as const) {
    const verdict = routeCurrentPromptBoundary(input({ requested_move_class }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_move");
    assert.deepEqual(verdict.blockers, [
      `move class is non-progress under the current prompt boundary: ${requested_move_class}`,
    ]);
  }
});

test("blocks incomplete embodiment evidence", () => {
  const verdict = routeCurrentPromptBoundary(
    input({
      embodiment: {
        changed_files: ["platform/docs/status-note.md"],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("external embodiment does not change executable platform files"));
  assert.ok(verdict.blockers.includes("external embodiment has no executable artifact evidence"));
  assert.ok(verdict.blockers.includes("external embodiment has no future-routing artifact evidence"));
  assert.ok(verdict.blockers.includes("external embodiment has no proof artifact evidence"));
});

test("admits exact blockers only when named", () => {
  const missing = routeCurrentPromptBoundary(input({ requested_move_class: "exact_external_blocker", exact_blocker: "" }));
  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_non_progress_move");

  const named = routeCurrentPromptBoundary(
    input({ requested_move_class: "exact_external_blocker", exact_blocker: "current-head proof log is unavailable" }),
  );
  assert.equal(named.ok, true);
  assert.equal(named.action, "admit_exact_blocker");
  assert.deepEqual(named.blockers, ["current-head proof log is unavailable"]);
});

test("blocks moves bound to the wrong branch", () => {
  const verdict = routeCurrentPromptBoundary(input({ active_branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.deepEqual(verdict.blockers, [`active branch main does not match target branch ${branch}`]);
});
