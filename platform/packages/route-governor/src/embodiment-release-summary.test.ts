import assert from "node:assert/strict";
import { test } from "node:test";

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

test("accepts moved-head embodiment summaries with no status claim", () => {
  const verdict = compileEmbodimentReleaseSummary(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_moved_head_summary");
  assert.equal(verdict.head_sha, resulting);
  assert.ok(verdict.decisive_evidence.includes(`no status claim made for ${resulting}`));
  assert.deepEqual(verdict.quarantined_heads, [repaired]);
});

test("blocks summaries that do not move the branch head", () => {
  const verdict = compileEmbodimentReleaseSummary(input({ resulting_head_sha: previous }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_head");
  assert.deepEqual(verdict.blockers, [`release summary did not move beyond ${previous}`]);
});

test("blocks status claims without a matching resulting-head readback", () => {
  const verdict = compileEmbodimentReleaseSummary(
    input({ status_claim: "passing_with_warnings", status_readback_head_sha: repaired }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_claim_without_readback");
  assert.deepEqual(verdict.blockers, [
    `status claim passing_with_warnings belongs to ${repaired}, not resulting head ${resulting}`,
  ]);
});

test("blocks proof-only summaries", () => {
  const verdict = compileEmbodimentReleaseSummary(
    input({ changed_files: ["platform/packages/route-governor/src/embodiment-release-summary-proof.ts"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_summary");
  assert.ok(verdict.blockers.includes("release summary cites no behavior-bearing platform file"));
});

test("blocks branch mismatch", () => {
  const verdict = compileEmbodimentReleaseSummary(input({ summary_branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
});
