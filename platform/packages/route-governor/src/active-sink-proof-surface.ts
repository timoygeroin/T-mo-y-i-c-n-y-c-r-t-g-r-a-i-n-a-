export type ActiveSinkProofSurfaceAction =
  | "attach_proof_surface"
  | "proof_surface_ready"
  | "block_missing_source"
  | "block_missing_test"
  | "block_repeated_plan"
  | "block_stale_head";

export interface ActiveSinkProofModule {
  module_id: string;
  source_path: string;
  test_path: string;
  proof_path?: string;
  proof_script_entry?: string;
  executable_artifact: string;
  routing_artifact: string;
}

export interface ActiveSinkProofSurfaceInput {
  live_head_sha: string;
  candidate_base_head_sha: string;
  branch: string;
  spent_plan_ids: string[];
  module: ActiveSinkProofModule;
}

export interface ActiveSinkProofSurfaceMutation {
  plan_id: string;
  path: string;
  proof_script_entry: string;
  executable_artifact: string;
  routing_artifact: string;
}

export interface ActiveSinkProofSurfaceVerdict {
  ok: boolean;
  action: ActiveSinkProofSurfaceAction;
  head_sha: string;
  branch: string;
  decisive_evidence: string[];
  mutation: ActiveSinkProofSurfaceMutation | null;
  blockers: string[];
  next_route: string;
}

function proofPathFor(moduleId: string): string {
  return `platform/packages/route-governor/src/${moduleId}-proof.ts`;
}

function proofScriptEntryFor(moduleId: string): string {
  return `node dist/${moduleId}-proof.js`;
}

function planIdFor(moduleId: string): string {
  return `${moduleId}-proof-surface`;
}

function base(input: ActiveSinkProofSurfaceInput): Pick<ActiveSinkProofSurfaceVerdict, "head_sha" | "branch"> {
  return {
    head_sha: input.live_head_sha,
    branch: input.branch,
  };
}

function block(
  input: ActiveSinkProofSurfaceInput,
  action: Exclude<ActiveSinkProofSurfaceAction, "attach_proof_surface" | "proof_surface_ready">,
  blockers: string[],
  nextRoute: string,
): ActiveSinkProofSurfaceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    mutation: null,
    blockers,
    next_route: nextRoute,
  };
}

export function compileActiveSinkProofSurface(input: ActiveSinkProofSurfaceInput): ActiveSinkProofSurfaceVerdict {
  const { module } = input;
  const plan_id = planIdFor(module.module_id);

  if (input.candidate_base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`proof surface candidate base ${input.candidate_base_head_sha} is not live head ${input.live_head_sha}`],
      "refresh the proof-surface candidate against the live PR head before attaching proof coverage",
    );
  }

  if (input.spent_plan_ids.includes(plan_id)) {
    return block(
      input,
      "block_repeated_plan",
      [`active sink proof-surface plan already spent: ${plan_id}`],
      "choose a new proof-surface plan before moving the active sink again",
    );
  }

  if (!module.source_path.trim()) {
    return block(
      input,
      "block_missing_source",
      [`active sink module ${module.module_id} has no source path`],
      "create the executable source before attaching a proof surface",
    );
  }

  if (!module.test_path.trim()) {
    return block(
      input,
      "block_missing_test",
      [`active sink module ${module.module_id} has no test path`],
      "create a test path before attaching a proof surface",
    );
  }

  const proof_path = module.proof_path?.trim();
  const proof_script_entry = module.proof_script_entry?.trim();

  if (proof_path && proof_script_entry) {
    return {
      ...base(input),
      ok: true,
      action: "proof_surface_ready",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        module.source_path,
        module.test_path,
        proof_path,
        proof_script_entry,
        module.executable_artifact,
        module.routing_artifact,
      ],
      mutation: null,
      blockers: [],
      next_route: "use the registered proof surface before allowing another active-sink embodiment increment",
    };
  }

  const mutation = {
    plan_id,
    path: proofPathFor(module.module_id),
    proof_script_entry: proofScriptEntryFor(module.module_id),
    executable_artifact: module.executable_artifact,
    routing_artifact: module.routing_artifact,
  };

  return {
    ...base(input),
    ok: true,
    action: "attach_proof_surface",
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      module.source_path,
      module.test_path,
      `missing proof path -> ${mutation.path}`,
      `missing proof script entry -> ${mutation.proof_script_entry}`,
      module.executable_artifact,
      module.routing_artifact,
    ],
    mutation,
    blockers: [],
    next_route: "attach the proof file and proof:examples script entry before counting the source/test pair as a completed active-sink increment",
  };
}
