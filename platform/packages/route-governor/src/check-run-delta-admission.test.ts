import test from "node:test";
import assert from "node:assert/strict";

import {
  admitCheckRunDelta,
  type CheckRunDeltaAdmissionInput,
} from "./check-run-delta-admission.js";

const LIVE_HEAD = "655a01e25e215b4daf52c5e291865b0f296464a1";
const OLD_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function scenario(overrides: Partial<CheckRunDeltaAdmissionInput> = {}): CheckRunDeltaAdmissionInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    previous_status_head_sha: OLD_HEAD,
    spent_run_ids: ["27049650678"],
    direct_surfaces: [
      {
        surface_id: "route-governor-proof-pr",
        kind: "check_run",
        branch: "monday-platform-genesis-01",
        head_sha: LIVE_HEAD,
        run_id: "30000000001",
        verdict: "passing_with_warnings",
        evidence: ["Route governor proof examples succeeded for the live PR head"],
        warnings: ["Node.js 20 Actions deprecation notice is non-blocking"],
      },
    ],
    summary_surfaces: [
      {
        surface_id: "prompt-carried-repaired-head-summary",
        branch: "monday-platform-genesis-01",
        head_sha: OLD_HEAD,
        evidence: ["Prompt carried repaired-head status readback for an older head"],
      },
    ],
    ...overrides,
  };
}

test("admits unspent direct status evidence bound to the live PR head", () => {
  const verdict = admitCheckRunDelta(scenario());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_delta");
  assert.deepEqual(verdict.admitted_run_ids, ["30000000001"]);
  assert.deepEqual(verdict.replayed_run_ids, []);
  assert.deepEqual(verdict.summary_surface_ids, ["prompt-carried-repaired-head-summary"]);
});

test("blocks summary-only status as non-fresh", () => {
  const verdict = admitCheckRunDelta(scenario({ direct_surfaces: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_summary_only_delta");
  assert.match(verdict.blockers.join("\n"), /summary surface cannot count/);
});

test("blocks stale direct status deltas for non-live heads", () => {
  const verdict = admitCheckRunDelta(
    scenario({
      direct_surfaces: [
        {
          surface_id: "old-repaired-head-check",
          kind: "check_run",
          branch: "monday-platform-genesis-01",
          head_sha: OLD_HEAD,
          run_id: "27049650678",
          verdict: "passing",
          evidence: ["old repaired-head check succeeded"],
          warnings: [],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_delta_head");
  assert.deepEqual(verdict.stale_surface_ids, ["old-repaired-head-check"]);
});

test("blocks replayed live-head run ids", () => {
  const verdict = admitCheckRunDelta(
    scenario({
      spent_run_ids: ["30000000001"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_fresh_delta");
  assert.deepEqual(verdict.replayed_run_ids, ["30000000001"]);
});

test("routes fresh failing deltas to live failure repair", () => {
  const verdict = admitCheckRunDelta(
    scenario({
      direct_surfaces: [
        {
          surface_id: "live-proof-failure",
          kind: "workflow_run",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          run_id: "30000000002",
          verdict: "failing",
          evidence: ["Run proof examples failed with exit code 1"],
          warnings: [],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_live_failure_delta");
  assert.deepEqual(verdict.admitted_run_ids, ["30000000002"]);
  assert.match(verdict.next_route, /repair only/);
});

test("holds pending fresh deltas without guessing status", () => {
  const verdict = admitCheckRunDelta(
    scenario({
      direct_surfaces: [
        {
          surface_id: "live-pending-check",
          kind: "check_run",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          run_id: "30000000003",
          verdict: "pending",
          evidence: ["Route Governor Proof is still in progress"],
          warnings: [],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "hold_pending_delta");
  assert.match(verdict.next_route, /wait/);
});
