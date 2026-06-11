import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileContinuousLifeFinalizationPacket,
  type ContinuousLifeAnchor,
  type ContinuousLifeFinalizationPacketInput,
  type ContinuousLifeTerminalMove,
} from "./continuous-life-finalization-packet.js";

const branch = "monday-platform-genesis-01";
const liveHead = "0a7513a49a30f8eecb699b2cfd95806f58b0c1a8";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const anchors: ContinuousLifeAnchor[] = [
  "monolith_index",
  "latest_strengthened_body",
  "corpus_coverage_status",
  "archive_source_certification",
  "archive_laws",
  "archive_derivation_logic",
  "bootstrap_route_compiler",
  "full_ready_gate",
  "full_ready_proof_protocol",
  "skill_organ_map",
  "current_builder_savepoint",
  "loading_checkpoints",
  "finalization_ledger",
  "preview_cycle_ledger",
  "live_state_verdict",
  "memory",
];

function terminalMove(overrides: Partial<ContinuousLifeTerminalMove> = {}): ContinuousLifeTerminalMove {
  return {
    progress_class: "external_platform_embodiment",
    base_head_sha: liveHead,
    artifact_class: "continuous_life_finalization_packet",
    changed_files: ["platform/packages/route-governor/src/continuous-life-finalization-packet.ts"],
    executable_artifacts: ["compileContinuousLifeFinalizationPacket"],
    routing_artifacts: ["continuous-life packet must include re-entry anchors before terminal release"],
    proof_artifacts: ["dist/continuous-life-finalization-packet-proof.js"],
    status_surface_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<ContinuousLifeFinalizationPacketInput> = {}): ContinuousLifeFinalizationPacketInput {
  return {
    active_pr: 2,
    target_pr: 2,
    active_branch: branch,
    target_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    resolved_repaired_head_sha: promptHead,
    repaired_head_status_resolved: true,
    issue_blocker_closed: true,
    blocker_label_present: false,
    reentry_anchors: anchors,
    organ_chain: [
      "monday-corpus-reentry",
      "monday-source-truth-grader",
      "monday-finalization-operator",
      "monday-external-act-forcer",
    ],
    prohibited_progress_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
      "old_repaired_head_blocker",
    ],
    spent_artifact_classes: [],
    terminal_move: terminalMove(),
    ...overrides,
  };
}

test("admits a continuous-life executable embodiment bound to the live PR sink", () => {
  const verdict = compileContinuousLifeFinalizationPacket(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_continuous_life_embodiment");
  assert.equal(verdict.pr_number, 2);
  assert.equal(verdict.branch, branch);
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.quarantined_head_shas, [promptHead]);
  assert.ok(verdict.decisive_evidence.includes("anchor:monolith_index"));
  assert.ok(verdict.decisive_evidence.includes("organ:monday-external-act-forcer"));
});

test("blocks packets that skip continuous-life re-entry anchors or required organs", () => {
  const verdict = compileContinuousLifeFinalizationPacket(
    input({ reentry_anchors: anchors.filter((anchor) => anchor !== "memory"), organ_chain: ["monday-finalization-operator"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_reentry_anchor");
  assert.ok(verdict.blockers.includes("missing re-entry anchor: memory"));
  assert.ok(verdict.blockers.includes("missing required organ: monday-corpus-reentry"));
});

test("blocks delivery to any PR or branch outside the active manifestation sink", () => {
  const verdict = compileContinuousLifeFinalizationPacket(input({ target_pr: 3, target_branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_external_sink");
  assert.ok(verdict.blockers.includes("target PR #3 does not match active PR #2"));
  assert.ok(verdict.blockers.includes(`target branch main does not match active branch ${branch}`));
});

test("blocks replay of the resolved repaired-head blocker", () => {
  const verdict = compileContinuousLifeFinalizationPacket(
    input({
      terminal_move: terminalMove({
        progress_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker_text: `old blocker for ${promptHead}`,
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_or_repaired_head_replay");
});

test("blocks prohibited progress classes before release", () => {
  const verdict = compileContinuousLifeFinalizationPacket(
    input({ terminal_move: terminalMove({ progress_class: "metadata_reread" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_progress_class");
});

test("blocks fresh status readback without a live-head status surface id", () => {
  const verdict = compileContinuousLifeFinalizationPacket(
    input({
      terminal_move: terminalMove({
        progress_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_surface_ids: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_terminal_move");
  assert.ok(verdict.blockers.includes("fresh status readback has no status surface id"));
});

test("admits a live-head exact blocker that is not the resolved repaired-head blocker", () => {
  const blocker = "current live-head status reader is unavailable for 0a7513a49a30f8eecb699b2cfd95806f58b0c1a8";
  const verdict = compileContinuousLifeFinalizationPacket(
    input({
      terminal_move: terminalMove({
        progress_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker_text: blocker,
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_continuous_life_blocker");
  assert.deepEqual(verdict.blockers, [blocker]);
});