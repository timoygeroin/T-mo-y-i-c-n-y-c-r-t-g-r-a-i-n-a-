import assert from "node:assert/strict";

import "./moved-head-status-contract-proof.js";

import {
  enforceFinalizationTerminalProgress,
  type FinalizationTerminalProgressInput,
} from "./finalization-terminal-progress-contract.js";

const branch = "monday-platform-genesis-01";
const liveHead = "fd17ea45e26f79fff2a677ad1b196e2ce6e3f9ac";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const prohibited = [
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
] as const;

function input(overrides: Partial<FinalizationTerminalProgressInput> = {}): FinalizationTerminalProgressInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    prohibited_progress_classes: [...prohibited],
    resolved_historical_heads: [repairedHead],
    candidate: {
      progress_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/finalization-terminal-progress-contract.ts"],
      executable_artifacts: ["enforceFinalizationTerminalProgress"],
      routing_artifacts: ["terminal progress admits only embodiment, fresh readback, or exact blocker"],
      new_check_runs: [],
    },
    ...overrides,
  };
}

const embodiment = enforceFinalizationTerminalProgress(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "admit_external_embodiment");
assert.equal(embodiment.quarantined_heads.includes(repairedHead), true);

const metadataReread = enforceFinalizationTerminalProgress(
  input({
    candidate: {
      progress_class: "pr_metadata_reread",
      branch,
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [],
    },
  }),
);
assert.equal(metadataReread.ok, false);
assert.equal(metadataReread.action, "block_non_progress_class");

const staleReadback = enforceFinalizationTerminalProgress(
  input({
    previous_status_head_sha: liveHead,
    candidate: {
      progress_class: "fresh_status_readback",
      branch,
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [{ id: "old-check", head_sha: repairedHead, name: "old repaired-head check" }],
    },
  }),
);
assert.equal(staleReadback.ok, false);
assert.equal(staleReadback.action, "block_stale_status_readback");

const movedHeadReadback = enforceFinalizationTerminalProgress(
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
assert.equal(movedHeadReadback.ok, true);
assert.equal(movedHeadReadback.action, "admit_fresh_status_readback");
assert.match(movedHeadReadback.decisive_evidence.join("\n"), /head moved/);

const newCheckReadback = enforceFinalizationTerminalProgress(
  input({
    previous_status_head_sha: liveHead,
    candidate: {
      progress_class: "fresh_status_readback",
      branch,
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [{ id: "new-live-check", head_sha: liveHead, name: "PR Head Status Readback" }],
    },
  }),
);
assert.equal(newCheckReadback.ok, true);
assert.equal(newCheckReadback.action, "admit_fresh_status_readback");
assert.match(newCheckReadback.decisive_evidence.join("\n"), /new-live-check/);

const exactBlocker = enforceFinalizationTerminalProgress(
  input({
    candidate: {
      progress_class: "exact_external_blocker",
      branch,
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [],
      blocker: "GitHub contents API rejected writes to the active branch",
    },
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "admit_exact_external_blocker");

const incompleteEmbodiment = enforceFinalizationTerminalProgress(
  input({
    candidate: {
      progress_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/docs/finalization.md"],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_runs: [],
    },
  }),
);
assert.equal(incompleteEmbodiment.ok, false);
assert.equal(incompleteEmbodiment.action, "block_incomplete_embodiment");

console.log("finalization terminal progress contract proof passed");