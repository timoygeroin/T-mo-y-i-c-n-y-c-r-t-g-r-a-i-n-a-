import assert from "node:assert/strict";

import { routeClosedPrContinuation } from "./closed-pr-continuation-boundary.js";

const target = {
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
  branch_writable: true,
  allowed_progress_classes: ["external_platform_embodiment"],
};

const closedWritable = routeClosedPrContinuation({
  ...target,
  state: "closed",
  merged: false,
  mergeable: false,
});

assert.equal(closedWritable.ok, true);
assert.equal(closedWritable.action, "continue_branch_embodiment");
assert.equal(closedWritable.next_route, "continue only on the named branch surface and do not claim open PR review status");
assert.deepEqual(closedWritable.blockers, []);

const closedBlocked = routeClosedPrContinuation({
  ...target,
  state: "closed",
  merged: false,
  branch_writable: false,
});

assert.equal(closedBlocked.ok, false);
assert.equal(closedBlocked.action, "emit_exact_external_blocker");
assert.deepEqual(closedBlocked.blockers, [
  "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-#2 is closed and no writable admitted embodiment surface remains",
]);

const merged = routeClosedPrContinuation({
  ...target,
  state: "closed",
  merged: true,
});

assert.equal(merged.ok, true);
assert.equal(merged.action, "route_to_successor_sink");
assert.equal(merged.next_route, "select the merged successor branch or mainline sink before further embodiment");

const openButNotWritable = routeClosedPrContinuation({
  ...target,
  state: "open",
  branch_writable: false,
});

assert.equal(openButNotWritable.ok, false);
assert.equal(openButNotWritable.action, "emit_exact_external_blocker");
assert.deepEqual(openButNotWritable.blockers, [
  "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-#2 is open but branch monday-platform-genesis-01 is not writable",
]);
