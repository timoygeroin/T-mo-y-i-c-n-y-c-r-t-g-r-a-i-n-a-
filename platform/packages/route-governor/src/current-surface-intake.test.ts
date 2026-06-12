import test from "node:test";
import assert from "node:assert/strict";

import {
  intakeCurrentSurface,
  type CurrentSurfaceIntakeInput,
  type CurrentSurfaceObservation,
} from "./current-surface-intake.js";

const LIVE_HEAD = "2310e9719302f785cb01831acb2bcd50a5fcdce7";
const RESOLVED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function liveMetadata(overrides: Partial<CurrentSurfaceObservation> = {}): CurrentSurfaceObservation {
  return {
    surface_id: "pr-metadata-live-head",
    kind: "live_pr_metadata",
    branch: "monday-platform-genesis-01",
    head_sha: LIVE_HEAD,
    evidence: [`live PR metadata head ${LIVE_HEAD}`],
    ...overrides,
  };
}

function input(overrides: Partial<CurrentSurfaceIntakeInput> = {}): CurrentSurfaceIntakeInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    resolved_historical_heads: [RESOLVED_HEAD],
    observations: [
      liveMetadata(),
      {
        surface_id: "prompt-repaired-head",
        kind: "prompt_carried_head",
        branch: "monday-platform-genesis-01",
        head_sha: RESOLVED_HEAD,
        evidence: [`prompt still names repaired head ${RESOLVED_HEAD}`],
      },
      {
        surface_id: "pr-body-failure-summary",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        status_verdict: "failing",
        evidence: ["PR body still describes an older current-head proof failure"],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: LIVE_HEAD,
      changed_files: ["platform/packages/route-governor/src/current-surface-intake.ts"],
      executable_artifacts: ["intakeCurrentSurface"],
      routing_artifacts: ["current surface intake router"],
    },
    ...overrides,
  };
}

test("admits executable embodiment while quarantining stale prompt and PR-body head summaries", () => {
  const verdict = intakeCurrentSurface(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_surface_bound_embodiment");
  assert.equal(verdict.head_sha, LIVE_HEAD);
  assert.deepEqual(verdict.accepted_surface_ids, ["pr-metadata-live-head"]);
  assert.deepEqual(verdict.historical_surface_ids, ["prompt-repaired-head"]);
  assert.deepEqual(verdict.quarantined_surface_ids, ["pr-body-failure-summary"]);
  assert.ok(verdict.decisive_evidence.includes("intakeCurrentSurface"));
});

test("blocks stale embodiment candidates that are based on prompt-carried or PR-body heads", () => {
  const verdict = intakeCurrentSurface(
    input({
      candidate: {
        move_class: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        base_head_sha: RESOLVED_HEAD,
        changed_files: ["platform/packages/route-governor/src/current-surface-intake.ts"],
        executable_artifacts: ["intakeCurrentSurface"],
        routing_artifacts: ["current surface intake router"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_base");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes(`candidate base ${RESOLVED_HEAD}`)));
});

test("routes live-head direct status failures to repair instead of accepting embodiment", () => {
  const verdict = intakeCurrentSurface(
    input({
      observations: [
        liveMetadata(),
        {
          surface_id: "live-status-failure",
          kind: "direct_status_surface",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          status_verdict: "failing",
          evidence: ["Route governor proof examples failed on live head"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "route_to_live_failure_repair");
  assert.deepEqual(verdict.accepted_surface_ids, ["pr-metadata-live-head", "live-status-failure"]);
  assert.ok(verdict.blockers.includes("Route governor proof examples failed on live head"));
});

test("accepts passing live-head direct status only as status readback progress", () => {
  const verdict = intakeCurrentSurface(
    input({
      observations: [
        liveMetadata(),
        {
          surface_id: "live-status-success",
          kind: "direct_status_surface",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          status_verdict: "passing_with_warnings",
          evidence: ["seven live-head checks passed; Node.js 20 notice is warning only"],
        },
      ],
      candidate: {
        move_class: "fresh_status_readback",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_live_status_readback");
  assert.deepEqual(verdict.accepted_surface_ids, ["pr-metadata-live-head", "live-status-success"]);
});

test("blocks incomplete embodiment after live metadata arbitration", () => {
  const verdict = intakeCurrentSurface(
    input({
      candidate: {
        move_class: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        changed_files: ["README.md"],
        executable_artifacts: [],
        routing_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("no executable platform file")));
});

test("requires live PR metadata before accepting prompt or PR-body arbitration", () => {
  const verdict = intakeCurrentSurface(input({ observations: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_live_metadata");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes(`no live PR metadata observation`)));
});
