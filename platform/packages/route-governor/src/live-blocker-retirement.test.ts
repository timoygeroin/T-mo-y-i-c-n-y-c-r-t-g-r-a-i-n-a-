import assert from "node:assert/strict";
import { test } from "node:test";

import { routeLiveBlockerRetirement, type LiveBlockerRetirementInput } from "./live-blocker-retirement.js";

const branch = "monday-platform-genesis-01";
const liveHead = "cbf685410f32d8a5a76f4020630205f3e3626f90";
const staleHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function input(overrides: Partial<LiveBlockerRetirementInput> = {}): LiveBlockerRetirementInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    last_readback_head_sha: staleHead,
    status_verdict: "no_status_surface",
    requested_move_class: "fresh_status_readback",
    ...overrides,
  };
}

test("retires a blocker bound to a superseded head and routes to live status", () => {
  const verdict = routeLiveBlockerRetirement(
    input({
      blocker: {
        blocker_id: "df3-proof-examples-failure",
        head_sha: staleHead,
        blocker_text: "proof examples failed on df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        required_surface: "current live-head status surface",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "retire_stale_blocker_and_read_live_status");
  assert.deepEqual(verdict.retired_blocker_ids, ["df3-proof-examples-failure"]);
  assert.match(verdict.next_route, /live-head status surface/);
});

test("holds a blocker that is still bound to the live head", () => {
  const verdict = routeLiveBlockerRetirement(
    input({
      blocker: {
        blocker_id: "cbf-proof-chain-failure",
        head_sha: liveHead,
        blocker_text: "proof chain is failing on the live head",
        required_surface: "failing proof-chain log",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "hold_live_blocker");
  assert.deepEqual(verdict.blockers, ["proof chain is failing on the live head"]);
  assert.deepEqual(verdict.retired_blocker_ids, []);
});

test("blocks stale blocker replay as a progress class", () => {
  const verdict = routeLiveBlockerRetirement(input({ requested_move_class: "stale_blocker_replay" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_duplicate_summary");
  assert.match(verdict.blockers[0] ?? "", /non-progress/);
});

test("requires a live status surface for a readback claim with no blocker", () => {
  const verdict = routeLiveBlockerRetirement(input());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_live_status");
  assert.deepEqual(verdict.blockers, [`no live-head status surface is attached for ${liveHead}`]);
});

test("admits a behavior-bearing embodiment after passing current-head status", () => {
  const verdict = routeLiveBlockerRetirement(
    input({
      status_verdict: "passing_with_warnings",
      requested_move_class: "external_platform_embodiment",
      candidate: {
        candidate_id: "live-blocker-retirement-router",
        artifact_class: "live-blocker-retirement",
        changed_files: ["platform/packages/route-governor/src/live-blocker-retirement.ts"],
        executable_artifacts: ["routeLiveBlockerRetirement"],
        routing_artifacts: ["stale blocker retirement requires a moved live head before readback"],
        proof_artifacts: ["dist/live-blocker-retirement-proof.js"],
        spent_artifact_classes: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.ok(verdict.decisive_evidence.includes("routeLiveBlockerRetirement"));
});

test("blocks proof-only embodiment candidates", () => {
  const verdict = routeLiveBlockerRetirement(
    input({
      status_verdict: "passing",
      requested_move_class: "external_platform_embodiment",
      candidate: {
        candidate_id: "proof-only",
        artifact_class: "proof-only",
        changed_files: ["platform/packages/route-governor/src/live-blocker-retirement-proof.ts"],
        executable_artifacts: ["routeLiveBlockerRetirement"],
        routing_artifacts: ["proof-only route should not pass"],
        proof_artifacts: ["dist/live-blocker-retirement-proof.js"],
        spent_artifact_classes: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("proof-only")));
});
