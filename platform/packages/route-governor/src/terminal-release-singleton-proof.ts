import assert from "node:assert/strict";

import {
  selectSingleTerminalRelease,
  type TerminalReleaseCandidate,
  type TerminalReleaseSingletonInput,
} from "./terminal-release-singleton.js";

const branch = "monday-platform-genesis-01";
const liveHead = "53cd61e44970800832e7e50012ab474340413784";
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

function embodiment(overrides: Partial<TerminalReleaseCandidate> = {}): TerminalReleaseCandidate {
  return {
    candidate_id: "terminal-release-singleton-embodiment",
    progress_class: "external_platform_embodiment",
    branch,
    head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/terminal-release-singleton.ts"],
    executable_artifacts: ["selectSingleTerminalRelease"],
    routing_artifacts: ["exactly one terminal release class is admitted"],
    proof_artifacts: ["terminal-release-singleton-proof"],
    ...overrides,
  };
}

function readback(overrides: Partial<TerminalReleaseCandidate> = {}): TerminalReleaseCandidate {
  return {
    candidate_id: "fresh-live-head-status-readback",
    progress_class: "fresh_status_readback",
    branch,
    head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    head_moved_since_last_readback: true,
    status_surface_attached: true,
    ...overrides,
  };
}

function blocker(overrides: Partial<TerminalReleaseCandidate> = {}): TerminalReleaseCandidate {
  return {
    candidate_id: "contents-api-write-blocker",
    progress_class: "exact_external_blocker",
    branch,
    head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    blocker: "GitHub contents API rejected writes to monday-platform-genesis-01",
    ...overrides,
  };
}

function input(candidates: TerminalReleaseCandidate[], overrides: Partial<TerminalReleaseSingletonInput> = {}): TerminalReleaseSingletonInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    prohibited_classes: [...prohibited],
    candidates,
    ...overrides,
  };
}

const singleEmbodiment = selectSingleTerminalRelease(input([embodiment()]));
assert.equal(singleEmbodiment.ok, true);
assert.equal(singleEmbodiment.action, "emit_single_external_embodiment");
assert.equal(singleEmbodiment.selected_candidate_id, "terminal-release-singleton-embodiment");
assert.match(singleEmbodiment.decisive_evidence.join("\n"), /selectSingleTerminalRelease/);

const mixedRelease = selectSingleTerminalRelease(input([embodiment(), readback()]));
assert.equal(mixedRelease.ok, false);
assert.equal(mixedRelease.action, "block_ambiguous_terminal_release");
assert.match(mixedRelease.blockers.join("\n"), /multiple terminal release candidates survived/);

const metadataReread = selectSingleTerminalRelease(
  input([
    embodiment({
      candidate_id: "metadata-reread",
      progress_class: "pr_metadata_reread",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  ]),
);
assert.equal(metadataReread.ok, false);
assert.equal(metadataReread.action, "block_no_terminal_release");
assert.match(metadataReread.rejected[0]?.reasons.join("\n") ?? "", /prohibited/);

const staleHead = selectSingleTerminalRelease(input([embodiment({ head_sha: repairedHead })]));
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_no_terminal_release");
assert.match(staleHead.rejected[0]?.reasons.join("\n") ?? "", /does not match live head/);

const proofOnlyEmbodiment = selectSingleTerminalRelease(
  input([
    embodiment({
      changed_files: ["platform/packages/route-governor/src/terminal-release-singleton-proof.ts"],
    }),
  ]),
);
assert.equal(proofOnlyEmbodiment.ok, false);
assert.match(proofOnlyEmbodiment.rejected[0]?.reasons.join("\n") ?? "", /proof-only/);

const staleReadback = selectSingleTerminalRelease(
  input([
    readback({
      head_moved_since_last_readback: false,
      new_current_head_check_ids: [],
    }),
  ]),
);
assert.equal(staleReadback.ok, false);
assert.match(staleReadback.rejected[0]?.reasons.join("\n") ?? "", /moved-head or new current-head check/);

const missingStatusSurface = selectSingleTerminalRelease(input([readback({ status_surface_attached: false })]));
assert.equal(missingStatusSurface.ok, false);
assert.match(missingStatusSurface.rejected[0]?.reasons.join("\n") ?? "", /status surface/);

const singleBlocker = selectSingleTerminalRelease(input([blocker()]));
assert.equal(singleBlocker.ok, true);
assert.equal(singleBlocker.action, "emit_single_exact_blocker");
assert.match(singleBlocker.decisive_evidence.join("\n"), /GitHub contents API/);

const emptyBlocker = selectSingleTerminalRelease(input([blocker({ blocker: "" })]));
assert.equal(emptyBlocker.ok, false);
assert.match(emptyBlocker.rejected[0]?.reasons.join("\n") ?? "", /no blocker text/);

console.log("terminal release singleton proof passed");
