import test from "node:test";
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

test("compiles an external embodiment route into a write command", () => {
  const command = compileFinalizationCommand(input());

  assert.equal(command.ok, true);
  assert.equal(command.command_kind, "commit_external_embodiment");
  assert.deepEqual(command.required_surfaces, ["github_contents_write", "moved_head_status_readback"]);
  assert.match(command.next_required_action, /read status only for the moved PR head/);
});

test("blocks proof-only embodiment commands", () => {
  const command = compileFinalizationCommand(
    input({ changed_files: ["platform/packages/route-governor/src/finalization-command-compiler.test.ts"] }),
  );

  assert.equal(command.ok, false);
  assert.equal(command.command_kind, "block_release");
  assert.deepEqual(command.blockers, ["external command has no behavior-bearing platform file"]);
});

test("compiles live-head status readback without requiring file edits", () => {
  const command = compileFinalizationCommand(
    input({
      decision: decision({ action: "route_to_live_status_readback", decisive_evidence: ["head moved to live target"] }),
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(command.ok, true);
  assert.equal(command.command_kind, "read_live_head_status");
  assert.deepEqual(command.required_surfaces, ["github_checks_api", "github_actions_runs_api"]);
});

test("compiles an exact external blocker only when blocker text is present", () => {
  const missing = compileFinalizationCommand(
    input({
      decision: decision({ action: "route_to_exact_blocker", decisive_evidence: [], blockers: [] }),
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(missing.ok, false);
  assert.match(missing.blockers.join("\n"), /exact blocker route has no blocker text/);

  const present = compileFinalizationCommand(
    input({
      decision: decision({
        action: "route_to_exact_blocker",
        decisive_evidence: ["write surface rejected branch update"],
        blockers: ["GitHub contents API rejected writes to the active branch"],
      }),
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(present.ok, true);
  assert.equal(present.command_kind, "emit_exact_external_blocker");
});

test("blocks stale routed decisions before command release", () => {
  const command = compileFinalizationCommand(input({ decision: decision({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }));

  assert.equal(command.ok, false);
  assert.equal(command.command_kind, "block_release");
  assert.match(command.blockers.join("\n"), /does not match live head/);
});
