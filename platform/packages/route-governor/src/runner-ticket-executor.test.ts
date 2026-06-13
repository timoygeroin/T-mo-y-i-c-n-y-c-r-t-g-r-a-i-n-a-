import assert from "node:assert/strict";
import { test } from "node:test";

import type { EmbodimentRunnerSchedulerVerdict } from "./embodiment-runner-scheduler.js";
import { compileRunnerTicketExecution, type RunnerTicketExecutorInput } from "./runner-ticket-executor.js";

const branch = "monday-platform-genesis-01";
const head = "8807deefdeca17cc3edd054335f2bc5e43290743";

function scheduler(overrides: Partial<EmbodimentRunnerSchedulerVerdict> = {}): EmbodimentRunnerSchedulerVerdict {
  return {
    ok: true,
    action: "schedule_next_embodiment_runner",
    branch,
    head_sha: head,
    ticket: {
      ticket_id: `runtime-executor:${head}`,
      candidate_id: "runtime-executor",
      artifact_class: "runner-ticket-executor",
      capability_axis: "runtime_execution",
      branch,
      base_head_sha: head,
      required_receipt_ids: ["receipt:live-head-intake"],
      next_status_expected: "resulting_head_after_ticket_execution",
    },
    rejected: [],
    decisive_evidence: ["runtime-executor", head],
    blockers: [],
    next_route: "execute the scheduled runner ticket",
    ...overrides,
  };
}

function input(overrides: Partial<RunnerTicketExecutorInput> = {}): RunnerTicketExecutorInput {
  return {
    scheduler: scheduler(),
    active_branch: branch,
    live_head_sha: head,
    execution_id: "execute-runner-ticket-01",
    spent_execution_ids: [],
    mutations: [
      {
        mutation_id: "add-runner-ticket-executor",
        kind: "create_file",
        path: "platform/packages/route-governor/src/runner-ticket-executor.ts",
        commit_message: "Add runner ticket executor",
        content_source: "workspace-generated source content",
        artifact_class: "runner-ticket-executor",
        receipt_id: "receipt:runner-ticket-executor",
      },
    ],
    ...overrides,
  };
}

test("compiles scheduled runner ticket into executable GitHub contents mutations", () => {
  const verdict = compileRunnerTicketExecution(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_runner_ticket_mutations");
  assert.equal(verdict.ticket_id, `runtime-executor:${head}`);
  assert.equal(verdict.mutations[0]?.path, "platform/packages/route-governor/src/runner-ticket-executor.ts");
  assert.equal(verdict.receipt_seeds[0]?.base_head_sha, head);
  assert.equal(verdict.receipt_seeds[0]?.next_status_expected_head, "post-write-head");
});

test("blocks stale tickets after the live head moves", () => {
  const verdict = compileRunnerTicketExecution(
    input({
      live_head_sha: "newer-head",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_runner_ticket_execution");
  assert.match(verdict.blockers.join("\n"), /not live head newer-head/);
});

test("blocks replayed execution ids", () => {
  const verdict = compileRunnerTicketExecution(
    input({
      spent_execution_ids: ["execute-runner-ticket-01"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, ["runner ticket execution already spent: execute-runner-ticket-01"]);
});

test("requires mutation artifact class to match the scheduled ticket", () => {
  const verdict = compileRunnerTicketExecution(
    input({
      mutations: [
        {
          mutation_id: "wrong-artifact",
          kind: "create_file",
          path: "platform/packages/route-governor/src/wrong-artifact.ts",
          commit_message: "Add wrong artifact",
          content_source: "workspace-generated source content",
          artifact_class: "different-artifact",
          receipt_id: "receipt:wrong-artifact",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /does not match ticket artifact runner-ticket-executor/);
});

test("blocks duplicate paths and duplicate receipts", () => {
  const verdict = compileRunnerTicketExecution(
    input({
      mutations: [
        {
          mutation_id: "first",
          kind: "create_file",
          path: "platform/packages/route-governor/src/runner-ticket-executor.ts",
          commit_message: "Add runner ticket executor",
          content_source: "workspace-generated source content",
          artifact_class: "runner-ticket-executor",
          receipt_id: "receipt:runner-ticket-executor",
        },
        {
          mutation_id: "second",
          kind: "create_file",
          path: "platform/packages/route-governor/src/runner-ticket-executor.ts",
          commit_message: "Add runner ticket executor again",
          content_source: "workspace-generated source content",
          artifact_class: "runner-ticket-executor",
          receipt_id: "receipt:runner-ticket-executor",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /repeats path/);
  assert.match(verdict.blockers.join("\n"), /repeats receipt id/);
});
