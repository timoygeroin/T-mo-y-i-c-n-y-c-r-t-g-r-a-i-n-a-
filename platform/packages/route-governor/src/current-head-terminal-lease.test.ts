import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compileCurrentHeadTerminalLease,
  type CurrentHeadTerminalLeaseInput,
} from "./current-head-terminal-lease.js";

const liveHead = "040a97d2da0444a509e98571364b9a24dd82c0d9";

function baseInput(overrides: Partial<CurrentHeadTerminalLeaseInput> = {}): CurrentHeadTerminalLeaseInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    lease_id: "current-head-terminal-lease-001",
    spent_lease_ids: [],
    mergeable: true,
    terminal_operations: ["merge_live_head"],
    behavior_artifacts: [],
    status_source: {
      source_id: "checks-040a97d2",
      kind: "current_head_checks",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      passed: true,
      warnings: ["Node.js 20 Actions deprecation notice"],
      evidence: ["Route governor proof examples succeeded"],
    },
    ...overrides,
  };
}

describe("compileCurrentHeadTerminalLease", () => {
  it("admits exactly one terminal consumer for passing current-head evidence", () => {
    const verdict = compileCurrentHeadTerminalLease(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_current_head_terminal_lease");
    assert.equal(verdict.operation, "merge_live_head");
    assert.equal(verdict.head_sha, liveHead);
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  });

  it("blocks repaired-head and summary surfaces as terminal status authority", () => {
    const verdict = compileCurrentHeadTerminalLease(
      baseInput({
        status_source: {
          ...baseInput().status_source,
          kind: "repaired_head_checks",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_status_authority");
    assert.match(verdict.blockers.join("; "), /repaired_head_checks/);
  });

  it("blocks current-head status attached to the wrong branch or head", () => {
    const verdict = compileCurrentHeadTerminalLease(
      baseInput({
        status_source: {
          ...baseInput().status_source,
          head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_status_head");
  });

  it("blocks repeated lease ids and bundled terminal operations", () => {
    const repeated = compileCurrentHeadTerminalLease(
      baseInput({ spent_lease_ids: ["current-head-terminal-lease-001"] }),
    );
    assert.equal(repeated.ok, false);
    assert.equal(repeated.action, "block_repeated_lease");

    const bundled = compileCurrentHeadTerminalLease(
      baseInput({ terminal_operations: ["merge_live_head", "request_review"] }),
    );
    assert.equal(bundled.ok, false);
    assert.equal(bundled.action, "block_bundled_terminal_operations");
  });

  it("blocks merge, embodiment, and blocker terminal consumers without their required evidence", () => {
    const merge = compileCurrentHeadTerminalLease(baseInput({ mergeable: false }));
    assert.equal(merge.ok, false);
    assert.equal(merge.action, "block_missing_mergeability");

    const embodiment = compileCurrentHeadTerminalLease(
      baseInput({ terminal_operations: ["commit_external_embodiment"], behavior_artifacts: ["README.md"] }),
    );
    assert.equal(embodiment.ok, false);
    assert.equal(embodiment.action, "block_missing_terminal_evidence");

    const blocker = compileCurrentHeadTerminalLease(
      baseInput({ terminal_operations: ["emit_exact_external_blocker"], blocker: "" }),
    );
    assert.equal(blocker.ok, false);
    assert.equal(blocker.action, "block_missing_terminal_evidence");
  });

  it("admits an embodiment terminal consumer only with behavior-bearing platform evidence", () => {
    const verdict = compileCurrentHeadTerminalLease(
      baseInput({
        terminal_operations: ["commit_external_embodiment"],
        behavior_artifacts: ["platform/packages/route-governor/src/current-head-terminal-lease.ts"],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.operation, "commit_external_embodiment");
    assert.ok(
      verdict.decisive_evidence.includes("platform/packages/route-governor/src/current-head-terminal-lease.ts"),
    );
  });
});
