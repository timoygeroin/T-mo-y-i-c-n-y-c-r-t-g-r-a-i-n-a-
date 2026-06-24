import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { consumeStatusLease, type StatusLeaseConsumptionInput } from "./status-lease-consumption.js";

const liveHead = "b77467cb93dd646a3f65f9e8d47981912712a6e7";

function baseInput(overrides: Partial<StatusLeaseConsumptionInput> = {}): StatusLeaseConsumptionInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    status_lease_id: "live-status-lease-b77467c",
    consumption_id: "status-lease-consumption-b77467c-embodiment",
    spent_consumption_ids: [],
    status_branch: "monday-platform-genesis-01",
    status_head_sha: liveHead,
    status_conclusion: "passing_with_warnings",
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    target: "external_platform_embodiment",
    target_receipt: {
      changed_files: ["platform/packages/route-governor/src/status-lease-consumption.ts"],
      behavior_artifacts: ["consumeStatusLease"],
      routing_artifacts: ["single-use status lease consumption"],
      proof_artifacts: ["status-lease-consumption.test.ts"],
    },
    ...overrides,
  };
}

describe("consumeStatusLease", () => {
  it("consumes a live-head passing-with-warnings lease for exactly one embodiment target", () => {
    const verdict = consumeStatusLease(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "consume_status_lease");
    assert.equal(verdict.head_sha, liveHead);
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
    assert.ok(verdict.decisive_evidence.includes("consumeStatusLease"));
  });

  it("blocks reuse of the same consumption id", () => {
    const verdict = consumeStatusLease(
      baseInput({ spent_consumption_ids: ["status-lease-consumption-b77467c-embodiment"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_reused_consumption");
    assert.match(verdict.blockers.join("; "), /already spent/);
  });

  it("blocks stale status lease heads", () => {
    const verdict = consumeStatusLease(baseInput({ status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_head_mismatch");
    assert.match(verdict.next_route, /Discard stale status leases/i);
  });

  it("blocks pending or failing status before downstream consumption", () => {
    const verdict = consumeStatusLease(baseInput({ status_conclusion: "pending" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_failed_or_pending_status");
  });

  it("blocks status summaries and metadata rereads as downstream progress", () => {
    const verdict = consumeStatusLease(baseInput({ target: "duplicate_status_summary" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_target");
  });

  it("requires a behavior receipt for embodiment consumption", () => {
    const verdict = consumeStatusLease(
      baseInput({
        target_receipt: {
          changed_files: ["platform/packages/route-governor/src/status-lease-consumption-proof.ts"],
          behavior_artifacts: [],
          routing_artifacts: ["single-use status lease consumption"],
          proof_artifacts: ["status-lease-consumption-proof.ts"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_target_receipt");
  });
});
