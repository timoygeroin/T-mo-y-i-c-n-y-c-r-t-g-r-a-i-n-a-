import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileLiveHeadEmbodimentChoice,
  type ChoiceHeadSource,
  type LiveHeadChoiceInput,
} from "./live-head-choice-reconciliation.js";
import type { EmbodimentChoiceCandidate } from "./embodiment-choice-kernel.js";

const branch = "monday-platform-genesis-01";
const liveHead = "db3f46ed676947e526788867d5838a6cc906d18c";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const prBodyHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function source(overrides: Partial<ChoiceHeadSource> = {}): ChoiceHeadSource {
  return {
    source_id: "live-pr-metadata",
    kind: "live_pr_metadata",
    head_sha: liveHead,
    evidence: [`GitHub PR metadata reports live head ${liveHead}`],
    ...overrides,
  };
}

function candidate(overrides: Partial<EmbodimentChoiceCandidate> = {}): EmbodimentChoiceCandidate {
  return {
    candidate_id: "live-head-choice-reconciliation",
    changed_files: [
      "platform/packages/route-governor/src/live-head-choice-reconciliation.ts",
      "platform/packages/route-governor/src/live-head-choice-reconciliation.test.ts",
    ],
    executable_exports: ["reconcileLiveHeadEmbodimentChoice"],
    proof_artifacts: ["dist/live-head-choice-reconciliation.test.js"],
    routing_effects: ["choose executable embodiment when prompt and PR-body status summaries are stale"],
    choice_classes: ["runtime_behavior", "future_routing", "proof_surface"],
    ...overrides,
  };
}

function input(overrides: Partial<LiveHeadChoiceInput> = {}): LiveHeadChoiceInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    last_repaired_head_sha: repairedHead,
    exhausted_move_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "internal_memory_guard",
      "warning_repair",
    ],
    sources: [
      source({
        source_id: "prompt-repaired-head-success",
        kind: "prompt",
        head_sha: repairedHead,
        status: "passing_with_warnings",
        evidence: ["prompt says repaired head checks succeeded"],
      }),
      source({
        source_id: "pr-body-older-failure",
        kind: "pr_body_summary",
        head_sha: prBodyHead,
        status: "failing",
        evidence: ["PR body says an older moved head failed proof examples"],
      }),
      source(),
    ],
    candidates: [
      candidate({
        candidate_id: "duplicate-status-readback",
        changed_files: [],
        executable_exports: [],
        proof_artifacts: [],
        routing_effects: [],
        choice_classes: ["status_readback"],
        depends_on_head_move: true,
      }),
      candidate(),
    ],
    ...overrides,
  };
}

test("selects executable embodiment when prompt and PR-body status summaries are stale", () => {
  const verdict = reconcileLiveHeadEmbodimentChoice(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_executable_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.selected_candidate_id, "live-head-choice-reconciliation");
  assert.deepEqual(verdict.stale_source_ids, ["prompt-repaired-head-success", "pr-body-older-failure"]);
  assert.equal(verdict.rejected[0]?.candidate_id, "duplicate-status-readback");
  assert.match(verdict.next_route, /require status readback for the moved head/);
});

test("routes live-head failures to repair before selecting another embodiment", () => {
  const verdict = reconcileLiveHeadEmbodimentChoice(
    input({
      sources: [
        source(),
        source({
          source_id: "live-actions-failure",
          kind: "actions_readback",
          head_sha: liveHead,
          status: "failing",
          evidence: ["Run proof examples exited with 1 on the live head"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_live_head_failure");
  assert.deepEqual(verdict.blockers, ["Run proof examples exited with 1 on the live head"]);
});

test("holds pending live-head status instead of inventing a pass or failure", () => {
  const verdict = reconcileLiveHeadEmbodimentChoice(
    input({
      sources: [
        source(),
        source({
          source_id: "live-checks-pending",
          kind: "public_checks_page",
          head_sha: liveHead,
          status: "pending",
          evidence: ["public checks page still pending for live head"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "read_live_head_status");
  assert.match(verdict.next_route, /wait for the live-head status surface/);
});

test("blocks release when no executable candidate survives choice pressure", () => {
  const verdict = reconcileLiveHeadEmbodimentChoice(
    input({
      candidates: [
        candidate({
          candidate_id: "metadata-reread",
          changed_files: [],
          executable_exports: [],
          proof_artifacts: [],
          routing_effects: [],
          choice_classes: ["metadata_only"],
          repeats_move_class: "metadata_reread",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_candidate");
  assert.match(verdict.blockers.join("; "), /no executable embodiment candidate survived/);
});
