export type ProcessorWorkloadFrontierSourceTier =
  | "direct_current_instruction"
  | "direct_archive"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type ProcessorWorkloadFrontierLoadClass =
  | "corpus_reentry"
  | "archive_ingress"
  | "source_truth_grading"
  | "attempt_space_attack"
  | "embodiment_candidate"
  | "external_act_forcing"
  | "exact_external_blocker"
  | "fresh_status_readback"
  | "metadata_reread"
  | "duplicate_comment"
  | "local_memory_guard"
  | "warning_maintenance";

export type ProcessorWorkloadFrontierOutput =
  | "ledger_delta"
  | "route_attack"
  | "candidate_mechanism"
  | "omission_warning"
  | "proof_pressure"
  | "external_act"
  | "exact_blocker";

export type ProcessorWorkloadFrontierAction =
  | "select_processor_workload_frontier"
  | "settle_frontier_exact_blocker"
  | "block_no_selectable_workload"
  | "block_missing_frontier_id"
  | "block_reused_frontier"
  | "block_unbounded_budget";

export interface ProcessorWorkloadCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  load_class: ProcessorWorkloadFrontierLoadClass;
  source_tier: ProcessorWorkloadFrontierSourceTier;
  required_output: ProcessorWorkloadFrontierOutput;
  estimated_processors: number;
  semantic_signature: string;
  evidence: string[];
  blocker?: string;
}

export interface ProcessorWorkloadFrontierInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  repaired_head_sha: string;
  frontier_id: string;
  spent_frontier_ids: string[];
  spent_semantic_signatures: string[];
  max_processors: number;
  required_load_classes: ProcessorWorkloadFrontierLoadClass[];
  candidates: ProcessorWorkloadCandidate[];
}

export interface RejectedProcessorWorkloadCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface ProcessorWorkloadFrontierVerdict {
  ok: boolean;
  action: ProcessorWorkloadFrontierAction;
  frontier_id: string | null;
  branch: string;
  head_sha: string;
  selected_candidate_ids: string[];
  total_processors: number;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  rejected: RejectedProcessorWorkloadCandidate[];
  blockers: string[];
  next_route: string;
}

const SOURCE_WEIGHT: Record<ProcessorWorkloadFrontierSourceTier, number> = {
  direct_current_instruction: 5,
  direct_archive: 4,
  archive_derived: 3,
  memory: 2,
  model_summary: 1,
};

const LOAD_PRIORITY: ProcessorWorkloadFrontierLoadClass[] = [
  "corpus_reentry",
  "archive_ingress",
  "source_truth_grading",
  "attempt_space_attack",
  "embodiment_candidate",
  "external_act_forcing",
];

const NON_PROGRESS_LOADS = new Set<ProcessorWorkloadFrontierLoadClass>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_comment",
  "local_memory_guard",
  "warning_maintenance",
]);

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function uniqueLoadClasses(values: ProcessorWorkloadFrontierLoadClass[]): ProcessorWorkloadFrontierLoadClass[] {
  return [...new Set(values)];
}

function base(input: ProcessorWorkloadFrontierInput): Pick<
  ProcessorWorkloadFrontierVerdict,
  "frontier_id" | "branch" | "head_sha" | "quarantined_head_shas"
> {
  const quarantined = unique([input.prompt_head_sha, input.repaired_head_sha].filter((head) => head !== input.live_head_sha));
  const frontierId = normalized(input.frontier_id);

  return {
    frontier_id: frontierId || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_head_shas: quarantined,
  };
}

function block(
  input: ProcessorWorkloadFrontierInput,
  action: Exclude<
    ProcessorWorkloadFrontierAction,
    "select_processor_workload_frontier" | "settle_frontier_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  rejected: RejectedProcessorWorkloadCandidate[] = [],
  evidence: string[] = [],
): ProcessorWorkloadFrontierVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    selected_candidate_ids: [],
    total_processors: 0,
    decisive_evidence: unique(evidence),
    rejected,
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

function candidateRejections(
  input: ProcessorWorkloadFrontierInput,
  candidate: ProcessorWorkloadCandidate,
): string[] {
  const reasons: string[] = [];
  const candidateId = normalized(candidate.candidate_id);
  const signature = normalized(candidate.semantic_signature);

  if (!candidateId) reasons.push("processor workload candidate has no id");
  if (input.spent_frontier_ids.includes(candidateId)) reasons.push(`processor workload candidate already spent as frontier id: ${candidateId}`);
  if (input.spent_semantic_signatures.includes(signature)) reasons.push(`processor workload signature already spent: ${signature}`);
  if (candidate.branch !== input.active_branch) reasons.push(`candidate branch ${candidate.branch} is not ${input.active_branch}`);
  if (candidate.base_head_sha !== input.live_head_sha) reasons.push(`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  if (NON_PROGRESS_LOADS.has(candidate.load_class)) reasons.push(`candidate repeats non-progress load class: ${candidate.load_class}`);
  if (!Number.isInteger(candidate.estimated_processors) || candidate.estimated_processors < 1) {
    reasons.push("candidate has no positive processor estimate");
  }
  if (candidate.estimated_processors > input.max_processors) {
    reasons.push(`candidate estimate ${candidate.estimated_processors} exceeds processor budget ${input.max_processors}`);
  }
  if (unique(candidate.evidence).length === 0) reasons.push("candidate has no evidence");
  if (!signature) reasons.push("candidate has no semantic signature");
  if (candidate.source_tier === "model_summary") reasons.push("candidate is model-summary sourced without stronger support");
  if (candidate.load_class === "exact_external_blocker" && !normalized(candidate.blocker ?? "")) {
    reasons.push("exact-blocker workload has no blocker text");
  }

  return reasons;
}

function loadPriority(loadClass: ProcessorWorkloadFrontierLoadClass): number {
  const index = LOAD_PRIORITY.indexOf(loadClass);
  return index === -1 ? LOAD_PRIORITY.length : index;
}

function selectableWorkloads(
  input: ProcessorWorkloadFrontierInput,
): { selected: ProcessorWorkloadCandidate[]; rejected: RejectedProcessorWorkloadCandidate[] } {
  const rejected: RejectedProcessorWorkloadCandidate[] = [];
  const selectable: ProcessorWorkloadCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = candidateRejections(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons });
      continue;
    }
    selectable.push(candidate);
  }

  selectable.sort((left, right) => {
    if (left.load_class !== right.load_class) return loadPriority(left.load_class) - loadPriority(right.load_class);
    if (SOURCE_WEIGHT[left.source_tier] !== SOURCE_WEIGHT[right.source_tier]) {
      return SOURCE_WEIGHT[right.source_tier] - SOURCE_WEIGHT[left.source_tier];
    }
    return left.estimated_processors - right.estimated_processors;
  });

  const selected: ProcessorWorkloadCandidate[] = [];
  let budget = input.max_processors;

  for (const required of uniqueLoadClasses(input.required_load_classes)) {
    const candidate = selectable.find(
      (item) => item.load_class === required && !selected.includes(item) && item.estimated_processors <= budget,
    );
    if (!candidate) continue;
    selected.push(candidate);
    budget -= candidate.estimated_processors;
  }

  for (const candidate of selectable) {
    if (selected.includes(candidate)) continue;
    if (candidate.load_class === "exact_external_blocker") continue;
    if (candidate.estimated_processors > budget) continue;
    selected.push(candidate);
    budget -= candidate.estimated_processors;
  }

  return { selected, rejected };
}

export function compileProcessorWorkloadFrontier(
  input: ProcessorWorkloadFrontierInput,
): ProcessorWorkloadFrontierVerdict {
  const frontierId = normalized(input.frontier_id);

  if (!frontierId) {
    return block(input, "block_missing_frontier_id", ["processor workload frontier has no id"], "mint a frontier id before selecting processor workload");
  }

  if (input.spent_frontier_ids.includes(frontierId)) {
    return block(input, "block_reused_frontier", [`processor workload frontier already spent: ${frontierId}`], "create a fresh frontier id for the live head");
  }

  if (!Number.isInteger(input.max_processors) || input.max_processors < 1) {
    return block(input, "block_unbounded_budget", ["processor workload frontier has no positive processor budget"], "set a bounded positive processor budget before dispatch");
  }

  const { selected, rejected } = selectableWorkloads(input);
  const selectedLoadClasses = new Set(selected.map((candidate) => candidate.load_class));
  const missingRequired = uniqueLoadClasses(input.required_load_classes).filter((loadClass) => !selectedLoadClasses.has(loadClass));
  const blockerCandidate = input.candidates.find(
    (candidate) => candidate.load_class === "exact_external_blocker" && candidateRejections(input, candidate).length === 0,
  );

  if (selected.length === 0 || missingRequired.length > 0) {
    if (blockerCandidate) {
      const blocker = normalized(blockerCandidate.blocker ?? "");
      return {
        ...base(input),
        ok: true,
        action: "settle_frontier_exact_blocker",
        selected_candidate_ids: [blockerCandidate.candidate_id],
        total_processors: blockerCandidate.estimated_processors,
        decisive_evidence: unique([frontierId, blockerCandidate.candidate_id, ...blockerCandidate.evidence, blocker]),
        rejected,
        blockers: [blocker],
        next_route: "release the exact processor workload blocker before dispatch",
      };
    }

    return block(
      input,
      "block_no_selectable_workload",
      [
        selected.length === 0 ? "no processor workload candidate survived live-head selection" : "missing required processor workload classes",
        ...missingRequired.map((loadClass) => `missing required workload: ${loadClass}`),
      ],
      "supply live-head, evidence-bearing processor workload candidates for every required class",
      rejected,
      input.candidates.flatMap((candidate) => candidate.evidence),
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "select_processor_workload_frontier",
    selected_candidate_ids: selected.map((candidate) => candidate.candidate_id),
    total_processors: selected.reduce((sum, candidate) => sum + candidate.estimated_processors, 0),
    decisive_evidence: unique([
      frontierId,
      `live head ${input.live_head_sha}`,
      ...selected.flatMap((candidate) => [
        candidate.candidate_id,
        candidate.load_class,
        candidate.required_output,
        candidate.semantic_signature,
        ...candidate.evidence,
      ]),
    ]),
    rejected,
    blockers: [],
    next_route: "dispatch only the selected live-head workload, then converge to one external act or exact blocker",
  };
}
