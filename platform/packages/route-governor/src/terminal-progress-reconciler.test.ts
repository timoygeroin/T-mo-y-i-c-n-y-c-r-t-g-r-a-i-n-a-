import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  reconcileTerminalProgress,
  type TerminalProgressReconcilerInput,
  type TerminalProgressSurface,
} from "./terminal-progress-reconciler.js";

const branch = "monday-platform-genesis-01";
const head = "d9faf62f96b6d2183707d675970f433868e651e1";

function surface(overrides: Partial<TerminalProgressSurface> = {}): TerminalProgressSurface {
  return {
    surface_id: "current-turn-gate",
    kind: "current_turn_gate",
    branch,
    head_sha: head,
    ok: true,
    action: "admit_external_embodiment",
    evidence: ["current turn gate admitted behavior-bearing embodiment"],
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<TerminalProgressReconcilerInput> = {}): TerminalProgressReconcilerInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    requested_action: "external_platform_embodiment",
    exhausted_actions: ["metadata_reread", "duplicate_status_summary", "duplicate_comment", "local_memory_guard"],
    surfaces: [surface()],
    ...overrides,
  };
}

describe("reconcileTerminalProgress", () => {
  it("admits a behavior-bearing embodiment from the live current-turn gate", () => {
    const verdict = reconcileTerminalProgress(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "release_external_embodiment");
    assert.deepEqual(verdict.selected_surface_ids, ["current-turn-gate"]);
    assert.match(verdict.next_route, /resulting head/);
  });

  it("blocks exhausted metadata and duplicate summary actions before any surface can be spent", () => {
    const verdict = reconcileTerminalProgress(input({ requested_action: "metadata_reread" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
    assert.match(verdict.blockers.join("; "), /metadata_reread/);
  });

  it("blocks stale terminal surfaces instead of mixing prompt and live heads", () => {
    const verdict = reconcileTerminalProgress(
      input({
        surfaces: [surface({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" })],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_surface");
    assert.match(verdict.next_route, /same live head/);
  });

  it("publishes fresh status only with a direct live-head status surface", () => {
    const verdict = reconcileTerminalProgress(
      input({
        requested_action: "fresh_status_readback",
        surfaces: [
          surface(),
          surface({
            surface_id: "checks-d9faf62",
            kind: "direct_status_surface",
            action: "passing_with_warnings",
            evidence: ["Route Governor Proof succeeded", "Node.js 20 notice is warning-only"],
            warnings: ["Node.js 20 Actions deprecation notice"],
          }),
        ],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "publish_fresh_status_readback");
    assert.ok(verdict.selected_surface_ids.includes("checks-d9faf62"));
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  });

  it("blocks status release when the current turn has only a gate and no direct checks surface", () => {
    const verdict = reconcileTerminalProgress(input({ requested_action: "fresh_status_readback" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_live_surface");
    assert.match(verdict.blockers.join("; "), /direct live-head status/);
  });

  it("admits merge command only with a live release-candidate bundle", () => {
    const verdict = reconcileTerminalProgress(
      input({
        requested_action: "merge_command",
        surfaces: [
          surface(),
          surface({
            surface_id: "release-candidate-bundle",
            kind: "release_candidate_bundle",
            action: "admit_release_candidate_bundle",
            evidence: ["status, mergeability, review, and promotion leases are live-head bound"],
          }),
        ],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_merge_command");
    assert.ok(verdict.selected_surface_ids.includes("release-candidate-bundle"));
  });

  it("routes review repair only from a live review boundary", () => {
    const verdict = reconcileTerminalProgress(
      input({
        requested_action: "review_repair",
        surfaces: [
          surface(),
          surface({
            surface_id: "review-changes",
            kind: "review_ready_boundary",
            action: "route_review_changes_to_repair",
            evidence: ["review requested changes on route-governor file"],
          }),
        ],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "route_review_repair");
    assert.match(verdict.next_route, /files named/);
  });
});
