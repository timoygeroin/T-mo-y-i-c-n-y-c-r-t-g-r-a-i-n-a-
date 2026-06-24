import assert from "node:assert/strict";

import {
  routeProcessorPostWriteStatusCursor,
  type ProcessorPostWriteStatusCursorInput,
} from "./processor-post-write-status-cursor.js";

const preWriteHead = "965216dab154a88f03687df42c7aa457cb7aa457";
const postWriteHead = "post-write-head";

function base(overrides: Partial<ProcessorPostWriteStatusCursorInput> = {}): ProcessorPostWriteStatusCursorInput {
  return {
    cursor_id: "processor-post-write-status-cursor-proof",
    active_branch: "monday-platform-genesis-01",
    receipt_branch: "monday-platform-genesis-01",
    pre_write_head_sha: preWriteHead,
    post_write_head_sha: postWriteHead,
    changed_files: [
      "platform/packages/processor-fabric/src/processor-post-write-status-cursor.ts",
      "platform/packages/processor-fabric/src/processor-post-write-status-cursor-proof.ts",
    ],
    behavior_exports: ["routeProcessorPostWriteStatusCursor"],
    proof_artifacts: ["processor-post-write-status-cursor-proof"],
    spent_cursor_ids: [],
    ...overrides,
  };
}

const opened = routeProcessorPostWriteStatusCursor(base());
assert.equal(opened.ok, true);
assert.equal(opened.action, "open_processor_post_write_status_cursor");
assert.deepEqual(opened.quarantined_head_shas, [preWriteHead]);
assert.equal(opened.next_route.includes("do not reuse pre-write checks as progress"), true);

const staleStatus = routeProcessorPostWriteStatusCursor(base({
  status_surface: {
    head_sha: preWriteHead,
    ok: true,
    decisive_successes: ["old proof passed"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: [],
  },
}));
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_status_surface");

const failingStatus = routeProcessorPostWriteStatusCursor(base({
  status_surface: {
    head_sha: postWriteHead,
    ok: false,
    decisive_successes: ["typecheck passed"],
    blocking_failures: ["processor proof failed"],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 deprecation warning"],
  },
}));
assert.equal(failingStatus.ok, false);
assert.equal(failingStatus.action, "emit_processor_post_write_blocker");
assert.deepEqual(failingStatus.blockers, ["processor proof failed"]);
assert.deepEqual(failingStatus.warnings, ["Node.js 20 deprecation warning"]);

const admitted = routeProcessorPostWriteStatusCursor(base({
  status_surface: {
    head_sha: postWriteHead,
    ok: true,
    decisive_successes: ["Processor Fabric proof examples passed for post-write head"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 deprecation warning"],
  },
}));
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_processor_post_write_status");
assert.equal(admitted.next_route.includes("may consume this cursor once"), true);

const incomplete = routeProcessorPostWriteStatusCursor(base({
  changed_files: ["platform/packages/processor-fabric/package.json"],
  behavior_exports: [],
}));
assert.equal(incomplete.ok, false);
assert.equal(incomplete.action, "block_incomplete_write_receipt");
