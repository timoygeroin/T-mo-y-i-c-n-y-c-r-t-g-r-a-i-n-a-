import assert from "node:assert/strict";
import test from "node:test";

import {
  admitProcessorOutputIntegrity,
  type ProcessorOutputIntegrityCandidate,
  type ProcessorOutputIntegrityInput,
} from "./processor-output-integrity.js";

const branch = "monday-platform-genesis-01";
const liveHead = "9983ac8ea7c3b65f9a9ffcff99abf0f39b3f0fa8";

function candidate(overrides: Partial<ProcessorOutputIntegrityCandidate> = {}): ProcessorOutputIntegrityCandidate {
  return {
    processor_id: "loading-20:processor:4",
    load_id: "external-act",
    branch,
    head_sha: liveHead,
    output_class: "external_act",
    output: "commit processor output integrity gate",
    evidence: ["platform/packages/processor-fabric/src/processor-output-integrity.ts"],
    source_tiers: ["direct_current_instruction", "archive_derived"],
    semantic_signature: "processor-output-integrity:external-act",
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<ProcessorOutputIntegrityInput> = {}): ProcessorOutputIntegrityInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    integrity_id: "processor-output-integrity-001",
    spent_integrity_ids: [],
    spent_semantic_signatures: [],
    required_processor_ids: ["loading-20:processor:4"],
    minimum_source_tier: "archive_derived",
    candidates: [candidate()],
    ...overrides,
  };
}

test("admits source-bound processor outputs for convergence", () => {
  const verdict = admitProcessorOutputIntegrity(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_processor_output_integrity");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.admitted_processor_ids.includes("loading-20:processor:4"));
  assert.ok(verdict.admitted_signatures.includes("processor-output-integrity:external-act"));
});

test("blocks missing required processor outputs", () => {
  const verdict = admitProcessorOutputIntegrity(
    input({ required_processor_ids: ["loading-20:processor:1", "loading-20:processor:4"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_required_processor");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("loading-20:processor:1")));
});

test("blocks duplicate processor/load outputs", () => {
  const verdict = admitProcessorOutputIntegrity(input({ candidates: [candidate(), candidate()] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_duplicate_processor_output");
});

test("blocks model-summary-only processor outputs", () => {
  const verdict = admitProcessorOutputIntegrity(
    input({
      candidates: [
        candidate({
          source_tiers: ["model_summary"],
          evidence: ["model_summary:prior neat conclusion"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_weak_source_tier");
});

test("settles exact processor blockers before convergence", () => {
  const blocker = "processor branch found unresolved source conflict";
  const verdict = admitProcessorOutputIntegrity(
    input({
      candidates: [
        candidate({
          output_class: "exact_blocker",
          output: blocker,
          semantic_signature: "processor-output-integrity:exact-blocker",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "settle_exact_processor_blocker");
  assert.deepEqual(verdict.blockers, [blocker]);
});

test("blocks unresolved route attacks before convergence", () => {
  const verdict = admitProcessorOutputIntegrity(
    input({
      candidates: [
        candidate({
          output_class: "route_attack",
          output: "candidate repeats post-review gate class",
          semantic_signature: "processor-output-integrity:route-attack",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unresolved_processor_blocker");
});
