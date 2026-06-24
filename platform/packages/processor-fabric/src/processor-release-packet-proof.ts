import { compileProcessorReleasePacket, type ProcessorReleasePacketInput } from "./processor-release-packet.js";

function input(overrides: Partial<ProcessorReleasePacketInput> = {}): ProcessorReleasePacketInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "98efb8e0df3d399134db452a72b24803152e1070",
    packet_id: "processor-release-packet-01",
    spent_packet_ids: [],
    target: "external_platform_embodiment",
    convergence: {
      ok: true,
      branch: "monday-platform-genesis-01",
      head_sha: "98efb8e0df3d399134db452a72b24803152e1070",
      accepted_output: "processor-selected external embodiment",
      blockers: [],
      decisive_evidence: ["processor convergence settled one external act"],
    },
    work_order: {
      candidate_id: "processor-release-packet",
      branch: "monday-platform-genesis-01",
      base_head_sha: "98efb8e0df3d399134db452a72b24803152e1070",
      semantic_signature: "processor-release-packet-compiler",
      files: [
        {
          path: "platform/packages/processor-fabric/src/processor-release-packet.ts",
          operation: "create",
          behavior_export: "compileProcessorReleasePacket",
          routing_effect: "processor convergence becomes one branch-bound embodiment packet or one exact blocker",
        },
      ],
      proof_artifacts: ["platform/packages/processor-fabric/src/processor-release-packet-proof.ts"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectFailure(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should fail, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

const admitted = compileProcessorReleasePacket(input());
expectOk("processor release packet", admitted.ok, admitted.blockers);
if (admitted.action !== "compile_processor_release_packet") {
  throw new Error(`expected compile_processor_release_packet, got ${admitted.action}`);
}
if (admitted.packet?.guard.require_live_head_sha !== "98efb8e0df3d399134db452a72b24803152e1070") {
  throw new Error("packet did not bind the live head guard");
}
if (!admitted.packet?.behavior_exports.includes("compileProcessorReleasePacket")) {
  throw new Error("packet did not preserve behavior export evidence");
}

const staleConvergence = compileProcessorReleasePacket(
  input({
    convergence: {
      ok: true,
      branch: "monday-platform-genesis-01",
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      accepted_output: "stale convergence",
      blockers: [],
      decisive_evidence: ["stale repaired-head convergence"],
    },
  }),
);
expectFailure("stale convergence head", staleConvergence.ok, staleConvergence.blockers, "convergence head");

const nonProgress = compileProcessorReleasePacket(input({ target: "metadata_reread" }));
expectFailure("metadata reread target", nonProgress.ok, nonProgress.blockers, "non-progress");

const proofOnly = compileProcessorReleasePacket(
  input({
    work_order: {
      candidate_id: "proof-only",
      branch: "monday-platform-genesis-01",
      base_head_sha: "98efb8e0df3d399134db452a72b24803152e1070",
      semantic_signature: "proof-only-release",
      files: [
        {
          path: "platform/packages/processor-fabric/src/processor-release-packet-proof.ts",
          operation: "create",
          behavior_export: "runProcessorReleasePacketProof",
          routing_effect: "proof-only release should not count as embodiment",
        },
      ],
      proof_artifacts: ["platform/packages/processor-fabric/src/processor-release-packet-proof.ts"],
    },
  }),
);
expectFailure("proof-only packet", proofOnly.ok, proofOnly.blockers, "behavior-bearing executable file");

const blocker = compileProcessorReleasePacket(
  input({
    target: "exact_external_blocker",
    exact_blocker: "no writable live-head branch surface is available",
    work_order: undefined,
  }),
);
expectOk("exact blocker packet", blocker.ok, blocker.blockers);
if (blocker.action !== "emit_processor_release_blocker") {
  throw new Error(`expected emit_processor_release_blocker, got ${blocker.action}`);
}
