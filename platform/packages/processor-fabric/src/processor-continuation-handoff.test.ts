import assert from "node:assert/strict";
import test from "node:test";

import {
  routeProcessorContinuationHandoff,
  type ProcessorContinuationHandoffInput,
  type ProcessorContinuationTargetReceipt,
} from "./processor-continuation-handoff.js";
import type { SourceAuthorizedConvergenceVerdict } from "./source-authorized-convergence.js";

const branch = "monday-platform-genesis-01";
const liveHead = "live-head";

function convergence(overrides: Partial<SourceAuthorizedConvergenceVerdict> = {}): SourceAuthorizedConvergenceVerdict {
  return {
    ok: true,
    action: "settle_source_authorized_external_act",
    scene_id: "loading-20-finalization",
    branch,
    head_sha: liveHead,
    accepted_output: "create processor-selected embodiment",
    authorized_outputs: ["authority-1", "receipt-1"],
    decisive_evidence: ["source-authorized processor convergence"],
    blockers: [],
    next_route: "release the source-authorized external act",
    ...overrides,
  };
}

function receipt(overrides: Partial<ProcessorContinuationTargetReceipt> = {}): ProcessorContinuationTargetReceipt {
  return {
    target_id: "processor-continuation-target-1",
    target: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/processor-fabric/src/processor-continuation-handoff.ts"],
    behavior_exports: ["routeProcessorContinuationHandoff"],
    routing_artifacts: ["processor convergence cannot become comments, stale status, or memory-only progress"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-continuation-handoff-proof.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<ProcessorContinuationHandoffInput> = {}): ProcessorContinuationHandoffInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    handoff_id: "processor-continuation-handoff-1",
    spent_handoff_ids: [],
    convergence: convergence(),
    target_receipt: receipt(),
    ...overrides,
  };
}

test("hands source-authorized processor convergence to an external embodiment target", () => {
  const verdict = routeProcessorContinuationHandoff(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "handoff_processor_external_act");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("routeProcessorContinuationHandoff"));
  assert.match(verdict.next_route, /moved-head status/);
});

test("blocks stale convergence heads before processor handoff", () => {
  const verdict = routeProcessorContinuationHandoff(input({ convergence: convergence({ head_sha: "old-head" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_head");
  assert.deepEqual(verdict.blockers, ["processor convergence head old-head is not live head live-head"]);
});

test("blocks non-progress handoff targets", () => {
  const verdict = routeProcessorContinuationHandoff(input({ target_receipt: receipt({ target: "duplicate_comment" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_target");
  assert.match(verdict.blockers.join("; "), /duplicate_comment/);
});

test("blocks proof-only external act targets", () => {
  const verdict = routeProcessorContinuationHandoff(
    input({
      target_receipt: receipt({ changed_files: ["platform/packages/processor-fabric/src/processor-continuation-handoff-proof.ts"] }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_external_act");
  assert.ok(verdict.blockers.includes("processor handoff target has no behavior-bearing file"));
});

test("releases exact blockers settled by processor convergence", () => {
  const verdict = routeProcessorContinuationHandoff(
    input({
      convergence: convergence({
        ok: true,
        action: "settle_source_authorized_exact_blocker",
        accepted_output: "GitHub rejected processor package write",
        blockers: ["GitHub rejected processor package write"],
      }),
      target_receipt: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "require_processor_blocker_release");
  assert.deepEqual(verdict.blockers, ["GitHub rejected processor package write"]);
});

test("blocks reused processor handoffs", () => {
  const verdict = routeProcessorContinuationHandoff(input({ spent_handoff_ids: ["processor-continuation-handoff-1"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_handoff");
});
