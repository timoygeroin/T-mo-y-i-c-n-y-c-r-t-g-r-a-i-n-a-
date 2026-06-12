import assert from "node:assert/strict";

import {
  compileFinalizationCommand,
  type FinalizationCommandInput,
  type FinalizationRoutedDecision,
} from "./finalization-command-compiler.js";

const branch = "monday-platform-genesis-01";
const head = "ccdb271e21e17545567d4c3d3f8af96b7a8527e8";

function decision(overrides: Partial<FinalizationRoutedDecision> = {}): FinalizationRoutedDecision {
  return {
    ok: true,
    action: "route_to_external_embodiment",
    branch,
    head_sha: head,
    decisive_evidence: ["scheduled finalization selected external embodiment"],
    blockers: [],
    next_route: "commit the selected embodiment and bind status to the moved head",
    ...overrides,
  };
}

function input(overrides: Partial<FinalizationCommandInput> = {}): FinalizationCommandInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    command_id: "finalization-command-compiler-01",
    decision: decision(),
    changed_files: ["platform/packages/route-governor/src/finalization-command-compiler.ts"],
    executable_artifacts: ["compileFinalizationCommand"],
    routing_artifacts: ["routed decisions compile into terminal external commands"],
    proof_artifacts: ["platform/packages/route-governor/src/finalization-command-compiler-proof.ts"],
    ...overrides,
  };
}

const embodiment = compileFinalizationCommand(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.command_kind, "commit_external_embodiment");
assert.deepEqual(embodiment.required_surfaces, ["github_contents_write", "moved_head_status_readback"]);
assert.match(embodiment.decisive_evidence.join("\n"), /compileFinalizationCommand/);

const proofOnly = compileFinalizationCommand(
  input({
    changed_files: ["platform/packages/route-governor/src/finalization-command-compiler-proof.ts"],
  }),
);
assert.equal(proofOnly.ok, false);
assert.equal(proofOnly.command_kind, "block_release");
assert.match(proofOnly.blockers.join("\n"), /no behavior-bearing platform file/);

const status = compileFinalizationCommand(
  input({
    decision: decision({ action: "route_to_live_status_readback", decisive_evidence: ["live head moved since last readback"] }),
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
  }),
);
assert.equal(status.ok, true);
assert.equal(status.command_kind, "read_live_head_status");
assert.deepEqual(status.required_surfaces, ["github_checks_api", "github_actions_runs_api"]);

const blocker = compileFinalizationCommand(
  input({
    decision: decision({
      action: "route_to_exact_blocker",
      decisive_evidence: ["connector write failed"],
      blockers: ["GitHub contents API rejected writes to monday-platform-genesis-01"],
    }),
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
  }),
);
assert.equal(blocker.ok, true);
assert.equal(blocker.command_kind, "emit_exact_external_blocker");

const stale = compileFinalizationCommand(
  input({ decision: decision({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
);
assert.equal(stale.ok, false);
assert.equal(stale.command_kind, "block_release");
assert.match(stale.blockers.join("\n"), /does not match live head/);

console.log("finalization command compiler proof passed");
