import assert from "node:assert/strict";
import { test } from "node:test";

import {
  intakeScheduledCurrentHead,
  type ScheduledCurrentHeadIntakeInput,
} from "./scheduled-current-head-intake.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "23901d5e7daeafde318bd56ea9e9e1699f538745";

function input(overrides: Partial<ScheduledCurrentHeadIntakeInput> = {}): ScheduledCurrentHeadIntakeInput {
  return {
    active_branch: branch,
    expected_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    resolved_historical_heads: [repairedHead],
    requested_progress_class: "external_platform_embodiment",
    sources: [
      {
        source_id: "scheduled-prompt-head",
        kind: "scheduled_prompt",
        tier: "direct_current",
        branch,
        head_sha: repairedHead,
        evidence: ["scheduled prompt preserved the older repaired head"],
      },
      {
        source_id: "connector-pr-metadata",
        kind: "connector_readback",
        tier: "direct_external",
        branch,
        head_sha: liveHead,
        evidence: ["PR metadata readback surfaced the current live head"],
      },
    ],
    embodiment_candidate: {
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-current-head-intake.ts"],
      executable_artifacts: ["intakeScheduledCurrentHead"],
      routing_artifacts: ["scheduled runs demote stale prompt heads before terminal progress"],
    },
    ...overrides,
  };
}

test("admits live-head executable embodiment while demoting stale prompt heads", () => {
  const verdict = intakeScheduledCurrentHead(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.deepEqual(verdict.authoritative_source_ids, ["connector-pr-metadata"]);
  assert.deepEqual(verdict.demoted_source_ids, ["scheduled-prompt-head"]);
  assert.equal(verdict.quarantined_heads.includes(repairedHead), true);
});

test("admits moved-head status readback when no embodiment candidate is selected", () => {
  const verdict = intakeScheduledCurrentHead(
    input({
      requested_progress_class: "fresh_status_readback",
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_moved_head_status_readback");
  assert.match(verdict.decisive_evidence.join("\n"), /status head moved/);
});

test("blocks duplicate status readback when the status head has not moved", () => {
  const verdict = intakeScheduledCurrentHead(
    input({
      previous_status_head_sha: liveHead,
      requested_progress_class: "fresh_status_readback",
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_readback");
});

test("blocks reuse of the resolved repaired-head blocker", () => {
  const verdict = intakeScheduledCurrentHead(
    input({
      requested_progress_class: "repaired_head_blocker",
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repaired_head_reuse");
  assert.match(verdict.decisive_evidence.join("\n"), /quarantined historical head/);
});

test("blocks explicitly non-progress terminal classes", () => {
  const verdict = intakeScheduledCurrentHead(
    input({
      requested_progress_class: "duplicate_ci_summary",
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_class");
});

test("blocks embodiment candidates based on stale heads", () => {
  const verdict = intakeScheduledCurrentHead(
    input({
      embodiment_candidate: {
        base_head_sha: repairedHead,
        changed_files: ["platform/packages/route-governor/src/scheduled-current-head-intake.ts"],
        executable_artifacts: ["intakeScheduledCurrentHead"],
        routing_artifacts: ["scheduled runs demote stale prompt heads before terminal progress"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
});

test("admits exact external blockers only when named", () => {
  const verdict = intakeScheduledCurrentHead(
    input({
      requested_progress_class: "exact_external_blocker",
      embodiment_candidate: undefined,
      blocker: "GitHub contents API rejected writes to monday-platform-genesis-01",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_exact_external_blocker");
});
