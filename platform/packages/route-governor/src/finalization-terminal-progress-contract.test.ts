import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enforceFinalizationTerminalProgress,
  type FinalizationTerminalProgressInput,
  type TerminalProgressClass,
} from "./finalization-terminal-progress-contract.js";

const branch = "monday-platform-genesis-01";
const liveHead = "fd17ea45e26f79fff2a677ad1b196e2ce6e3f9ac";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const proofArtifact = "platform/packages/route-governor/src/finalization-terminal-progress-contract-proof.ts";
const prohibited: TerminalProgressClass[] = [
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
];

function input(overrides: Partial<FinalizationTerminalProgressInput> = {}): FinalizationTerminalProgressInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    prohibited_progress_classes: prohibited,
    resolved_historical_heads: [repairedHead],
    candidate: {
      progress_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/finalization-terminal-progress-contract.ts"],
      executable_artifacts: ["enforceFinalizationTerminalProgress"],
      routing_artifacts: ["terminal progress contract"],
      proof_artifacts: [proofArtifact],
      new_check_runs: [],
    },
    ...overrides,
  };
}

test("admits executable embodiment on the live head only with proof evidence", () => {
  const verdict = enforceFinalizationTerminalProgress(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.quarantined_heads.includes(repairedHead), true);
  assert.ok(verdict.decisive_evidence.includes(proofArtifact));
});

test("blocks terminal embodiment without proof artifacts", () => {
  const verdict = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "external_platform_embodiment",
        branch,
        base_head_sha: liveHead,
        changed_files: ["platform/packages/route-governor/src/finalization-terminal-progress-contract.ts"],
        executable_artifacts: ["enforceFinalizationTerminalProgress"],
        routing_artifacts: ["terminal progress contract"],
        proof_artifacts: [],
        new_check_runs: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.includes("terminal embodiment has no proof artifact evidence"));
});

test("blocks the explicitly prohibited non-progress classes", () => {
  for (const progress_class of prohibited) {
    const verdict = enforceFinalizationTerminalProgress(
      input({
        candidate: {
          progress_class,
          branch,
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          new_check_runs: [],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_class");
    assert.deepEqual(verdict.blockers, [`prohibited terminal progress class: ${progress_class}`]);
  }
});

test("admits fresh status only when the head moved or new live-head checks exist", () => {
  const moved = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "fresh_status_readback",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        new_check_runs: [],
      },
    }),
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.action, "admit_fresh_status_readback");

  const newLiveCheck = enforceFinalizationTerminalProgress(
    input({
      previous_status_head_sha: liveHead,
      candidate: {
        progress_class: "fresh_status_readback",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        new_check_runs: [{ id: "check-1", head_sha: liveHead, name: "Route Governor Proof" }],
      },
    }),
  );
  assert.equal(newLiveCheck.ok, true);
  assert.equal(newLiveCheck.action, "admit_fresh_status_readback");

  const stale = enforceFinalizationTerminalProgress(
    input({
      previous_status_head_sha: liveHead,
      candidate: {
        progress_class: "fresh_status_readback",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        new_check_runs: [{ id: "old-check", head_sha: repairedHead, name: "old check" }],
      },
    }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_stale_status_readback");
});

test("requires exact blocker text for blocker progress", () => {
  const missing = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "exact_external_blocker",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        new_check_runs: [],
      },
    }),
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_exact_blocker");

  const named = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "exact_external_blocker",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        new_check_runs: [],
        blocker: "GitHub branch write permission is absent",
      },
    }),
  );
  assert.equal(named.ok, true);
  assert.equal(named.action, "admit_exact_external_blocker");
});

test("blocks embodiment that is stale or not executable", () => {
  const staleBase = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "external_platform_embodiment",
        branch,
        base_head_sha: repairedHead,
        changed_files: ["platform/packages/route-governor/src/finalization-terminal-progress-contract.ts"],
        executable_artifacts: ["enforceFinalizationTerminalProgress"],
        routing_artifacts: ["terminal progress contract"],
        proof_artifacts: [proofArtifact],
        new_check_runs: [],
      },
    }),
  );
  assert.equal(staleBase.ok, false);
  assert.equal(staleBase.action, "block_incomplete_embodiment");

  const docsOnly = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "external_platform_embodiment",
        branch,
        base_head_sha: liveHead,
        changed_files: ["platform/docs/finalization.md"],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        new_check_runs: [],
      },
    }),
  );
  assert.equal(docsOnly.ok, false);
  assert.equal(docsOnly.action, "block_incomplete_embodiment");
});

test("blocks wrong branch candidates", () => {
  const verdict = enforceFinalizationTerminalProgress(
    input({
      candidate: {
        progress_class: "external_platform_embodiment",
        branch: "main",
        base_head_sha: liveHead,
        changed_files: ["platform/packages/route-governor/src/finalization-terminal-progress-contract.ts"],
        executable_artifacts: ["enforceFinalizationTerminalProgress"],
        routing_artifacts: ["terminal progress contract"],
        proof_artifacts: [proofArtifact],
        new_check_runs: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
});
