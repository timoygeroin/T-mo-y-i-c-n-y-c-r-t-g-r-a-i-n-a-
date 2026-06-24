import assert from "node:assert/strict";

import type { EmbodimentRunnerSchedulerVerdict } from "./embodiment-runner-scheduler.js";
import { compileRunnerTicketExecution } from "./runner-ticket-executor.js";

const branch = "monday-platform-genesis-01";
const head = "8807deefdeca17cc3edd054335f2bc5e43290743";

const scheduler: EmbodimentRunnerSchedulerVerdict = {
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
};

const verdict = compileRunnerTicketExecution({
  scheduler,
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
});

assert.equal(verdict.ok, true);
assert.equal(verdict.action, "compile_runner_ticket_mutations");
assert.deepEqual(verdict.blockers, []);
assert.equal(verdict.mutations.length, 1);
assert.equal(verdict.receipt_seeds[0]?.receipt_id, "receipt:runner-ticket-executor");
assert.match(verdict.next_route, /write the compiled mutations serially/);

const stale = compileRunnerTicketExecution({
  scheduler,
  active_branch: branch,
  live_head_sha: "newer-head",
  execution_id: "execute-runner-ticket-02",
  spent_execution_ids: [],
  mutations: [],
});

assert.equal(stale.ok, false);
assert.match(stale.blockers.join("\n"), /not live head newer-head/);

console.log("runner ticket executor proof passed");
