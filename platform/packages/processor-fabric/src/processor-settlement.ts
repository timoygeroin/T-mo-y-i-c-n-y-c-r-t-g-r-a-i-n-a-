export type ProcessorSettlementOutputClass =
  | "ledger_delta"
  | "route_attack"
  | "candidate_mechanism"
  | "omission_warning"
  | "proof_pressure"
  | "external_act"
  | "exact_blocker";

export type ProcessorSettlementAction =
  | "settle_converged_external_act"
  | "settle_exact_external_blocker"
  | "block_missing_scene"
  | "block_missing_convergence_rule"
  | "block_missing_dispatches"
  | "block_missing_processor_result"
  | "block_unresolved_processor_pressure"
  | "block_conflicting_external_acts"
  | "block_recycled_external_act"
  | "block_missing_external_evidence";

export interface ProcessorSettlementDispatch {
  processor_id: string;
  load_id: string;
  required_output: string;
}

export interface ProcessorSettlementResult {
  processor_id: string;
  load_id: string;
  completed: boolean;
  output_class: ProcessorSettlementOutputClass;
  output: string;
  evidence: string[];
  blockers: string[];
}

export interface ProcessorSettlementInput {
  scene_id: string;
  convergence_rule: string;
  dispatches: ProcessorSettlementDispatch[];
  results: ProcessorSettlementResult[];
  exhausted_external_acts: string[];
}

export interface ProcessorSettlementVerdict {
  ok: boolean;
  action: ProcessorSettlementAction;
  scene_id: string | null;
  accepted_output: string | null;
  decisive_processors: string[];
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

function dispatchKey(dispatch: Pick<ProcessorSettlementDispatch, "processor_id" | "load_id">): string {
  return `${normalized(dispatch.processor_id)}::${normalized(dispatch.load_id)}`;
}

function resultKey(result: Pick<ProcessorSettlementResult, "processor_id" | "load_id">): string {
  return `${normalized(result.processor_id)}::${normalized(result.load_id)}`;
}

function completedRequiredResults(input: ProcessorSettlementInput): ProcessorSettlementResult[] {
  const required = new Set(input.dispatches.map(dispatchKey));
  return input.results.filter((result) => required.has(resultKey(result)) && result.completed);
}

function base(input: ProcessorSettlementInput): Pick<ProcessorSettlementVerdict, "scene_id"> {
  const sceneId = normalized(input.scene_id);
  return { scene_id: sceneId || null };
}

function block(
  input: ProcessorSettlementInput,
  action: Exclude<
    ProcessorSettlementAction,
    "settle_converged_external_act" | "settle_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ProcessorSettlementVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_output: null,
    decisive_processors: [],
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function settleProcessorFabricOutputs(input: ProcessorSettlementInput): ProcessorSettlementVerdict {
  const sceneId = normalized(input.scene_id);
  const convergenceRule = normalized(input.convergence_rule);
  const dispatches = input.dispatches.filter(
    (dispatch) => normalized(dispatch.processor_id) && normalized(dispatch.load_id) && normalized(dispatch.required_output),
  );

  if (!sceneId) {
    return block(input, "block_missing_scene", ["processor settlement has no scene id"], "bind settlement to the active finalization scene");
  }

  if (!convergenceRule) {
    return block(
      input,
      "block_missing_convergence_rule",
      ["processor settlement has no convergence rule"],
      "settle only after naming the one-output convergence rule",
    );
  }

  if (dispatches.length === 0) {
    return block(input, "block_missing_dispatches", ["processor settlement has no dispatches"], "dispatch processors before settlement");
  }

  const requiredKeys = new Set(dispatches.map(dispatchKey));
  const completed = completedRequiredResults({ ...input, dispatches });
  const completedKeys = new Set(completed.map(resultKey));
  const missing = dispatches.filter((dispatch) => !completedKeys.has(dispatchKey(dispatch)));

  if (missing.length > 0) {
    return block(
      input,
      "block_missing_processor_result",
      missing.map((dispatch) => `missing result for ${dispatch.processor_id}/${dispatch.load_id}`),
      "collect every required processor result before terminal settlement",
    );
  }

  const externalActs = unique(completed.filter((result) => result.output_class === "external_act").map((result) => result.output));
  const exactBlockers = unique([
    ...completed.filter((result) => result.output_class === "exact_blocker").map((result) => result.output),
    ...completed.flatMap((result) => result.blockers),
  ]);
  const pressureEvidence = unique(completed.flatMap((result) => result.evidence));
  const decisiveProcessors = unique(completed.map((result) => result.processor_id));
  const unresolvedPressure = completed.filter(
    (result) =>
      (result.output_class === "route_attack" || result.output_class === "omission_warning") &&
      normalized(result.output) &&
      !["clear", "no contradiction", "no omission"].includes(normalized(result.output).toLowerCase()),
  );

  if (exactBlockers.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "settle_exact_external_blocker",
      accepted_output: exactBlockers[0],
      decisive_processors: decisiveProcessors,
      decisive_evidence: pressureEvidence,
      blockers: exactBlockers,
      next_route: "release the exact external blocker instead of forcing a processor-fabric embodiment",
    };
  }

  if (unresolvedPressure.length > 0) {
    return block(
      input,
      "block_unresolved_processor_pressure",
      unresolvedPressure.map((result) => `${result.processor_id}/${result.load_id}: ${result.output}`),
      "resolve processor attacks and omission warnings before external-act settlement",
      pressureEvidence,
    );
  }

  if (externalActs.length === 0) {
    return block(
      input,
      "block_unresolved_processor_pressure",
      ["processor settlement produced no external act and no exact blocker"],
      "rerun settlement with an act-bearing or blocker-bearing processor result",
      pressureEvidence,
    );
  }

  if (externalActs.length > 1) {
    return block(
      input,
      "block_conflicting_external_acts",
      externalActs.map((act) => `conflicting external act: ${act}`),
      "collapse competing processor acts before release",
      pressureEvidence,
    );
  }

  const accepted = externalActs[0];
  if (input.exhausted_external_acts.map(normalized).includes(accepted)) {
    return block(
      input,
      "block_recycled_external_act",
      [`external act already spent: ${accepted}`],
      "synthesize a materially new executable embodiment before settlement",
      pressureEvidence,
    );
  }

  if (pressureEvidence.length === 0) {
    return block(
      input,
      "block_missing_external_evidence",
      ["converged external act has no evidence surface"],
      "attach file, branch, proof, or receipt evidence before release",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "settle_converged_external_act",
    accepted_output: accepted,
    decisive_processors: decisiveProcessors,
    decisive_evidence: pressureEvidence,
    blockers: [],
    next_route: "release the settled external act, then bind any status claim to the moved PR head only",
  };
}
