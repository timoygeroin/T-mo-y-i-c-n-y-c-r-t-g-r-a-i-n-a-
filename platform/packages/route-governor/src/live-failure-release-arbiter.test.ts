import test from "node:test";
import assert from "node:assert/strict";

import {
  arbitrateLiveFailureRelease,
  type LiveFailureReleaseArbiterInput,
} from "./live-failure-release-arbiter.js";

const BRANCH = "monday-platform-genesis-01";
const LIVE_HEAD = "cfa678884c968caf81b26227c983895d76a7af89";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const OLD_FAILURE_HEAD = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function scenario(overrides: Partial<LiveFailureReleaseArbiterInput> = {}): LiveFailureReleaseArbiterInput {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    resolved_historical_heads: [REPAIRED_HEAD],
    surfaces: [
      {
        surface_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        branch: BRANCH,
        head_sha: LIVE_HEAD,
        evidence: [`live PR head ${LIVE_HEAD}`],
      },
      {
        surface_id: "scheduled-repaired-head",
        kind: "prompt_head_claim",
        branch: BRANCH,
        head_sha: REPAIRED_HEAD,
        evidence: [`prompt carried resolved repaired head ${REPAIRED_HEAD}`],
      },
      {
        surface_id: "pr-body-old-failure",
        kind: "pr_body_failure_summary",
        branch: BRANCH,
        head_sha: OLD_FAILURE_HEAD,
        status_verdict: "failing",
        evidence: ["PR body records an older proof-examples failure"],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: BRANCH,
      base_head_sha: LIVE_HEAD,
      changed_files: [
        "platform/packages/route-governor/src/live-failure-release-arbiter.ts",
        "platform/packages/route-governor/src/live-failure-release-arbiter.test.ts",
      ],
      executable_artifacts: ["arbitrateLiveFailureRelease"],
      routing_artifacts: ["live failure release arbitration"],
      proof_artifacts: ["live-failure-release-arbiter.test"],
    },
    ...overrides,
  };
}

test("admits statusless embodiment when only stale repaired-head and old failure summaries exist", () => {
  const verdict = arbitrateLiveFailureRelease(scenario());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_statusless_embodiment");
  assert.deepEqual(verdict.historical_surface_ids, ["scheduled-repaired-head"]);
  assert.deepEqual(verdict.stale_surface_ids, ["pr-body-old-failure"]);
  assert.ok(verdict.decisive_evidence.includes("arbitrateLiveFailureRelease"));
});

test("blocks unrelated embodiment when a direct live-head failing status exists", () => {
  const verdict = arbitrateLiveFailureRelease(
    scenario({
      surfaces: [
        {
          surface_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: [`live PR head ${LIVE_HEAD}`],
        },
        {
          surface_id: "live-proof-failure",
          kind: "direct_status_surface",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          status_verdict: "failing",
          evidence: ["Route governor proof examples failed on the live head"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_live_failure_embodiment");
  assert.match(verdict.next_route, /current-failure repair/);
});

test("requires concrete failure detail before admitting current-head repair", () => {
  const verdict = arbitrateLiveFailureRelease(
    scenario({
      surfaces: [
        {
          surface_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: [`live PR head ${LIVE_HEAD}`],
        },
        {
          surface_id: "live-proof-failure",
          kind: "direct_status_surface",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          status_verdict: "failing",
          evidence: ["Route governor proof examples failed on the live head"],
        },
      ],
      candidate: {
        move_class: "current_failure_repair",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        changed_files: ["platform/packages/route-governor/src/live-failure-release-arbiter.ts"],
        executable_artifacts: ["arbitrateLiveFailureRelease"],
        routing_artifacts: ["live failure release arbitration"],
        proof_artifacts: ["live-failure-release-arbiter.test"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_failure_detail_missing");
});

test("admits current-head repair only when it is bound to the concrete failure detail", () => {
  const verdict = arbitrateLiveFailureRelease(
    scenario({
      surfaces: [
        {
          surface_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: [`live PR head ${LIVE_HEAD}`],
        },
        {
          surface_id: "live-proof-failure",
          kind: "direct_status_surface",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          status_verdict: "failing",
          evidence: ["Route governor proof examples failed on the live head"],
          failure_detail: "AssertionError: expected repair admission to bind the live head",
        },
      ],
      candidate: {
        move_class: "current_failure_repair",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        changed_files: [
          "platform/packages/route-governor/src/live-failure-release-arbiter.ts",
          "platform/packages/route-governor/src/live-failure-release-arbiter.test.ts",
        ],
        executable_artifacts: ["arbitrateLiveFailureRelease"],
        routing_artifacts: ["live failure release arbitration"],
        proof_artifacts: ["live-failure-release-arbiter.test"],
        failure_signature: "AssertionError: expected repair admission to bind the live head",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_current_failure_repair");
  assert.ok(verdict.decisive_evidence.includes("AssertionError: expected repair admission to bind the live head"));
});

test("admits fresh status readback only from direct passing live-head status", () => {
  const verdict = arbitrateLiveFailureRelease(
    scenario({
      surfaces: [
        {
          surface_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          evidence: [`live PR head ${LIVE_HEAD}`],
        },
        {
          surface_id: "live-status-success",
          kind: "direct_status_surface",
          branch: BRANCH,
          head_sha: LIVE_HEAD,
          status_verdict: "passing_with_warnings",
          evidence: ["all live-head checks succeeded; Node.js 20 warning remains non-blocking"],
        },
      ],
      candidate: {
        move_class: "fresh_status_readback",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
});

test("blocks candidates based on stale prompt head", () => {
  const verdict = arbitrateLiveFailureRelease(
    scenario({
      candidate: {
        move_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: REPAIRED_HEAD,
        changed_files: ["platform/packages/route-governor/src/live-failure-release-arbiter.ts"],
        executable_artifacts: ["arbitrateLiveFailureRelease"],
        routing_artifacts: ["live failure release arbitration"],
        proof_artifacts: ["live-failure-release-arbiter.test"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_base");
});
