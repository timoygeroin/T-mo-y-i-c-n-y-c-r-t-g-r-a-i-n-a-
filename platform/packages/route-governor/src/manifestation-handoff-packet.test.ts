import assert from "node:assert/strict";
import test from "node:test";

import {
  compileManifestationHandoffPacket,
  type ManifestationHandoffPacketInput,
} from "./manifestation-handoff-packet.js";

const head = "b94103e3c317c89828397fcba26d1154e66f79a1";

function input(overrides: Partial<ManifestationHandoffPacketInput> = {}): ManifestationHandoffPacketInput {
  return {
    packet_id: `packet:${head}`,
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: head,
    expected_head_sha: head,
    intent: "merge_after_review",
    status: {
      head_sha: head,
      verdict: "passing",
      blocking_surfaces: [],
      warning_surfaces: [],
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

test("compiles a merge handoff only from live status and approval", () => {
  const verdict = compileManifestationHandoffPacket(input());
  assert.equal(verdict.ok, true);
  assert.equal(verdict.command, "merge_pull_request");
  assert.match(verdict.decisive_evidence.join(" "), /approved by reviewer-a/);
});

test("routes live change requests to repair before merge", () => {
  const verdict = compileManifestationHandoffPacket(
    input({
      review: {
        head_sha: head,
        approvals: [],
        change_requests: ["reviewer-b"],
        pending_reviewers: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.command, "repair_review_changes");
  assert.deepEqual(verdict.blockers, ["review changes requested by reviewer-b"]);
});

test("blocks stale packet surfaces", () => {
  const verdict = compileManifestationHandoffPacket(input({ expected_head_sha: "old-head" }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_packet_head");
});

test("requires behavior-bearing embodiment evidence", () => {
  const verdict = compileManifestationHandoffPacket(
    input({
      intent: "continue_embodiment",
      embodiment: {
        changed_files: ["platform/packages/route-governor/src/manifestation-handoff-packet-proof.ts"],
        executable_artifacts: ["compileManifestationHandoffPacket"],
        routing_artifacts: ["manifestation handoff packet compiler"],
        proof_artifacts: ["dist/manifestation-handoff-packet-proof.js"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.blockers, ["handoff embodiment is proof-only and has no behavior file"]);
});
