import assert from "node:assert/strict";
import test from "node:test";

import {
  compileFailureDetailEscalation,
  type FailureDetailEscalationInput,
} from "./failure-detail-escalation.js";

const branch = "monday-platform-genesis-01";
const head = "75629952307b1d774bb565a709ed9b01d05290cd";

function input(overrides: Partial<FailureDetailEscalationInput> = {}): FailureDetailEscalationInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: head,
    failing_surface: {
      surface_id: "current-head-public-summary",
      kind: "public_checks_summary",
      head_sha: head,
      check_name: "Monday Platform CI / Route governor proof surface",
      failed_step: "Run proof examples",
      exit_code: 1,
      annotation_count: 1,
    },
    available_transports: [
      {
        transport_id: "issue-readback",
        kind: "issue_published_readback",
        available: true,
        command: "read issue-published PR head status payload",
      },
      {
        transport_id: "actions-log",
        kind: "actions_step_log",
        available: true,
        command: "read Actions step log",
      },
    ],
    spent_escalation_signatures: [],
    ...overrides,
  };
}

test("prefers Actions step log over weaker detail transports", () => {
  const verdict = compileFailureDetailEscalation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "request_actions_step_log");
  assert.equal(verdict.next_command, "read Actions step log");
});

test("routes directly to repair when concrete detail is present", () => {
  const verdict = compileFailureDetailEscalation(
    input({
      failing_surface: {
        surface_id: "current-head-actions-log",
        kind: "actions_step_log",
        head_sha: head,
        check_name: "Route Governor Proof / Route governor proof examples",
        failed_step: "Run route governor proof",
        exit_code: 1,
        detail_excerpt: "AssertionError: expected exact blocker to remain bound to live head",
      },
      available_transports: [],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "repair_from_detail");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks stale failure summaries from older heads", () => {
  const verdict = compileFailureDetailEscalation(
    input({
      failing_surface: {
        surface_id: "stale-summary",
        kind: "public_checks_summary",
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        check_name: "Route Governor Proof / Route governor proof examples",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_surface");
  assert.match(verdict.blockers[0], /not live head/);
});

test("blocks repeated escalation without new detail", () => {
  const verdict = compileFailureDetailEscalation(
    input({
      available_transports: [],
      spent_escalation_signatures: [
        `${branch}|${head}|Monday Platform CI / Route governor proof surface|Run proof examples|1|1`,
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_escalation");
});

test("emits exact detail-acquisition blocker when no transport exists", () => {
  const verdict = compileFailureDetailEscalation(input({ available_transports: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "request_actions_step_log");
  assert.deepEqual(verdict.blockers, [
    "current-head proof failure has no actionable assertion and no available detail transport",
  ]);
});
