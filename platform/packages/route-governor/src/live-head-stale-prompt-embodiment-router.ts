import { arbitrateCurrentInstructionHeadBoundary, type CurrentInstructionEmbodimentCandidate } from "./current-instruction-head-boundary.js";
import { admitLiveHeadEmbodimentLease, type LiveHeadEmbodimentWritePlan, type LiveHeadStatusLeaseEvidence } from "./live-head-embodiment-lease.js";

export type LiveHeadStalePromptEmbodimentAction =
  | "admit_live_head_embodiment_after_stale_prompt"
  | "route_to_live_head_status_readback"
  | "block_stale_prompt_embodiment";

export interface LiveHeadStalePromptEmbodimentInput {
  active_branch: string;
  instruction_branch: string;
  instruction_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  prohibited_blockers: string[];
  status_lease?: LiveHeadStatusLeaseEvidence;
  spent_lease_ids: string[];
  spent_write_signatures: string[];
  write_plan: LiveHeadEmbodimentWritePlan;
}

export interface LiveHeadStalePromptEmbodimentVerdict {
  ok: boolean;
  action: LiveHeadStalePromptEmbodimentAction;
  branch: string;
  head_sha: string;
  stale_prompt_head_sha: string | null;
  lease_id: string | null;
  admitted_write_signature: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function candidateFromWritePlan(writePlan: LiveHeadEmbodimentWritePlan): CurrentInstructionEmbodimentCandidate {
  return {
    move_class: "external_platform_embodiment",
    base_head_sha: writePlan.base_head_sha,
    changed_files: writePlan.changed_files,
    executable_artifacts: writePlan.behavior_exports,
    routing_artifacts: writePlan.routing_effects,
    proof_artifacts: [`write plan ${writePlan.plan_id} carries live-head embodiment proof`],
  };
}

export function routeLiveHeadStalePromptEmbodiment(
  input: LiveHeadStalePromptEmbodimentInput,
): LiveHeadStalePromptEmbodimentVerdict {
  const boundary = arbitrateCurrentInstructionHeadBoundary({
    active_branch: input.active_branch,
    instruction_branch: input.instruction_branch,
    instruction_head_sha: input.instruction_head_sha,
    live_head_sha: input.live_head_sha,
    resolved_repaired_head_sha: input.resolved_repaired_head_sha,
    repaired_head_status_resolved: input.repaired_head_status_resolved,
    prohibited_blockers: input.prohibited_blockers,
    candidate: candidateFromWritePlan(input.write_plan),
  });

  const stalePromptHead = input.instruction_head_sha === input.live_head_sha ? null : input.instruction_head_sha;

  if (!boundary.ok) {
    return {
      ok: false,
      action: "block_stale_prompt_embodiment",
      branch: boundary.branch,
      head_sha: boundary.head_sha,
      stale_prompt_head_sha: stalePromptHead,
      lease_id: null,
      admitted_write_signature: null,
      decisive_evidence: boundary.decisive_evidence,
      blockers: boundary.blockers,
      next_route: boundary.next_route,
    };
  }

  if (boundary.action !== "admit_live_head_embodiment") {
    return {
      ok: false,
      action: "route_to_live_head_status_readback",
      branch: boundary.branch,
      head_sha: boundary.head_sha,
      stale_prompt_head_sha: stalePromptHead,
      lease_id: null,
      admitted_write_signature: null,
      decisive_evidence: boundary.decisive_evidence,
      blockers: boundary.blockers,
      next_route: boundary.next_route,
    };
  }

  const lease = admitLiveHeadEmbodimentLease({
    active_branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    repaired_historical_heads: [input.resolved_repaired_head_sha],
    spent_lease_ids: input.spent_lease_ids,
    spent_write_signatures: input.spent_write_signatures,
    status_lease: input.status_lease,
    write_plan: input.write_plan,
  });

  if (!lease.ok) {
    return {
      ok: false,
      action: "block_stale_prompt_embodiment",
      branch: lease.branch,
      head_sha: lease.head_sha,
      stale_prompt_head_sha: stalePromptHead,
      lease_id: lease.lease_id,
      admitted_write_signature: null,
      decisive_evidence: [...boundary.decisive_evidence, ...lease.decisive_evidence],
      blockers: lease.blockers,
      next_route: lease.next_route,
    };
  }

  return {
    ok: true,
    action: "admit_live_head_embodiment_after_stale_prompt",
    branch: lease.branch,
    head_sha: lease.head_sha,
    stale_prompt_head_sha: stalePromptHead,
    lease_id: lease.lease_id,
    admitted_write_signature: lease.admitted_write_signature,
    decisive_evidence: [...boundary.decisive_evidence, ...lease.decisive_evidence],
    blockers: [],
    next_route: "commit the live-head embodiment and open post-write status escrow only for the moved head",
  };
}
