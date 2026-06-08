import assert from "node:assert/strict";

import {
  compileStatusReadbackTransport,
  type StatusReadbackTransportInput,
} from "./status-readback-transport.js";

const branch = "monday-platform-genesis-01";
const previousReadbackHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "707e814c807354888b9f01581eec92b3ec907802";

function input(overrides: Partial<StatusReadbackTransportInput> = {}): StatusReadbackTransportInput {
  return {
    branch,
    active_branch: branch,
    required_head_sha: liveHead,
    previous_readback_head_sha: previousReadbackHead,
    surfaces: [
      {
        kind: "pr_metadata",
        state: "reachable",
        head_sha: liveHead,
        evidence: "PR metadata reports the moved head but does not include check-run conclusions",
      },
      {
        kind: "commit_diff",
        state: "reachable",
        head_sha: liveHead,
        evidence: "commit diff proves executable changes but not GitHub status",
      },
      {
        kind: "github_cli",
        state: "missing",
        evidence: "gh command is unavailable in the runtime",
      },
      {
        kind: "checks_api",
        state: "blocked",
        head_sha: liveHead,
        evidence: "direct GitHub API request failed before returning check-run data",
      },
      {
        kind: "workflow_published_readback",
        state: "stale",
        head_sha: previousReadbackHead,
        evidence: "latest visible PR comment is bound to the repaired head",
      },
    ],
    ...overrides,
  };
}

const blocked = compileStatusReadbackTransport(input());
assert.equal(blocked.ok, false);
assert.equal(blocked.action, "emit_exact_status_access_blocker");
assert.match(blocked.blocker ?? "", new RegExp(`CURRENT_HEAD_STATUS_READBACK_BLOCKED:${liveHead}`));
assert(blocked.decisive_evidence.some((line) => line.includes(previousReadbackHead)));
assert.match(blocked.next_route, /authenticated current-head Checks\/Actions surface/);

const reachableChecks = compileStatusReadbackTransport(
  input({
    surfaces: [
      {
        kind: "checks_api",
        state: "reachable",
        head_sha: liveHead,
        evidence: "Checks API returned seven current-head successful check groups",
      },
    ],
  }),
);
assert.equal(reachableChecks.ok, true);
assert.equal(reachableChecks.action, "use_status_transport");
assert.equal(reachableChecks.selected_surface?.kind, "checks_api");
assert.deepEqual(reachableChecks.decisive_evidence, ["Checks API returned seven current-head successful check groups"]);

const metadataOnly = compileStatusReadbackTransport(
  input({
    surfaces: [
      {
        kind: "pr_metadata",
        state: "reachable",
        head_sha: liveHead,
        evidence: "PR metadata reports head SHA only",
      },
    ],
  }),
);
assert.equal(metadataOnly.ok, false);
assert.equal(metadataOnly.action, "reject_non_status_surface");
assert.match(metadataOnly.blocker ?? "", /NON_STATUS_SURFACE_ONLY/);

const staleChecks = compileStatusReadbackTransport(
  input({
    surfaces: [
      {
        kind: "checks_api",
        state: "stale",
        head_sha: previousReadbackHead,
        evidence: "old repaired-head check runs succeeded",
      },
    ],
  }),
);
assert.equal(staleChecks.ok, false);
assert.equal(staleChecks.action, "emit_exact_status_access_blocker");
assert.match(staleChecks.decisive_evidence.join("\n"), /stale/);

const wrongBranch = compileStatusReadbackTransport(input({ branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.blocker, "STATUS_READBACK_BRANCH_MISMATCH:main:active branch is monday-platform-genesis-01");

console.log("status readback transport proof passed");
