import assert from "node:assert/strict";

import { compileCurrentHeadTerminalLease } from "./current-head-terminal-lease.js";

const liveHead = "040a97d2da0444a509e98571364b9a24dd82c0d9";

const admitted = compileCurrentHeadTerminalLease({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  lease_id: "current-head-terminal-proof-001",
  spent_lease_ids: [],
  mergeable: true,
  terminal_operations: ["merge_live_head"],
  behavior_artifacts: [],
  status_source: {
    source_id: "public-checks-current-head",
    kind: "current_head_checks",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    passed: true,
    warnings: ["Node.js 20 Actions deprecation notice"],
    evidence: ["Route governor proof examples succeeded"],
  },
});

assert.equal(admitted.ok, true);
assert.equal(admitted.operation, "merge_live_head");
assert.equal(admitted.warnings.length, 1);

const bundled = compileCurrentHeadTerminalLease({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  lease_id: "current-head-terminal-proof-002",
  spent_lease_ids: [],
  mergeable: true,
  terminal_operations: ["merge_live_head", "commit_external_embodiment"],
  behavior_artifacts: ["platform/packages/route-governor/src/current-head-terminal-lease.ts"],
  status_source: {
    source_id: "public-checks-current-head",
    kind: "current_head_checks",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    passed: true,
    warnings: [],
    evidence: ["all required current-head checks passed"],
  },
});

assert.equal(bundled.ok, false);
assert.equal(bundled.action, "block_bundled_terminal_operations");

const stale = compileCurrentHeadTerminalLease({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  lease_id: "current-head-terminal-proof-003",
  spent_lease_ids: [],
  terminal_operations: ["request_review"],
  behavior_artifacts: [],
  status_source: {
    source_id: "repaired-head-checks",
    kind: "repaired_head_checks",
    branch: "monday-platform-genesis-01",
    head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    passed: true,
    warnings: [],
    evidence: ["old repaired-head checks passed"],
  },
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_non_status_authority");
