import test from "node:test";
import assert from "node:assert/strict";

import { compileCurrentHeadFailureIntake, type CurrentHeadFailureIntakeInput } from "./current-head-failure-intake.js";

const branch = "monday-platform-genesis-01";
const head = "e1f755cf89daf234ceb727166cb74fbce3e5d51b";

function input(overrides: Partial<CurrentHeadFailureIntakeInput> = {}): CurrentHeadFailureIntakeInput {
  return {
    branch,
    active_branch: branch,
    head_sha: head,
    status_verdict: "failing",
    failure_surfaces: [
      {
        surface_id: "run-27090000001",
        source: "actions_step_log",
        head_sha: head,
        check_name: "Monday Platform CI / Route governor proof surface",
        failed_step: "Run proof examples",
        exit_code: 1,
        annotation_count: 1,
        assertion: "expected proof_chain_ready, got repair_proof_chain",
      },
    ],
    prior_failure_signatures: [],
    ...overrides,
  };
}

test("routes actionable current-head failure into a bounded repair", () => {
  const verdict = compileCurrentHeadFailureIntake(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "repair_from_actionable_failure");
  assert.equal(verdict.actionable_failure, "expected proof_chain_ready, got repair_proof_chain");
  assert.deepEqual(verdict.blockers, []);
  assert.equal(
    verdict.next_route,
    "repair only the concrete current-head failure and bind the next status readback to the moved head",
  );
});

test("demands stronger logs when only a public check summary is available", () => {
  const verdict = compileCurrentHeadFailureIntake(
    input({
      failure_surfaces: [
        {
          surface_id: "public-checks-summary",
          source: "public_checks_summary",
          head_sha: head,
          check_name: "Monday Platform CI / Route governor proof surface",
          failed_step: "Run proof examples",
          exit_code: 1,
          annotation_count: 1,
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "obtain_stronger_actions_log");
  assert.deepEqual(verdict.blockers, ["current-head failure surface has no actionable log excerpt or assertion"]);
});

test("rejects stale failure surfaces from older heads", () => {
  const verdict = compileCurrentHeadFailureIntake(
    input({
      failure_surfaces: [
        {
          surface_id: "old-run",
          source: "actions_step_log",
          head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
          check_name: "Monday Platform CI / Route governor proof surface",
          failed_step: "Run proof examples",
          exit_code: 1,
          assertion: "old head assertion",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_failure_surface");
  assert.ok(verdict.blockers[0].includes("not e1f755cf89daf234ceb727166cb74fbce3e5d51b"));
});

test("blocks repeating an already consumed failure signature", () => {
  const surface = input().failure_surfaces[0];
  const verdict = compileCurrentHeadFailureIntake(
    input({
      prior_failure_signatures: [`${surface.head_sha}|${surface.check_name}|${surface.failed_step}|${surface.exit_code}`],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "obtain_stronger_actions_log");
  assert.deepEqual(verdict.blockers, ["all attached failure surfaces repeat already-consumed failure signatures"]);
});

test("does not invent a repair when the current head is not failing", () => {
  const verdict = compileCurrentHeadFailureIntake(input({ status_verdict: "pending", failure_surfaces: [] }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "wait_for_failing_status");
  assert.deepEqual(verdict.blockers, []);
});

test("blocks the wrong branch before reading failure evidence", () => {
  const verdict = compileCurrentHeadFailureIntake(input({ branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.ok(verdict.blockers[0].includes("does not match active branch"));
});
