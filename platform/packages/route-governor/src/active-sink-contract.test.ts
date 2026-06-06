import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateActiveSinkCandidate,
  selectActiveSinkContinuation,
  type ActiveManifestationSink,
  type ActiveSinkCandidate,
} from "./active-sink-contract.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const currentHead = "da864c246ce5b777f53525c99ff0a53863e31c17";

function sink(overrides: Partial<ActiveManifestationSink> = {}): ActiveManifestationSink {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    current_head_sha: currentHead,
    repaired_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    ...overrides,
  };
}

function candidate(overrides: Partial<ActiveSinkCandidate> = {}): ActiveSinkCandidate {
  return {
    candidate_id: "embodiment",
    move_class: "external_platform_embodiment",
    target: {
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: currentHead,
    },
    changed_files: ["platform/packages/route-governor/src/active-sink-contract.ts"],
    executable_artifacts: ["selectActiveSinkContinuation"],
    routing_artifacts: ["active manifestation sink contract"],
    new_check_run_ids: [],
    ...overrides,
  };
}

test("accepts a current-head external embodiment on the active PR sink", () => {
  const verdict = evaluateActiveSinkCandidate(sink(), candidate());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "commit_external_embodiment");
  assert.deepEqual(verdict.failures, []);
  assert.ok(verdict.decisive_evidence.includes("selectActiveSinkContinuation"));
});

test("rejects a stale repaired-head readback after that boundary is resolved", () => {
  const verdict = evaluateActiveSinkCandidate(
    sink({ current_head_sha: repairedHead, last_status_readback_head_sha: repairedHead }),
    candidate({
      candidate_id: "stale-readback",
      move_class: "fresh_status_readback",
      target: { ...candidate().target, head_sha: repairedHead },
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_run_ids: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("stale repaired-head readback is exhausted"));
});

test("allows a fresh status readback only when the active PR head moved", () => {
  const verdict = evaluateActiveSinkCandidate(
    sink(),
    candidate({
      candidate_id: "fresh-readback",
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_run_ids: [],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_current_head_status");
  assert.deepEqual(verdict.decisive_evidence, [`head moved from ${repairedHead} to ${currentHead}`]);
});

test("rejects metadata reread and duplicate CI summaries as active-sink progress", () => {
  for (const move_class of ["pr_metadata_reread", "duplicate_ci_summary"] as const) {
    const verdict = evaluateActiveSinkCandidate(
      sink(),
      candidate({
        candidate_id: move_class,
        move_class,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.ok(verdict.failures.includes(`move class is explicitly non-progress: ${move_class}`));
  }
});

test("rejects candidates aimed at the wrong repository, PR, branch, or head", () => {
  const verdict = evaluateActiveSinkCandidate(
    sink(),
    candidate({
      target: {
        repository_full_name: "timoygeroin/wrong",
        pr_number: 99,
        branch: "main",
        head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failures.slice(0, 4), [
    "candidate targets wrong repository: timoygeroin/wrong",
    "candidate targets wrong PR: 99",
    "candidate targets wrong branch: main",
    `candidate targets stale or mismatched head: ${repairedHead}`,
  ]);
});

test("selects embodiment over fresh readback and exact blocker on the active sink", () => {
  const verdict = selectActiveSinkContinuation(sink(), [
    candidate({
      candidate_id: "fresh-readback",
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
    candidate({
      candidate_id: "blocker",
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      blocker: "no writable external branch surface is available",
    }),
    candidate(),
  ]);

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "commit_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "embodiment");
});
