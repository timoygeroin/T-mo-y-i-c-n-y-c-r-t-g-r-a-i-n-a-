import test from "node:test";
import assert from "node:assert/strict";
import { convergeTriSurfaceRoute, type TriSurfaceConvergenceInput } from "./tri-surface-convergence.js";

const branch = "monday-platform-genesis-01";
const liveHead = "373a30f68eec5187c6c76751431c06552d31440d";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<TriSurfaceConvergenceInput> = {}): TriSurfaceConvergenceInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    last_resolved_head_sha: repairedHead,
    observations: [
      {
        surface_id: "scheduled-prompt-repaired-head",
        kind: "scheduled_prompt",
        branch,
        head_sha: repairedHead,
        status_verdict: "passing_with_warnings",
        evidence: ["scheduled prompt preserved repaired-head success as historical context"],
      },
      {
        surface_id: "pr-body-moved-head-failure-summary",
        kind: "pr_body_summary",
        branch,
        head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        status_verdict: "failing",
        evidence: ["PR body names a moved-head failure that is not the live metadata head"],
      },
      {
        surface_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        branch,
        head_sha: liveHead,
        status_verdict: "unknown",
        evidence: [`PR metadata head is ${liveHead}`],
      },
    ],
    ...overrides,
  };
}

test("converges conflicting scheduled prompt and PR body claims onto live metadata head", () => {
  const verdict = convergeTriSurfaceRoute(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "converge_on_live_head");
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.accepted_surface_ids, ["live-pr-metadata"]);
  assert.deepEqual(verdict.historical_surface_ids, ["scheduled-prompt-repaired-head"]);
  assert.deepEqual(verdict.quarantined_surface_ids, ["pr-body-moved-head-failure-summary"]);
  assert.match(verdict.next_route, /live PR head/);
});

test("routes live-head passing status as fresh readback authority", () => {
  const verdict = convergeTriSurfaceRoute(
    input({
      observations: [
        ...input().observations,
        {
          surface_id: "live-checks-success",
          kind: "direct_status_surface",
          branch,
          head_sha: liveHead,
          status_verdict: "passing_with_warnings",
          evidence: ["all live-head checks passed; Node.js 20 notice is warning-only"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_live_status_readback");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("live-checks-success"));
});

test("routes live-head failing status to failure-detail acquisition", () => {
  const verdict = convergeTriSurfaceRoute(
    input({
      observations: [
        ...input().observations,
        {
          surface_id: "live-checks-failure",
          kind: "direct_status_surface",
          branch,
          head_sha: liveHead,
          status_verdict: "failing",
          evidence: ["Route governor proof surface failed on live head"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_live_failure_detail");
  assert.deepEqual(verdict.blockers, ["Route governor proof surface failed on live head"]);
});

test("blocks reconciliation without live PR metadata", () => {
  const verdict = convergeTriSurfaceRoute(
    input({ observations: input().observations.filter((surface) => surface.kind !== "live_pr_metadata") }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_live_metadata");
  assert.match(verdict.blockers.join("\n"), /no live PR metadata surface/);
});

test("blocks wrong-branch surfaces before convergence", () => {
  const verdict = convergeTriSurfaceRoute(
    input({
      observations: [
        ...input().observations,
        {
          surface_id: "wrong-branch-status",
          kind: "direct_status_surface",
          branch: "main",
          head_sha: liveHead,
          status_verdict: "passing",
          evidence: ["wrong branch status must not release PR finalization"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
  assert.match(verdict.blockers.join("\n"), /wrong-branch-status belongs to main/);
});
