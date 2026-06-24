import {
  settleProcessorFabricOutputs,
  type ProcessorSettlementDispatch,
  type ProcessorSettlementOutputClass,
  type ProcessorSettlementResult,
} from "./processor-settlement.js";
import type { ProcessorResultReceiptVerdict } from "./processor-result-receipt.js";
import type { ProcessorSourceAuthorityVerdict } from "./processor-source-authority.js";

export type SourceAuthorizedConvergenceAction =
  | "settle_source_authorized_external_act"
  | "settle_source_authorized_exact_blocker"
  | "block_missing_convergence_scene"
  | "block_missing_convergence_rule"
  | "block_missing_authorized_candidate"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_duplicate_authority"
  | "block_unauthorized_processor_result"
  | "block_unsettled_processor_convergence";

export interface SourceAuthorizedProcessorCandidate {
  authority: ProcessorSourceAuthorityVerdict;
  receipt: ProcessorResultReceiptVerdict;
}

export interface SourceAuthorizedConvergenceInput {
  scene_id: string;
  active_branch: string;
  live_head_sha: string;
  convergence_rule: string;
  dispatches: ProcessorSettlementDispatch[];
  candidates: SourceAuthorizedProcessorCandidate[];
  exhausted_external_acts: string[];
}

export interface SourceAuthorizedConvergenceVerdict {
  ok: boolean;
  action: SourceAuthorizedConvergenceAction;
  scene_id: string | null;
  branch: string;
  head_sha: string;
  accepted_output: string | null;
  authorized_outputs: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function block(
  input: SourceAuthorizedConvergenceInput,
  action: Exclude<
    SourceAuthorizedConvergenceAction,
    "settle_source_authorized_external_act" | "settle_source_authorized_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): SourceAuthorizedConvergenceVerdict {
  const sceneId = normalized(input.scene_id);
  return {
    ok: false,
    action,
    scene_id: sceneId || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    accepted_output: null,
    authorized_outputs: [],
    decisive_evidence: unique(evidence),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

function candidateEvidence(candidate: SourceAuthorizedProcessorCandidate): string[] {
  return unique([
    ...candidate.authority.decisive_evidence,
    ...candidate.receipt.decisive_evidence,
    ...(candidate.receipt.semantic_signature ? [`signature:${candidate.receipt.semantic_signature}`] : []),
  ]);
}

function candidateBlockers(input: SourceAuthorizedConvergenceInput, candidate: SourceAuthorizedProcessorCandidate): string[] {
  const blockers: string[] = [];

  if (candidate.authority.branch !== input.active_branch || candidate.receipt.branch !== input.active_branch) {
    blockers.push("source-authorized convergence candidate is not bound to the active branch");
  }
  if (candidate.authority.head_sha !== input.live_head_sha || candidate.receipt.head_sha !== input.live_head_sha) {
    blockers.push("source-authorized convergence candidate is not bound to the live head");
  }
  if (!candidate.authority.ok) {
    blockers.push(...candidate.authority.blockers.map((item) => `source authority blocked: ${item}`));
  }
  if (!candidate.receipt.ok) {
    blockers.push(...candidate.receipt.blockers.map((item) => `processor receipt blocked: ${item}`));
  }
  if (!candidate.authority.output_id) blockers.push("source authority has no output id");
  if (!candidate.receipt.receipt_id) blockers.push("processor receipt has no receipt id");
  if (candidate.authority.action === "admit_source_authorized_processor_output" && candidate.authority.decisive_evidence.length === 0) {
    blockers.push("source-authorized candidate has no decisive source evidence");
  }
  if (candidate.receipt.action === "accept_processor_result_receipt" && !candidate.receipt.accepted_output) {
    blockers.push("source-authorized candidate has no accepted processor output");
  }

  return blockers;
}

function toSettlementResult(candidate: SourceAuthorizedProcessorCandidate): ProcessorSettlementResult {
  const outputClass = candidate.receipt.output_class as ProcessorSettlementOutputClass;
  return {
    processor_id: candidate.receipt.processor_id,
    load_id: candidate.receipt.load_id,
    completed: true,
    output_class: outputClass,
    output: candidate.receipt.accepted_output ?? candidate.receipt.blockers[0] ?? candidate.authority.blockers[0] ?? "",
    evidence: candidateEvidence(candidate),
    blockers: unique([...candidate.authority.blockers, ...candidate.receipt.blockers]),
  };
}

export function compileSourceAuthorizedProcessorConvergence(
  input: SourceAuthorizedConvergenceInput,
): SourceAuthorizedConvergenceVerdict {
  const sceneId = normalized(input.scene_id);
  const convergenceRule = normalized(input.convergence_rule);

  if (!sceneId) {
    return block(input, "block_missing_convergence_scene", ["source-authorized convergence has no scene id"], "bind convergence to the active finalization scene");
  }

  if (!convergenceRule) {
    return block(input, "block_missing_convergence_rule", ["source-authorized convergence has no convergence rule"], "name the convergence rule before settling processor outputs");
  }

  if (input.candidates.length === 0) {
    return block(input, "block_missing_authorized_candidate", ["source-authorized convergence has no candidates"], "supply source-authorized processor receipts before settlement");
  }

  const blockers = input.candidates.flatMap((candidate) => candidateBlockers(input, candidate));
  if (blockers.some((item) => item.includes("active branch"))) {
    return block(input, "block_wrong_branch", blockers, "discard cross-branch processor convergence candidates", input.candidates.flatMap(candidateEvidence));
  }
  if (blockers.some((item) => item.includes("live head"))) {
    return block(input, "block_wrong_head", blockers, "rerun processor convergence from the live PR head", input.candidates.flatMap(candidateEvidence));
  }
  if (blockers.length > 0) {
    return block(input, "block_unauthorized_processor_result", blockers, "repair source authority and processor receipts before convergence", input.candidates.flatMap(candidateEvidence));
  }

  const authorityIds = input.candidates.map((candidate) => candidate.authority.output_id ?? "");
  const receiptIds = input.candidates.map((candidate) => candidate.receipt.receipt_id ?? "");
  if (unique(authorityIds).length !== authorityIds.length || unique(receiptIds).length !== receiptIds.length) {
    return block(
      input,
      "block_duplicate_authority",
      ["source-authorized convergence contains duplicate authority or receipt ids"],
      "settle each source-authorized processor output only once",
      input.candidates.flatMap(candidateEvidence),
    );
  }

  const settlement = settleProcessorFabricOutputs({
    scene_id: sceneId,
    convergence_rule: convergenceRule,
    dispatches: input.dispatches,
    results: input.candidates.map(toSettlementResult),
    exhausted_external_acts: input.exhausted_external_acts,
  });

  if (!settlement.ok) {
    return block(
      input,
      "block_unsettled_processor_convergence",
      settlement.blockers,
      settlement.next_route,
      settlement.decisive_evidence,
    );
  }

  return {
    ok: true,
    action:
      settlement.action === "settle_exact_external_blocker"
        ? "settle_source_authorized_exact_blocker"
        : "settle_source_authorized_external_act",
    scene_id: settlement.scene_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    accepted_output: settlement.accepted_output,
    authorized_outputs: unique([...authorityIds, ...receiptIds]),
    decisive_evidence: settlement.decisive_evidence,
    blockers: settlement.blockers,
    next_route:
      settlement.action === "settle_exact_external_blocker"
        ? "release the source-authorized exact blocker before any embodiment claim"
        : "release the source-authorized external act and bind follow-up status to the moved PR head only",
  };
}
