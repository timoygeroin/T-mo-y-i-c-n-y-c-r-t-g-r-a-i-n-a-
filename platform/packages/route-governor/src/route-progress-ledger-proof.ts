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

const accepted = compileRouteProgressLedger(input());
if (!accepted.ok || accepted.action !== "accept_next_progress_receipt") {
  throw new Error(`route progress ledger should accept the next receipt: ${accepted.blockers.join("; ")}`);
}

const stale = compileRouteProgressLedger(
  input({ candidate: receipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
);
if (stale.ok || stale.action !== "block_stale_receipt_head") {
  throw new Error("route progress ledger should reject stale repaired-head receipts");
}

const replayed = compileRouteProgressLedger(input({ receipts: [receipt({ receipt_id: "prior-ledger" })], candidate: receipt({ receipt_id: "new-id" }) }));
if (replayed.ok || replayed.action !== "block_replayed_receipt") {
  throw new Error("route progress ledger should reject replayed progress surfaces");
}

const statusReceipt = compileRouteProgressLedger(
  input({
    candidate: receipt({
      receipt_id: "current-head-status",
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
if (!statusReceipt.ok) {
  throw new Error(`route progress ledger should accept concrete status receipts: ${statusReceipt.blockers.join("; ")}`);
}

console.log("route progress ledger proof passed");
