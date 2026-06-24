import assert from "node:assert/strict";
import test from "node:test";

import { selectPostEscrowContinuation, type PostEscrowContinuationInput } from "./post-escrow-continuation-selector.js";
import type { PostWriteStatusEscrowVerdict } from "./post-write-status-escrow.js";
import type { StatusReadbackTransportVerdict } from "./status-readback-transport.js";

const branch = "monday-platform-genesis-01";
const liveHead = "1f34695bb561cea516249b6d9057cb2a8d7347b0";

function escrow(overrides: Partial<PostWriteStatusEscrowVerdict> = {}): PostWriteStatusEscrowVerdict {
  return {
    ok: true,
    action: "open_post_write_status_escrow",
    branch,
    base_head_sha: "previous-head",
    required_status_head_sha: liveHead,
    escrow_id: "post-escrow-selector-proof",
    decisive_evidence: ["escrow post-escrow-selector-proof", `required status head ${liveHead}`],
    blockers: [],
    next_route: "read fresh status for the moved post-write head",
    ...overrides,
  };
}

function transport(overrides: Partial<StatusReadbackTransportVerdict> = {}): StatusReadbackTransportVerdict {
  return {
    ok: true,
    action: "route_to_executable_embodiment",
    branch,
    required_head_sha: liveHead,
    selected_surface: null,
    decisive_evidence: ["github_cli missing: gh command is unavailable", "checks_api blocked: no check-run connector"],
    blocker: null,
    next_route: "skip status-claim release; commit the complete executable embodiment fallback",
    ...overrides,
  };
}

function input(overrides: Partial<PostEscrowContinuationInput> = {}): PostEscrowContinuationInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    escrow: escrow(),
    transport: transport(),
    spent_artifact_classes: ["post_write_status_escrow"],
    prohibited_blockers: ["CURRENT_HEAD_STATUS_READBACK_BLOCKED:b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    candidate: {
      candidate_id: "post-escrow-selector",
      artifact_class: "post_escrow_continuation_selector",
      changed_files: ["platform/packages/route-governor/src/post-escrow-continuation-selector.ts"],
      executable_artifacts: ["selectPostEscrowContinuation"],
      routing_artifacts: ["post-write escrow plus status-transport continuation selector"],
      proof_artifacts: ["platform/packages/route-governor/src/post-escrow-continuation-selector.test.ts"],
    },
    ...overrides,
  };
}

test("selects a statusless executable fallback when escrow is open and status transport routes to embodiment", () => {
  const verdict = selectPostEscrowContinuation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_statusless_embodiment");
  assert.equal(verdict.branch, branch);
  assert.equal(verdict.head_sha, liveHead);
  assert(verdict.decisive_evidence.includes("no current-head status claim is released"));
  assert(verdict.decisive_evidence.includes("selectPostEscrowContinuation"));
  assert.match(verdict.next_route, /open a new post-write status escrow/);
});

test("selects a current-head status readback only when escrow and transport both bind to the live head", () => {
  const verdict = selectPostEscrowContinuation(
    input({
      escrow: escrow({ action: "release_head_bound_status" }),
      transport: transport({
        action: "use_status_transport",
        selected_surface: {
          kind: "checks_api",
          state: "reachable",
          head_sha: liveHead,
          evidence: "Checks API returned current-head successful runs",
        },
        decisive_evidence: ["Checks API returned current-head successful runs"],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_head_status_readback");
  assert(verdict.decisive_evidence.includes("checks_api"));
  assert.match(verdict.next_route, /do not bundle embodiment/);
});

test("emits an exact status access blocker when escrow is open and transport has no fallback", () => {
  const blocker = `CURRENT_HEAD_STATUS_READBACK_BLOCKED:${liveHead}:no reachable Checks, Actions, GitHub CLI, or workflow-published readback surface is available for ${branch}`;
  const verdict = selectPostEscrowContinuation(
    input({
      transport: transport({
        ok: false,
        action: "emit_exact_status_access_blocker",
        decisive_evidence: ["github_cli missing: gh command is unavailable"],
        blocker,
        next_route: "obtain an authenticated current-head Checks/Actions surface",
      }),
      candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_exact_external_blocker");
  assert.deepEqual(verdict.blockers, [blocker]);
});

test("blocks stale repaired-head status authority", () => {
  const verdict = selectPostEscrowContinuation(
    input({
      transport: transport({ required_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_premature_or_repeated_continuation");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks repeated fallback artifact classes", () => {
  const verdict = selectPostEscrowContinuation(
    input({
      spent_artifact_classes: ["post_escrow_continuation_selector"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /repeats spent artifact class/);
});

test("blocks proof-only fallback candidates", () => {
  const verdict = selectPostEscrowContinuation(
    input({
      candidate: {
        candidate_id: "proof-only",
        artifact_class: "proof_only_post_escrow_selector",
        changed_files: ["platform/packages/route-governor/src/post-escrow-continuation-selector-proof.ts"],
        executable_artifacts: ["selectPostEscrowContinuation"],
        routing_artifacts: ["proof-only fallback should not be accepted"],
        proof_artifacts: ["platform/packages/route-governor/src/post-escrow-continuation-selector-proof.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /no behavior-bearing platform file/);
});
