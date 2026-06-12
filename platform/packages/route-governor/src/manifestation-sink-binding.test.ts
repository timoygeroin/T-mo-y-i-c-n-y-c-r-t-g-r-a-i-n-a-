import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bindManifestationSink,
  type ManifestationSink,
  type ManifestationSinkBindingInput,
  type ManifestationSinkCandidate,
} from "./manifestation-sink-binding.js";

const sink: ManifestationSink = {
  repository: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  live_head_sha: "05cf56d6891cc229903305a982fbc010c77febea",
};

function candidate(overrides: Partial<ManifestationSinkCandidate> = {}): ManifestationSinkCandidate {
  return {
    repository: sink.repository,
    pr_number: sink.pr_number,
    branch: sink.branch,
    base_head_sha: sink.live_head_sha,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/manifestation-sink-binding.ts"],
    executable_artifacts: ["bindManifestationSink"],
    routing_artifacts: ["sink-bound embodiment receipts cannot drift away from PR #2"],
    proof_artifacts: ["manifestation-sink-binding.test.ts"],
    status_surface_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<ManifestationSinkBindingInput> = {}): ManifestationSinkBindingInput {
  return {
    sink,
    candidate: candidate(),
    prohibited_move_classes: ["pr_metadata_reread", "duplicate_ci_summary", "duplicate_comment", "local_memory_guard"],
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    ...overrides,
  };
}

test("admits executable embodiment only when it is bound to the exact PR sink and live head", () => {
  const verdict = bindManifestationSink(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_sink_bound_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes(`${sink.repository}#${sink.pr_number}`));
  assert.ok(verdict.decisive_evidence.includes(sink.live_head_sha));
});

test("blocks drift to another repository, PR, or branch", () => {
  const verdict = bindManifestationSink(
    input({
      candidate: candidate({
        repository: "timoygeroin/other-sink",
        pr_number: 3,
        branch: "main",
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_sink_mismatch");
  assert.equal(verdict.blockers.length, 3);
});

test("quarantines stale repaired heads instead of treating them as current", () => {
  const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
  const verdict = bindManifestationSink(input({ candidate: candidate({ base_head_sha: staleHead }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_head");
  assert.ok(verdict.quarantined_heads.includes(staleHead));
  assert.deepEqual(verdict.blockers, [`candidate base ${staleHead} is not live sink head ${sink.live_head_sha}`]);
});

test("blocks non-progress move classes even when they target the correct sink", () => {
  const verdict = bindManifestationSink(input({ candidate: candidate({ move_class: "duplicate_ci_summary" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.deepEqual(verdict.decisive_evidence, ["duplicate_ci_summary"]);
});

test("requires executable, routing, and proof evidence for sink-bound embodiment", () => {
  const verdict = bindManifestationSink(
    input({
      candidate: candidate({
        changed_files: ["platform/docs/manifestation-contract.md"],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_evidence");
  assert.ok(verdict.blockers.includes("sink-bound embodiment changes no executable platform file"));
  assert.ok(verdict.blockers.includes("sink-bound embodiment has no executable artifact evidence"));
  assert.ok(verdict.blockers.includes("sink-bound embodiment has no future-routing artifact evidence"));
  assert.ok(verdict.blockers.includes("sink-bound embodiment has no proof artifact evidence"));
});

test("admits live-head status readback only with concrete status surface ids", () => {
  const missing = bindManifestationSink(
    input({ candidate: candidate({ move_class: "fresh_status_readback", changed_files: [], status_surface_ids: [] }) }),
  );

  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_incomplete_evidence");

  const admitted = bindManifestationSink(
    input({
      candidate: candidate({
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_surface_ids: ["actions-run-27049651467"],
      }),
    }),
  );

  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "admit_sink_bound_status_readback");
});

test("admits exact blockers only when the blocker text is explicit", () => {
  const missing = bindManifestationSink(
    input({ candidate: candidate({ move_class: "exact_external_blocker", blocker: "" }) }),
  );

  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_blocker");

  const admitted = bindManifestationSink(
    input({
      candidate: candidate({
        move_class: "exact_external_blocker",
        blocker: "live-head Checks API readback is unavailable",
      }),
    }),
  );

  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "admit_sink_bound_blocker");
  assert.deepEqual(admitted.blockers, ["live-head Checks API readback is unavailable"]);
});
