import assert from "node:assert/strict";

import { compileEmbodimentReleaseSummary, type EmbodimentReleaseSummaryInput } from "./embodiment-release-summary.js";

const branch = "monday-platform-genesis-01";
const previous = "61d938a675b864cbad745007a550a9881ac0a106";
const resulting = "5d810083c9b4d8d099e3855c0acf6a70e24587b1";
const repaired = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<EmbodimentReleaseSummaryInput> = {}): EmbodimentReleaseSummaryInput {
  return {
    active_branch: branch,
    summary_branch: branch,
    previous_head_sha: previous,
    resulting_head_sha: resulting,
    changed_files: ["platform/packages/route-governor/src/embodiment-release-summary.ts"],
    executable_artifacts: ["compileEmbodimentReleaseSummary"],
    routing_artifacts: ["moved-head release summaries cannot smuggle status claims"],
    proof_artifacts: ["dist/embodiment-release-summary-proof.js"],
    status_claim: "none",
    resolved_historical_heads: [repaired],
    ...overrides,
  };
}

const accepted = compileEmbodimentReleaseSummary(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_moved_head_summary");
assert.equal(accepted.head_sha, resulting);

const staleStatus = compileEmbodimentReleaseSummary(
  input({ status_claim: "passing", status_readback_head_sha: repaired }),
);
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_status_claim_without_readback");

const unmoved = compileEmbodimentReleaseSummary(input({ resulting_head_sha: previous }));
assert.equal(unmoved.ok, false);
assert.equal(unmoved.action, "block_unmoved_head");

console.log("embodiment release summary proof passed");
