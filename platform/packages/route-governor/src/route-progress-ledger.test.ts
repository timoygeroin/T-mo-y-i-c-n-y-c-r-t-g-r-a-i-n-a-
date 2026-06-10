import assert from "node:assert/strict";
import { test } from "node:test";

import { compileRouteProgressLedger, type RouteProgressLedgerInput, type RouteProgressReceipt } from "./route-progress-ledger.js";

const branch = "monday-platform-genesis-01";
const head = "aaf1cae1f3a485e1363693c404d9f0c0b7e7adee";

function receipt(overrides: Partial<RouteProgressReceipt> = {}): RouteProgressReceipt {
  return {
    receipt_id: "route-progress-ledger",
    branch,
    head_sha: head,
    progress_kind: "external_platform_embodiment",
    artifact_class: "route_progress_ledger",
    changed_files: ["platform/packages/route-governor/src/route-progress-ledger.ts"],
    executable_artifacts: ["compileRouteProgressLedger"],
    routing_artifacts: ["live-head progress ledger gate"],
    proof_artifacts: ["platform/packages/route-governor/src/route-progress-ledger-proof.ts"],
    status_surface_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<RouteProgressLedgerInput> = {}): RouteProgressLedgerInput {
  return {
    branch,
    live_head_sha: head,
    receipts: [],
    candidate: receipt(),
    spent_artifact_classes: [],
    ...overrides,
  };
}

test("accepts the next unspent executable progress receipt", () => {
  const verdict = compileRouteProgressLedger(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_next_progress_receipt");
  assert.equal(verdict.accepted_receipt_id, "route-progress-ledger");
  assert.ok(verdict.decisive_evidence.includes("compileRouteProgressLedger"));
});

test("blocks stale repaired-head receipts", () => {
  const verdict = compileRouteProgressLedger(
    input({
      candidate: receipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_receipt_head");
  assert.deepEqual(verdict.blockers, [
    `candidate head b38ea247602ae8ebba80c4120ad03b41b26bd841 does not match live head ${head}`,
  ]);
});

test("blocks repeated receipt ids", () => {
  const prior = receipt();
  const verdict = compileRouteProgressLedger(input({ receipts: [prior], candidate: receipt() }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_receipt");
  assert.deepEqual(verdict.blockers, ["receipt id already exists in ledger: route-progress-ledger"]);
});

test("blocks replayed progress surfaces under a new receipt id", () => {
  const prior = receipt({ receipt_id: "prior-ledger" });
  const verdict = compileRouteProgressLedger(input({ receipts: [prior], candidate: receipt({ receipt_id: "new-id" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_receipt");
  assert.deepEqual(verdict.blockers, ["candidate replays prior receipt surface: prior-ledger"]);
});

test("blocks incomplete executable progress receipts", () => {
  const verdict = compileRouteProgressLedger(
    input({
      candidate: receipt({
        changed_files: ["platform/docs/readme.md"],
        executable_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_receipt");
  assert.ok(verdict.blockers.includes("candidate has no executable platform file change"));
  assert.ok(verdict.blockers.includes("candidate has no executable artifact evidence"));
});

test("accepts status receipts only with concrete status surface ids", () => {
  const verdict = compileRouteProgressLedger(
    input({
      candidate: receipt({
        progress_kind: "fresh_status_readback",
        artifact_class: "current_head_status_surface",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_surface_ids: ["check-run:27049651467"],
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_next_progress_receipt");
  assert.ok(verdict.decisive_evidence.includes("check-run:27049651467"));
});

test("requires exact blocker receipts to name the blocker", () => {
  const verdict = compileRouteProgressLedger(
    input({
      candidate: receipt({
        progress_kind: "exact_external_blocker",
        artifact_class: "external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_receipt");
  assert.deepEqual(verdict.blockers, ["exact external blocker receipt has no blocker text"]);
});
