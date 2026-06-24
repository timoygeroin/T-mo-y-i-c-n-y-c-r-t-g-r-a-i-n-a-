import assert from "node:assert/strict";

import { compileTerminalOperationResultReceipt } from "./terminal-operation-result-receipt.js";

const liveHead = "ec8e24508c5db7ad8588b11ca5d4221bb3642a38";

const accepted = compileTerminalOperationResultReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  issued_lease_ids: ["terminal-lease-proof-001"],
  spent_result_receipt_ids: [],
  receipt_id: "terminal-result-proof-001",
  lease_id: "terminal-lease-proof-001",
  branch: "monday-platform-genesis-01",
  head_sha: liveHead,
  leased_operation: "merge_live_head",
  completed_operation: "merge_live_head",
  outcome: "succeeded",
  result_evidence: ["merge result was externally returned for the live head"],
  blockers: [],
  followup_move_classes: [],
});

assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_terminal_result_receipt");
assert.equal(accepted.operation, "merge_live_head");

const stale = compileTerminalOperationResultReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  issued_lease_ids: ["terminal-lease-proof-002"],
  spent_result_receipt_ids: [],
  receipt_id: "terminal-result-proof-002",
  lease_id: "terminal-lease-proof-002",
  branch: "monday-platform-genesis-01",
  head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  leased_operation: "request_review",
  completed_operation: "request_review",
  outcome: "succeeded",
  result_evidence: ["old repaired-head review context"],
  blockers: [],
  followup_move_classes: [],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_head");

const blocked = compileTerminalOperationResultReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  issued_lease_ids: ["terminal-lease-proof-003"],
  spent_result_receipt_ids: [],
  receipt_id: "terminal-result-proof-003",
  lease_id: "terminal-lease-proof-003",
  branch: "monday-platform-genesis-01",
  head_sha: liveHead,
  leased_operation: "request_review",
  completed_operation: "request_review",
  outcome: "blocked",
  result_evidence: [],
  blockers: ["connected account cannot request review from itself"],
  followup_move_classes: ["exact_external_blocker"],
});

assert.equal(blocked.ok, false);
assert.equal(blocked.action, "route_terminal_result_repair");
assert.deepEqual(blocked.blockers, ["connected account cannot request review from itself"]);
