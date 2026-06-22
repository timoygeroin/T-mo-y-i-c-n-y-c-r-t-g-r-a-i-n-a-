export type ProcessorQuorumOutputClass = "external_act" | "exact_blocker" | "route_attack" | "omission_warning";

export type ProcessorQuorumAction =
  | "emit_converged_external_act"
  | "emit_exact_blocker"
  | "block_missing_dispatches"
  | "block_missing_processor_result"
  | "block_conflicting_external_acts"
  | "block_unresolved_blockers";

export interface ProcessorQuorumDispatch {
  processor_id: string;
  load_id: string;
}

export interface ProcessorQuorumResult {
  processor_id: string;
  load_id: string;
  completed: boolean;
  output_class: ProcessorQuorumOutputClass;
  output: string;
  blockers: string[];
}

export interface ProcessorQuorumInput {
  scene_id: string;
  dispatches: ProcessorQuorumDispatch[];
  results: ProcessorQuorumResult[];
}

export interface ProcessorQuorumVerdict {
  ok: boolean;
  action: ProcessorQuorumAction;
  scene_id: string | null;
  accepted_output: string | null;
  decisive_processors: string[];
  blockers: string[];
  next_route: string;
}

function normalized(value: string): string {
  return value.trim();
}

function dispatchKey(dispatch: ProcessorQuorumDispatch): string {
  return `${normalized(dispatch.processor_id)}::${normalized(dispatch.load_id)}`;
}

function resultKey(result: ProcessorQuorumResult): string {
  return `${normalized(result.processor_id)}::${normalized(result.load_id)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function base(input: ProcessorQuorumInput): Pick<ProcessorQuorumVerdict, "scene_id"> {
  const sceneId = normalized(input.scene_id);
  return { scene_id: sceneId || null };
}

function block(input: ProcessorQuorumInput, action: Exclude<ProcessorQuorumAction, "emit_converged_external_act" | "emit_exact_blocker">, blockers: string[], nextRoute: string): ProcessorQuorumVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_output: null,
    decisive_processors: [],
    blockers,
    next_route: nextRoute,
  };
}

export function compileProcessorQuorum(input: ProcessorQuorumInput): ProcessorQuorumVerdict {
  const dispatches = input.dispatches.filter((dispatch) => normalized(dispatch.processor_id) && normalized(dispatch.load_id));
  if (dispatches.length === 0) {
    return block(input, "block_missing_dispatches", ["processor quorum has no dispatches"], "dispatch bounded processors before quorum convergence");
  }

  const requiredKeys = new Set(dispatches.map(dispatchKey));
  const completedResults = input.results.filter((result) => requiredKeys.has(resultKey(result)) && result.completed);
  const completedKeys = new Set(completedResults.map(resultKey));
  const missing = dispatches.filter((dispatch) => !completedKeys.has(dispatchKey(dispatch)));

  if (missing.length > 0) {
    return block(
      input,
      "block_missing_processor_result",
      missing.map((dispatch) => `missing result for ${dispatch.processor_id}/${dispatch.load_id}`),
      "collect every required processor result before convergence",
    );
  }

  const resultBlockers = unique(completedResults.flatMap((result) => result.blockers));
  const blockerOutputs = unique(completedResults.filter((result) => result.output_class === "exact_blocker").map((result) => result.output));
  const externalActs = unique(completedResults.filter((result) => result.output_class === "external_act").map((result) => result.output));

  if (resultBlockers.length > 0 || blockerOutputs.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "emit_exact_blocker",
      accepted_output: blockerOutputs[0] ?? resultBlockers[0],
      decisive_processors: completedResults.map((result) => result.processor_id),
      blockers: [...resultBlockers, ...blockerOutputs],
      next_route: "release the exact blocker instead of forcing an embodiment convergence",
    };
  }

  if (externalActs.length === 0) {
    return block(
      input,
      "block_unresolved_blockers",
      ["processor quorum produced no external act and no exact blocker"],
      "rerun processor convergence with an external-act or blocker-producing load",
    );
  }

  if (externalActs.length > 1) {
    return block(
      input,
      "block_conflicting_external_acts",
      externalActs.map((act) => `conflicting external act: ${act}`),
      "collapse competing external acts before release",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "emit_converged_external_act",
    accepted_output: externalActs[0],
    decisive_processors: completedResults.map((result) => result.processor_id),
    blockers: [],
    next_route: "release the single converged external act and bind any follow-up status claim to the moved head",
  };
}
