import assert from "node:assert/strict";

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
      surface_id: "public-checks-current-head-proof-failure",
      kind: "public_checks_summary",
      head_sha: head,
      check_name: "Monday Platform CI / Route governor proof surface",
      failed_step: "Run proof examples",
      exit_code: 1,
      annotation_count: 1,
    },
    available_transports: [
      {
        transport_id: "actions-step-log",
        kind: "actions_step_log",
        available: true,
        command: "read Actions log for current-head Route governor proof surface failure",
      },
    ],
    spent_escalation_signatures: [],
    ...overrides,
  };
}

const escalation = compileFailureDetailEscalation(input());
assert.equal(escalation.ok, true);
assert.equal(escalation.action, "request_actions_step_log");
assert.equal(escalation.next_command, "read Actions log for current-head Route governor proof surface failure");
assert.match(escalation.next_route, /before selecting any repair candidate/);

const actionable = compileFailureDetailEscalation(
  input({
    failing_surface: {
      surface_id: "actions-log-current-head-proof-failure",
      kind: "actions_step_log",
      head_sha: head,
      check_name: "Monday Platform CI / Route governor proof surface",
      failed_step: "Run proof examples",
      exit_code: 1,
      detail_excerpt: "AssertionError: expected merge readiness proof to accept ready review surface",
    },
  }),
);
assert.equal(actionable.ok, true);
assert.equal(actionable.action, "repair_from_detail");
assert.equal(actionable.next_command, null);

const stale = compileFailureDetailEscalation(
  input({
    failing_surface: {
      surface_id: "old-public-checks-failure",
      kind: "public_checks_summary",
      head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
      check_name: "Monday Platform CI / Route governor proof surface",
      failed_step: "Run proof examples",
      exit_code: 1,
    },
  }),
);
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_surface");

const repeated = compileFailureDetailEscalation(
  input({
    available_transports: [],
    spent_escalation_signatures: [
      `${branch}|${head}|Monday Platform CI / Route governor proof surface|Run proof examples|1|1`,
    ],
  }),
);
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_escalation");

const noTransport = compileFailureDetailEscalation(input({ available_transports: [] }));
assert.equal(noTransport.ok, false);
assert.deepEqual(noTransport.blockers, [
  "current-head proof failure has no actionable assertion and no available detail transport",
]);

console.log("failure-detail escalation proof passed");
