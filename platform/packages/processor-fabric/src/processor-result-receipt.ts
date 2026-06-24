export type ProcessorResultReceiptOutputClass =
  | "ledger_delta"
  | "route_attack"
  | "candidate_mechanism"
  | "omission_warning"
  | "proof_pressure"
  | "external_act"
  | "exact_blocker";

export type ProcessorResultReceiptAction =
  | "accept_processor_result_receipt"
  | "emit_exact_processor_blocker"
  | "block_missing_receipt_id"
  | "block_reused_receipt"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_missing_dispatch_binding"
  | "block_incomplete_result"
  | "block_missing_evidence"
  | "block_recycled_signature"
  | "block_missing_exact_blocker";

export interface ProcessorResultReceiptDispatch {
  processor_id: string;
  load_id: string;
  required_output: ProcessorResultReceiptOutputClass;
}

export interface ProcessorResultReceiptCandidate {
  receipt_id: string;
  branch: string;
  head_sha: string;
  processor_id: string;
  load_id: string;
  completed: boolean;
  output_class: ProcessorResultReceiptOutputClass;
  output: string;
  evidence: string[];
  blockers: string[];
  semantic_signature: string;
}

export interface ProcessorResultReceiptInput {
  active_branch: string;
  live_head_sha: string;
  dispatch: ProcessorResultReceiptDispatch;
  candidate: ProcessorResultReceiptCandidate;
  spent_receipt_ids: string[];
  spent_semantic_signatures: string[];
}

export interface ProcessorResultReceiptVerdict {
  ok: boolean;
  action: ProcessorResultReceiptAction;
  receipt_id: string | null;
  branch: string;
  head_sha: string;
  processor_id: string;
  load_id: string;
  output_class: ProcessorResultReceiptOutputClass;
  accepted_output: string | null;
  decisive_evidence: string[];
  blockers: string[];
  semantic_signature: string | null;
  next_route: string;
}

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function base(input: ProcessorResultReceiptInput): Omit<
  ProcessorResultReceiptVerdict,
  "ok" | "action" | "accepted_output" | "decisive_evidence" | "blockers" | "next_route"
> {
  return {
    receipt_id: normalized(input.candidate.receipt_id) || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    processor_id: input.dispatch.processor_id,
    load_id: input.dispatch.load_id,
    output_class: input.candidate.output_class,
    semantic_signature: normalized(input.candidate.semantic_signature) || null,
  };
}

function block(
  input: ProcessorResultReceiptInput,
  action: Exclude<ProcessorResultReceiptAction, "accept_processor_result_receipt" | "emit_exact_processor_blocker">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProcessorResultReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_output: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitProcessorResultReceipt(input: ProcessorResultReceiptInput): ProcessorResultReceiptVerdict {
  const receiptId = normalized(input.candidate.receipt_id);
  const signature = normalized(input.candidate.semantic_signature);
  const evidence = unique(input.candidate.evidence);
  const output = normalized(input.candidate.output);
  const candidateBlockers = unique(input.candidate.blockers);

  if (!receiptId) {
    return block(input, "block_missing_receipt_id", ["processor result receipt has no id"], "mint a live-head receipt id before settlement");
  }

  if (input.spent_receipt_ids.includes(receiptId)) {
    return block(input, "block_reused_receipt", [`processor result receipt already spent: ${receiptId}`], "create a new receipt for any new processor output");
  }

  if (input.candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`processor receipt branch ${input.candidate.branch} does not match ${input.active_branch}`],
      "discard cross-branch processor results before settlement",
      evidence,
    );
  }

  if (input.candidate.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [`processor receipt head ${input.candidate.head_sha} does not match live head ${input.live_head_sha}`],
      "discard stale processor results and rerun the load against the live PR head",
      evidence,
    );
  }

  if (input.candidate.processor_id !== input.dispatch.processor_id || input.candidate.load_id !== input.dispatch.load_id) {
    return block(
      input,
      "block_missing_dispatch_binding",
      [`processor receipt ${receiptId} is not bound to dispatch ${input.dispatch.processor_id}/${input.dispatch.load_id}`],
      "bind processor receipts to the exact dispatched processor/load pair",
      evidence,
    );
  }

  if (!input.candidate.completed) {
    return block(input, "block_incomplete_result", [`processor receipt ${receiptId} is incomplete`], "complete the processor load before settlement", evidence);
  }

  if (input.candidate.output_class !== input.dispatch.required_output) {
    return block(
      input,
      "block_missing_dispatch_binding",
      [`processor receipt output ${input.candidate.output_class} does not satisfy required output ${input.dispatch.required_output}`],
      "rerun the processor load with the required output class",
      evidence,
    );
  }

  if (!signature) {
    return block(input, "block_recycled_signature", ["processor result receipt has no semantic signature"], "attach a semantic signature before settlement", evidence);
  }

  if (input.spent_semantic_signatures.includes(signature)) {
    return block(input, "block_recycled_signature", [`processor result signature already spent: ${signature}`], "synthesize a materially new processor output before settlement", evidence);
  }

  if (candidateBlockers.length > 0 || input.candidate.output_class === "exact_blocker") {
    const blocker = output || candidateBlockers[0];
    if (!blocker) {
      return block(input, "block_missing_exact_blocker", ["processor exact-blocker receipt has no blocker text"], "name the exact processor blocker before settlement", evidence);
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_processor_blocker",
      accepted_output: blocker,
      decisive_evidence: evidence,
      blockers: unique([...candidateBlockers, blocker]),
      next_route: "settle the exact processor blocker before forcing a converged external act",
    };
  }

  if (!output) {
    return block(input, "block_incomplete_result", [`processor receipt ${receiptId} has no output`], "complete the processor output before settlement", evidence);
  }

  if (evidence.length === 0) {
    return block(input, "block_missing_evidence", [`processor receipt ${receiptId} has no evidence surface`], "attach file, branch, proof, or receipt evidence before settlement");
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_processor_result_receipt",
    accepted_output: output,
    decisive_evidence: evidence,
    blockers: [],
    next_route: "pass the admitted live-head processor receipt into processor-fabric settlement",
  };
}
