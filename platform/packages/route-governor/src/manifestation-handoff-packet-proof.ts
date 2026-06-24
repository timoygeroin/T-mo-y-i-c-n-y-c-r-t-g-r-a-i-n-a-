import assert from "node:assert/strict";

import {
  compileManifestationHandoffPacket,
  type ManifestationHandoffPacketInput,
} from "./manifestation-handoff-packet.js";

const head = "b94103e3c317c89828397fcba26d1154e66f79a1";
const branch = "monday-platform-genesis-01";

function input(overrides: Partial<ManifestationHandoffPacketInput> = {}): ManifestationHandoffPacketInput {
  return {
    packet_id: `handoff-pr-2:${head}`,
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    live_head_sha: head,
    expected_head_sha: head,
    intent: "merge_after_review",
    status: {
      head_sha: head,
      verdict: "passing_with_warnings",
      blocking_surfaces: [],
      warning_surfaces: ["Node.js 20 Actions deprecation notice"],
    },
    review: {
      head_sha: head,
      approvals: ["reviewer-a"],
      change_requests: [],
      pending_reviewers: [],
    },
    spent_packet_ids: [],
    ...overrides,
  };
}

const mergePacket = compileManifestationHandoffPacket(input());
assert.equal(mergePacket.ok, true);
assert.equal(mergePacket.action, "compile_merge_handoff_packet");
assert.equal(mergePacket.command, "merge_pull_request");
assert.deepEqual(mergePacket.blockers, []);
assert.equal(mergePacket.next_route, "issue a guarded merge command only for this live head");

const repairPacket = compileManifestationHandoffPacket(
  input({
    intent: "merge_after_review",
    review: {
      head_sha: head,
      approvals: [],
      change_requests: ["reviewer-b"],
      pending_reviewers: [],
    },
  }),
);
assert.equal(repairPacket.ok, false);
assert.equal(repairPacket.action, "compile_repair_handoff_packet");
assert.equal(repairPacket.command, "repair_review_changes");
assert.deepEqual(repairPacket.blockers, ["review changes requested by reviewer-b"]);

const embodimentPacket = compileManifestationHandoffPacket(
  input({
    intent: "continue_embodiment",
    packet_id: `handoff-embodiment-pr-2:${head}`,
    review: {
      head_sha: head,
      approvals: [],
      change_requests: [],
      pending_reviewers: ["reviewer-a"],
    },
    embodiment: {
      changed_files: ["platform/packages/route-governor/src/manifestation-handoff-packet.ts"],
      executable_artifacts: ["compileManifestationHandoffPacket"],
      routing_artifacts: ["manifestation handoff packet compiler"],
      proof_artifacts: ["dist/manifestation-handoff-packet-proof.js"],
    },
  }),
);
assert.equal(embodimentPacket.ok, true);
assert.equal(embodimentPacket.action, "compile_embodiment_handoff_packet");
assert.equal(embodimentPacket.command, "commit_external_embodiment");

const staleStatus = compileManifestationHandoffPacket(
  input({
    status: {
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      verdict: "passing",
      blocking_surfaces: [],
      warning_surfaces: [],
    },
  }),
);
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_packet_head");
assert.deepEqual(staleStatus.blockers, [
  "status surface head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head b94103e3c317c89828397fcba26d1154e66f79a1",
]);

const repeated = compileManifestationHandoffPacket(input({ spent_packet_ids: [`handoff-pr-2:${head}`] }));
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_packet");

console.log("manifestation handoff packet proof passed");
