import type { FinalReviewAuthorityConsumptionVerdict } from "./final-review-authority-consumption.js";

export type FinalAuthorityTerminalCandidateKind =
  | "review_request"
  | "merge_execution"
  | "exact_external_blocker"
  | "ordinary_embodiment"
  | "status_readback"
  | "failed_terminal_repair";

export type FinalAuthorityTerminalGateAction =
  | "admit_terminal_review_request"
  | "admit_terminal_merge_execution"
  | "admit_exact_external_blocker"
  | "admit_failed_terminal_repair"
  | "block_new_embodiment_after_final_authority"
  | "block_unconsumed_final_authority"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_reused_gate"
  | "block_missing_gate_id"
  | "block_missing_repair_evidence"
  | "block_non_terminal_candidate";

export interface FinalAuthorityTerminalCandidate {
  candidate_id: string;
  kind: FinalAuthorityTerminalCandidateKind;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface FinalAuthorityTerminalGateInput {
  active_branch: string;
  live_head_sha: string;
  gate_id: string;
  spent_gate_ids: string[];
  authority_consumption: FinalReviewAuthorityConsumptionVerdict;
  candidate: FinalAuthorityTerminalCandidate;
}

export interface FinalAuthorityTerminalGateVerdict {
  ok: boolean;
  action: FinalAuthorityTerminalGateAction;
  gate_id: string | null;
  branch: string;
  head_sha: string;
  candidate_id: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableBehaviorFile(path: string): boolean {
  return (
    path.startsWith("platform/packages/route-governor/src/") &&
    path.endsWith(".ts") &&
    !path.endsWith(".test.ts") &&
    !path.endsWith("-proof.ts")
  );
}

function base(input: FinalAuthorityTerminalGateInput): Pick<
  FinalAuthorityTerminalGateVerdict,
  "gate_id" | "branch" | "head_sha" | "candidate_id"
> {
  return {
    gate_id: input.gate_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    candidate_id: input.candidate.candidate_id,
  };
}

function evidence(input: FinalAuthorityTerminalGateInput): string[] {
  return [
    `gate ${input.gate_id.trim() || "<missing>"}`,
    `candidate ${input.candidate.candidate_id}`,
    `candidate kind ${input.candidate.kind}`,
    `authority action ${input.authority_consumption.action}`,
    `authority command ${input.authority_consumption.command}`,
    `live head ${input.live_head_sha}`,
    ...input.authority_consumption.decisive_evidence,
  ];
}

function block(
  input: FinalAuthorityTerminalGateInput,
  action: Exclude<
    FinalAuthorityTerminalGateAction,
    | "admit_terminal_review_request"
    | "admit_terminal_merge_execution"
    | "admit_exact_external_blocker"
    | "admit_failed_terminal_repair"
  >,
  blockers: string[],
  nextRoute: string,
): FinalAuthorityTerminalGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

function admit(
  input: FinalAuthorityTerminalGateInput,
  action: Extract<
    FinalAuthorityTerminalGateAction,
    | "admit_terminal_review_request"
    | "admit_terminal_merge_execution"
    | "admit_exact_external_blocker"
    | "admit_failed_terminal_repair"
  >,
  nextRoute: string,
): FinalAuthorityTerminalGateVerdict {
  return {
    ...base(input),
    ok: true,
    action,
    decisive_evidence: [
      ...evidence(input),
      ...input.candidate.changed_files,
      ...input.candidate.executable_artifacts,
      ...input.candidate.routing_artifacts,
    ],
    blockers: action === "admit_exact_external_blocker" ? [input.candidate.blocker ?? input.authority_consumption.blockers[0] ?? "exact external blocker"] : [],
    next_route: nextRoute,
  };
}

function terminalRepairAllowed(input: FinalAuthorityTerminalGateInput): boolean {
  return (
    input.candidate.kind === "failed_terminal_repair" &&
    input.authority_consumption.action === "block_failed_result_receipt" &&
    input.authority_consumption.blockers.length > 0 &&
    input.candidate.changed_files.some(executableBehaviorFile)
  );
}

export function gateFinalAuthorityTerminalCommand(
  input: FinalAuthorityTerminalGateInput,
): FinalAuthorityTerminalGateVerdict {
  const gateId = input.gate_id.trim();

  if (!gateId) return block(input, "block_missing_gate_id", ["final authority terminal gate has no gate id"], "issue one durable gate id before terminal authority can be consumed");
  if (input.spent_gate_ids.includes(gateId)) return block(input, "block_reused_gate", [`final authority terminal gate already spent: ${gateId}`], "do not replay a terminal gate; reread live authority before another terminal command");

  if (input.authority_consumption.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`authority consumption branch ${input.authority_consumption.branch} does not match active branch ${input.active_branch}`], "rebuild terminal authority from the active PR branch");
  }

  if (input.authority_consumption.head_sha !== input.live_head_sha) {
    return block(input, "block_wrong_head", [`authority consumption head ${input.authority_consumption.head_sha} does not match live head ${input.live_head_sha}`], "discard stale terminal authority and rebuild from the live PR head");
  }

  if (terminalRepairAllowed(input)) {
    return admit(input, "admit_failed_terminal_repair", "commit only the named terminal-result repair, then reread moved-head status before consuming final authority again");
  }

  if (input.candidate.kind === "failed_terminal_repair") {
    return block(input, "block_missing_repair_evidence", ["terminal repair requires a failed terminal result receipt and a behavior-bearing route-governor source file"], "attach the failed terminal receipt blocker and executable repair evidence before repair admission");
  }

  if (!input.authority_consumption.ok || input.authority_consumption.action !== "accept_authority_consumption") {
    if (input.authority_consumption.action === "emit_exact_external_blocker" && input.candidate.kind === "exact_external_blocker") {
      return admit(input, "admit_exact_external_blocker", "release the exact external blocker and stop terminal command routing until it is removed");
    }

    return block(input, "block_unconsumed_final_authority", input.authority_consumption.blockers.length > 0 ? input.authority_consumption.blockers : [`authority consumption action is ${input.authority_consumption.action}`], "consume final-review authority before admitting a terminal command");
  }

  if (input.candidate.kind === "ordinary_embodiment" || input.candidate.kind === "status_readback") {
    return block(input, "block_new_embodiment_after_final_authority", [`${input.candidate.kind} cannot follow accepted final-review authority as terminal progress`], "execute the admitted review request or merge finalization command instead of adding another branch mutation");
  }

  if (input.authority_consumption.command === "request_final_review" && input.candidate.kind === "review_request") {
    return admit(input, "admit_terminal_review_request", "send the live-head review request once, then route only from its external result receipt");
  }

  if (input.authority_consumption.command === "merge_finalization" && input.candidate.kind === "merge_execution") {
    return admit(input, "admit_terminal_merge_execution", "execute the guarded merge once, then seal the merge result receipt");
  }

  return block(input, "block_non_terminal_candidate", [`candidate ${input.candidate.kind} does not match final authority command ${input.authority_consumption.command}`], "choose the terminal command admitted by final-review authority or emit the exact external blocker");
}
