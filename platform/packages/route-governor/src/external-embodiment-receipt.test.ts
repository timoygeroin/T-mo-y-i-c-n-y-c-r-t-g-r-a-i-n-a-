import test from "node:test";
import assert from "node:assert/strict";

import { compileExternalEmbodimentReceipt, type ExternalEmbodimentReceiptInput } from "./external-embodiment-receipt.js";

const branch = "monday-platform-genesis-01";

function input(overrides: Partial<ExternalEmbodimentReceiptInput> = {}): ExternalEmbodimentReceiptInput {
  return {
    branch,
    active_branch: branch,
    previous_head_sha: "old-head",
    new_head_sha: "new-head",
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/external-embodiment-receipt.ts"],
    executable_artifacts: ["compileExternalEmbodimentReceipt"],
    routing_artifacts: ["new-head status readback is mandatory after embodiment"],
    spent_move_classes: [],
    ...overrides,
  };
}

test("accepts a moved-head executable embodiment receipt", () => {
  const verdict = compileExternalEmbodimentReceipt(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "record_embodiment");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("head moved from old-head to new-head"));
});

test("blocks old-head status evidence after a branch movement", () => {
  const verdict = compileExternalEmbodimentReceipt(
    input({
      attempted_status_surface: {
        head_sha: "old-head",
        verdict: "passing",
        evidence_ids: ["old-success"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not new head")));
});

test("blocks an embodiment receipt when the branch head did not move", () => {
  const verdict = compileExternalEmbodimentReceipt(input({ new_head_sha: "old-head" }));

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("external embodiment did not move the PR head"));
});

test("blocks non-executable branch changes", () => {
  const verdict = compileExternalEmbodimentReceipt(
    input({
      changed_files: ["platform/docs/manifestation-contract.md"],
      executable_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("external embodiment has no executable platform change"));
});

test("accepts a status surface only when it belongs to the new head", () => {
  const verdict = compileExternalEmbodimentReceipt(
    input({
      attempted_status_surface: {
        head_sha: "new-head",
        verdict: "passing_with_warnings",
        evidence_ids: ["new-check"],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "record_embodiment_with_status");
  assert.ok(verdict.decisive_evidence.some((item) => item.includes("new-head status evidence new-check")));
});

test("blocks pending status surfaces from becoming release evidence", () => {
  const verdict = compileExternalEmbodimentReceipt(
    input({
      attempted_status_surface: {
        head_sha: "new-head",
        verdict: "pending",
        evidence_ids: ["pending-run"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("attempted status surface is not complete: pending"));
});
