import assert from "node:assert/strict";
import test from "node:test";
import { orderStatusSurfaceAcquisition, type StatusSurfaceObservation } from "./status-surface-acquisition-order.js";

const branch = "monday-platform-genesis-01";
const liveHead = "f3a8ace7b0236e1c2a59f672f4b98ff104c56212";

function observation(overrides: Partial<StatusSurfaceObservation>): StatusSurfaceObservation {
  return {
    surface_id: "surface",
    kind: "live_pr_metadata",
    branch,
    head_sha: liveHead,
    evidence: [],
    ...overrides,
  };
}

test("blocks live PR metadata when it is the only current-head surface", () => {
  const verdict = orderStatusSurfaceAcquisition({
    active_branch: branch,
    live_head_sha: liveHead,
    observations: [
      observation({
        surface_id: "pr-metadata-f3a8",
        kind: "live_pr_metadata",
        evidence: [`head ${liveHead}`],
      }),
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_metadata_only_status_claim");
  assert.equal(verdict.status_claim, "none");
  assert.deepEqual(verdict.accepted_surface_ids, []);
  assert.deepEqual(verdict.acquisition_order, ["check_run", "workflow_run", "combined_status", "step_summary", "proof_artifact"]);
  assert.match(verdict.blockers.join("\n"), /not a GitHub Checks\/Actions status surface/);
});

test("accepts a live-head check run as decisive status evidence", () => {
  const verdict = orderStatusSurfaceAcquisition({
    active_branch: branch,
    live_head_sha: liveHead,
    observations: [
      observation({
        surface_id: "check-run-1",
        kind: "check_run",
        verdict: "failing",
        evidence: ["Route governor proof surface failed"],
      }),
      observation({ surface_id: "pr-metadata-f3a8", kind: "live_pr_metadata" }),
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_live_status_surface");
  assert.equal(verdict.status_claim, "bound_to_live_head");
  assert.deepEqual(verdict.accepted_surface_ids, ["check-run-1"]);
  assert.match(verdict.decisive_evidence.join("\n"), /check_run:failing/);
});

test("rejects stale status surfaces even when live metadata exists", () => {
  const verdict = orderStatusSurfaceAcquisition({
    active_branch: branch,
    live_head_sha: liveHead,
    observations: [
      observation({
        surface_id: "old-workflow-run",
        kind: "workflow_run",
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        verdict: "passing",
      }),
      observation({ surface_id: "pr-metadata-f3a8", kind: "live_pr_metadata" }),
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_surface");
  assert.deepEqual(verdict.stale_status_surface_ids, ["old-workflow-run"]);
  assert.match(verdict.next_route, /discard stale status/);
});

test("quarantines PR body and prompt surfaces instead of accepting them as status", () => {
  const verdict = orderStatusSurfaceAcquisition({
    active_branch: branch,
    live_head_sha: liveHead,
    observations: [
      observation({ surface_id: "pr-body-old-failure", kind: "pr_body_summary", evidence: ["df3 failure note"] }),
      observation({ surface_id: "prompt-repaired-head", kind: "prompt_carried_head", head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_metadata_only_status_claim");
  assert.deepEqual(verdict.accepted_surface_ids, []);
  assert.deepEqual(verdict.quarantined_surface_ids.sort(), ["pr-body-old-failure", "prompt-repaired-head"].sort());
  assert.match(verdict.next_route, /acquire one live-head status surface/);
});

test("accepts a proof artifact when it is bound to the live head", () => {
  const verdict = orderStatusSurfaceAcquisition({
    active_branch: branch,
    live_head_sha: liveHead,
    observations: [
      observation({
        surface_id: "route-governor-proof-output",
        kind: "proof_artifact",
        verdict: "pending",
        evidence: ["artifact retrieved for live head"],
      }),
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_live_status_surface");
  assert.equal(verdict.status_claim, "bound_to_live_head");
  assert.deepEqual(verdict.accepted_surface_ids, ["route-governor-proof-output"]);
});
