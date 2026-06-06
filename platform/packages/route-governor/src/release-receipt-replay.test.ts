import test from "node:test";
import assert from "node:assert/strict";

import {
  compileReceiptReplayGuard,
  type CandidateContinuationReceipt,
  type StoredContinuationReceipt,
} from "./release-receipt-replay.js";

const currentHead = "cdd854a9093eef39e14af9639d879c13813a132f";

function stored(overrides: Partial<StoredContinuationReceipt> = {}): StoredContinuationReceipt {
  return {
    receipt_id: "previous",
    branch: "monday-platform-genesis-01",
    head_sha: "old-head",
    release_class: "external_embodiment",
    decisive_evidence: ["platform/packages/route-governor/src/github-status-readback.ts"],
    executable_artifacts: ["compileGithubStatusReadback"],
    routing_artifacts: ["github status readback compiler"],
    status_surface_ids: ["27049651467"],
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateContinuationReceipt> = {}): CandidateContinuationReceipt {
  return {
    branch: "monday-platform-genesis-01",
    head_sha: currentHead,
    release_class: "external_embodiment",
    changed_files: ["platform/packages/route-governor/src/release-receipt-replay.ts"],
    executable_artifacts: ["compileReceiptReplayGuard"],
    routing_artifacts: ["continuation receipt replay guard"],
    status_surface_ids: [],
    ...overrides,
  };
}

test("accepts a new executable embodiment receipt on the current head", () => {
  const verdict = compileReceiptReplayGuard({
    current_head_sha: currentHead,
    previous_receipts: [stored()],
    candidate: candidate(),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_new_receipt");
  assert.equal(verdict.progress_class, "external_embodiment");
  assert.deepEqual(verdict.failures, []);
  assert.ok(verdict.decisive_evidence.includes("compileReceiptReplayGuard"));
});

test("blocks replaying the same receipt on the same head", () => {
  const previous = stored({
    head_sha: currentHead,
    release_class: "external_embodiment",
    executable_artifacts: ["compileReceiptReplayGuard"],
    routing_artifacts: ["continuation receipt replay guard"],
  });

  const verdict = compileReceiptReplayGuard({
    current_head_sha: currentHead,
    previous_receipts: [previous],
    candidate: candidate(),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_receipt");
  assert.ok(verdict.failures.some((failure) => failure.includes("repeats the last receipt")));
});

test("blocks fresh status readback receipts that are not bound to the current head", () => {
  const verdict = compileReceiptReplayGuard({
    current_head_sha: currentHead,
    previous_receipts: [stored()],
    candidate: candidate({
      release_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surface_ids: ["new-readback-run"],
      status_surface_head_sha: "old-head",
    }),
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("bound to the current PR head")));
});

test("accepts a fresh status readback receipt only when the status surface is new", () => {
  const verdict = compileReceiptReplayGuard({
    current_head_sha: currentHead,
    previous_receipts: [stored({ head_sha: currentHead, status_surface_ids: ["old-readback-run"] })],
    candidate: candidate({
      release_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surface_ids: ["new-readback-run"],
      status_surface_head_sha: currentHead,
    }),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.progress_class, "fresh_status_readback");
  assert.deepEqual(verdict.decisive_evidence, ["new-readback-run"]);
});

test("blocks repeating the same exact blocker on the same head", () => {
  const verdict = compileReceiptReplayGuard({
    current_head_sha: currentHead,
    previous_receipts: [
      stored({
        head_sha: currentHead,
        release_class: "exact_external_blocker",
        blocker: "no writable external branch surface is available",
      }),
    ],
    candidate: candidate({
      release_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      blocker: "no writable external branch surface is available",
    }),
  });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.some((failure) => failure.includes("repeats the previous blocker")));
});
