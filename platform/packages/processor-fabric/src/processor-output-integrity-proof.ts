import assert from "node:assert/strict";

import { admitProcessorOutputIntegrity } from "./processor-output-integrity.js";

const branch = "monday-platform-genesis-01";
const liveHead = "9983ac8ea7c3b65f9a9ffcff99abf0f39b3f0fa8";

const admitted = admitProcessorOutputIntegrity({
  active_branch: branch,
  live_head_sha: liveHead,
  integrity_id: "processor-output-integrity-proof",
  spent_integrity_ids: [],
  spent_semantic_signatures: [],
  required_processor_ids: ["loading-20:processor:4"],
  minimum_source_tier: "archive_derived",
  candidates: [
    {
      processor_id: "loading-20:processor:4",
      load_id: "external-act",
      branch,
      head_sha: liveHead,
      output_class: "external_act",
      output: "commit processor output integrity gate",
      evidence: [
        "Dima current instruction requires one non-repeated external platform embodiment increment",
        "platform/packages/processor-fabric/src/processor-output-integrity.ts",
      ],
      source_tiers: ["direct_current_instruction", "archive_derived"],
      semantic_signature: "processor-output-integrity-proof:external-act",
      blockers: [],
    },
  ],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_processor_output_integrity");
assert.ok(admitted.accepted_outputs.includes("commit processor output integrity gate"));

const repeatedSignature = admitProcessorOutputIntegrity({
  active_branch: branch,
  live_head_sha: liveHead,
  integrity_id: "processor-output-integrity-proof-repeat",
  spent_integrity_ids: [],
  spent_semantic_signatures: ["processor-output-integrity-proof:external-act"],
  required_processor_ids: ["loading-20:processor:4"],
  minimum_source_tier: "archive_derived",
  candidates: [
    {
      processor_id: "loading-20:processor:4",
      load_id: "external-act",
      branch,
      head_sha: liveHead,
      output_class: "external_act",
      output: "commit processor output integrity gate",
      evidence: ["platform/packages/processor-fabric/src/processor-output-integrity-proof.ts"],
      source_tiers: ["archive_derived"],
      semantic_signature: "processor-output-integrity-proof:external-act",
      blockers: [],
    },
  ],
});

assert.equal(repeatedSignature.ok, false);
assert.equal(repeatedSignature.action, "block_recycled_signature");

const unresolvedAttack = admitProcessorOutputIntegrity({
  active_branch: branch,
  live_head_sha: liveHead,
  integrity_id: "processor-output-integrity-proof-attack",
  spent_integrity_ids: [],
  spent_semantic_signatures: [],
  required_processor_ids: ["loading-20:processor:2"],
  minimum_source_tier: "archive_derived",
  candidates: [
    {
      processor_id: "loading-20:processor:2",
      load_id: "route-attack",
      branch,
      head_sha: liveHead,
      output_class: "route_attack",
      output: "candidate repeats post-review gate class",
      evidence: ["platform/packages/processor-fabric/src/processor-output-integrity-proof.ts"],
      source_tiers: ["archive_derived"],
      semantic_signature: "processor-output-integrity-proof:route-attack",
      blockers: [],
    },
  ],
});

assert.equal(unresolvedAttack.ok, false);
assert.equal(unresolvedAttack.action, "block_unresolved_processor_blocker");
