import assert from "node:assert/strict";

import {
  admitProcessorPacketManifestation,
  type ProcessorPacketManifestationPacket,
} from "./processor-packet-manifestation-admission.js";

const branch = "monday-platform-genesis-01";
const liveHead = "7e7c1f8c4a5d42bc8f14ec9b4a10d8a31b9d1240";

const packet: ProcessorPacketManifestationPacket = {
  packet_id: "processor-packet-manifestation-admission",
  branch,
  base_head_sha: liveHead,
  accepted_output: "manifestation engine must consume processor-selected writes, not proof-only summaries",
  semantic_signature: "processor-packet-to-github-contents-write",
  changed_files: [
    "platform/packages/manifestation-engine/src/processor-packet-manifestation-admission.ts",
    "platform/packages/manifestation-engine/src/processor-packet-manifestation-admission-proof.ts",
  ],
  behavior_exports: ["admitProcessorPacketManifestation"],
  routing_artifacts: ["processor packet manifestation admission gate"],
  proof_artifacts: ["platform/packages/manifestation-engine/src/processor-packet-manifestation-admission-proof.ts"],
  guard: {
    require_live_head_sha: liveHead,
    forbidden_targets: ["fresh_status_readback", "metadata_reread", "duplicate_comment", "local_memory_guard", "proof_only_change"],
  },
};

const admitted = admitProcessorPacketManifestation({
  admission_id: "processor-packet-admission-live-head",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  live_head_sha: liveHead,
  spent_packet_ids: [],
  target: "github_contents_write",
  packet,
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_processor_packet_manifestation_write");
assert.equal(admitted.command?.packet_id, packet.packet_id);
assert.deepEqual(admitted.blockers, []);
assert.match(admitted.next_route, /moved head/);

const stale = admitProcessorPacketManifestation({
  admission_id: "stale-packet",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  live_head_sha: liveHead,
  spent_packet_ids: [],
  target: "github_contents_write",
  packet: {
    ...packet,
    base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  },
});
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_wrong_head");

const duplicate = admitProcessorPacketManifestation({
  admission_id: "duplicate-packet",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  live_head_sha: liveHead,
  spent_packet_ids: [packet.packet_id],
  target: "github_contents_write",
  packet,
});
assert.equal(duplicate.ok, false);
assert.equal(duplicate.action, "block_reused_packet");

const proofOnly = admitProcessorPacketManifestation({
  admission_id: "proof-only-packet",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  live_head_sha: liveHead,
  spent_packet_ids: [],
  target: "github_contents_write",
  packet: {
    ...packet,
    changed_files: ["platform/packages/manifestation-engine/src/processor-packet-manifestation-admission-proof.ts"],
  },
});
assert.equal(proofOnly.ok, false);
assert.equal(proofOnly.action, "block_incomplete_packet");

const nonProgress = admitProcessorPacketManifestation({
  admission_id: "metadata-reread-packet",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  live_head_sha: liveHead,
  spent_packet_ids: [],
  target: "metadata_reread",
  packet,
});
assert.equal(nonProgress.ok, false);
assert.equal(nonProgress.action, "block_non_progress_target");

const blocker = admitProcessorPacketManifestation({
  admission_id: "packet-write-blocker",
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: branch,
  live_head_sha: liveHead,
  spent_packet_ids: [],
  target: "exact_external_blocker",
  exact_blocker: "GitHub contents API rejected the processor packet write",
});
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "emit_processor_packet_exact_blocker");
assert.deepEqual(blocker.blockers, ["GitHub contents API rejected the processor packet write"]);

console.log("processor packet manifestation admission proof passed");
