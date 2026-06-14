import {
  arbitrateCurrentInstructionHeadBoundary,
  type CurrentInstructionEmbodimentCandidate,
} from "./current-instruction-head-boundary.js";

const branch = "monday-platform-genesis-01";
const instructionHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "3151bdc7903cdc257dc93d5b203edb9f623e43bf";

function candidate(overrides: Partial<CurrentInstructionEmbodimentCandidate> = {}): CurrentInstructionEmbodimentCandidate {
  return {
    move_class: "external_platform_embodiment",
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/current-instruction-head-boundary.ts"],
    executable_artifacts: ["arbitrateCurrentInstructionHeadBoundary"],
    routing_artifacts: ["current instruction head boundary"],
    proof_artifacts: ["current-instruction-head-boundary-proof"],
    ...overrides,
  };
}

const admitted = arbitrateCurrentInstructionHeadBoundary({
  active_branch: branch,
  instruction_branch: branch,
  instruction_head_sha: instructionHead,
  live_head_sha: liveHead,
  resolved_repaired_head_sha: instructionHead,
  repaired_head_status_resolved: true,
  prohibited_blockers: ["old repaired-head status-readback blocker"],
  candidate: candidate(),
});
if (!admitted.ok || admitted.action !== "admit_live_head_embodiment") {
  throw new Error(`current instruction head boundary should admit live-head embodiment: ${admitted.blockers.join("; ")}`);
}
if (admitted.historical_head_sha !== instructionHead || admitted.quarantined_head_sha !== instructionHead) {
  throw new Error("current instruction head boundary should preserve the resolved repaired head only as historical context");
}
if (!admitted.decisive_evidence.includes("current-instruction-head-boundary-proof")) {
  throw new Error("current instruction embodiment admission must preserve proof evidence");
}

const missingProof = arbitrateCurrentInstructionHeadBoundary({
  active_branch: branch,
  instruction_branch: branch,
  instruction_head_sha: instructionHead,
  live_head_sha: liveHead,
  repaired_head_status_resolved: true,
  resolved_repaired_head_sha: instructionHead,
  prohibited_blockers: [],
  candidate: candidate({ proof_artifacts: [] }),
});
if (missingProof.ok || missingProof.action !== "block_incomplete_embodiment") {
  throw new Error("current instruction embodiment without proof evidence must be blocked");
}
if (!missingProof.blockers.some((blocker) => blocker.includes("proof artifact"))) {
  throw new Error("missing proof evidence must be named as the blocker");
}

const staleBase = arbitrateCurrentInstructionHeadBoundary({
  active_branch: branch,
  instruction_branch: branch,
  instruction_head_sha: instructionHead,
  live_head_sha: liveHead,
  repaired_head_status_resolved: true,
  resolved_repaired_head_sha: instructionHead,
  prohibited_blockers: [],
  candidate: candidate({ base_head_sha: instructionHead }),
});
if (staleBase.ok || staleBase.action !== "block_stale_instruction_head_as_current") {
  throw new Error("current instruction head boundary should block stale instruction head candidates");
}

const readback = arbitrateCurrentInstructionHeadBoundary({
  active_branch: branch,
  instruction_branch: branch,
  instruction_head_sha: instructionHead,
  live_head_sha: liveHead,
  repaired_head_status_resolved: true,
  resolved_repaired_head_sha: instructionHead,
  prohibited_blockers: [],
  candidate: candidate({ move_class: "fresh_status_readback", changed_files: [], executable_artifacts: [], routing_artifacts: [] }),
});
if (!readback.ok || readback.action !== "read_live_head_status" || readback.head_sha !== liveHead) {
  throw new Error("current instruction head boundary should route fresh readback to the live head");
}

console.log("current instruction head boundary proof passed");
