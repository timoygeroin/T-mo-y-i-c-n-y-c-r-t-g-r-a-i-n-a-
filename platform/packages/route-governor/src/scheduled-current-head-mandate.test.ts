import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileScheduledCurrentHeadMandate,
  type ScheduledCurrentHeadMandateInput,
} from "./scheduled-current-head-mandate.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "44295dc0bd5a41972e6fd43531ac8215c9b970f4";

function input(overrides: Partial<ScheduledCurrentHeadMandateInput> = {}): ScheduledCurrentHeadMandateInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    active_branch: branch,
    prompt_head_sha: promptHead,
    live_head_sha: liveHead,
    last_status_head_sha: promptHead,
    resolved_historical_heads: [promptHead],
    surfaces: [
      {
        surface_id: "live-pr-metadata:44295dc",
        kind: "live_pr_metadata",
        branch,
        head_sha: liveHead,
        evidence: [`PR #2 head ${liveHead}`, "PR #2 non-draft/open"],
      },
      {
        surface_id: "scheduled-prompt:b38",
        kind: "scheduled_prompt",
        branch,
        head_sha: promptHead,
        evidence: [`prompt-carried repaired head ${promptHead}`],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-current-head-mandate.ts"],
      executable_artifacts: ["compileScheduledCurrentHeadMandate"],
      routing_artifacts: ["scheduled mandate rebases future runs to live PR metadata before progress claims"],
      proof_artifacts: ["dist/scheduled-current-head-mandate.test.js"],
    },
    ...overrides,
  };
}

test("compiles a current-head embodiment mandate and quarantines prompt-carried historical heads", () => {
  const verdict = compileScheduledCurrentHeadMandate(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_live_head_mandate");
  assert.equal(verdict.head_sha, liveHead);
  assert.ok(verdict.accepted_surface_ids.includes("live-pr-metadata:44295dc"));
  assert.ok(verdict.quarantined_surface_ids.includes("scheduled-prompt:b38"));
  assert.ok(verdict.historical_head_shas.includes(promptHead));
  assert.match(verdict.mandate ?? "", new RegExp(`Current live head: ${liveHead}`));
  assert.match(verdict.mandate ?? "", /Do not reuse prompt-carried, PR-body, or memory heads as current/);
});

test("blocks candidates still based on the prompt-carried repaired head", () => {
  const verdict = compileScheduledCurrentHeadMandate(
    input({
      candidate: {
        move_class: "external_platform_embodiment",
        branch,
        base_head_sha: promptHead,
        changed_files: ["platform/packages/route-governor/src/scheduled-current-head-mandate.ts"],
        executable_artifacts: ["compileScheduledCurrentHeadMandate"],
        routing_artifacts: ["rebased mandate"],
        proof_artifacts: ["dist/scheduled-current-head-mandate.test.js"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_base");
  assert.deepEqual(verdict.blockers, [`candidate base ${promptHead} is not live head ${liveHead}`]);
});

test("routes fresh status mandates when the live head moved since the last status head", () => {
  const verdict = compileScheduledCurrentHeadMandate(
    input({
      candidate: {
        move_class: "fresh_status_readback",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_live_head_status_mandate");
  assert.ok(verdict.decisive_evidence.includes(`head moved from ${promptHead} to ${liveHead}`));
});

test("blocks fresh status mandate replay when neither the head moved nor status evidence exists", () => {
  const verdict = compileScheduledCurrentHeadMandate(
    input({
      prompt_head_sha: liveHead,
      last_status_head_sha: liveHead,
      resolved_historical_heads: [],
      surfaces: [
        {
          surface_id: "live-pr-metadata:44295dc",
          kind: "live_pr_metadata",
          branch,
          head_sha: liveHead,
          evidence: [`PR #2 head ${liveHead}`],
        },
      ],
      candidate: {
        move_class: "fresh_status_readback",
        branch,
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.deepEqual(verdict.blockers, ["fresh status mandate requires a moved head or direct live-head status surface"]);
});

test("blocks mandate compilation without live PR metadata", () => {
  const verdict = compileScheduledCurrentHeadMandate(
    input({
      surfaces: [
        {
          surface_id: "pr-body-summary:stale",
          kind: "pr_body_summary",
          branch,
          head_sha: promptHead,
          evidence: ["PR body still names repaired-head success"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_live_metadata");
});

test("blocks proof-only embodiment mandates", () => {
  const verdict = compileScheduledCurrentHeadMandate(
    input({
      candidate: {
        move_class: "external_platform_embodiment",
        branch,
        base_head_sha: liveHead,
        changed_files: ["platform/packages/route-governor/src/scheduled-current-head-mandate.test.ts"],
        executable_artifacts: ["compileScheduledCurrentHeadMandate"],
        routing_artifacts: ["scheduled mandate rebases future runs"],
        proof_artifacts: ["dist/scheduled-current-head-mandate.test.js"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.ok(verdict.blockers.includes("candidate is proof-only and has no behavior file"));
});
