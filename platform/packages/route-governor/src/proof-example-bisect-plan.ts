export type ProofExampleBisectAction =
  | "emit_bisect_plan"
  | "repair_from_exact_proof_module"
  | "block_branch_mismatch"
  | "block_stale_failure_surface"
  | "block_non_failing_surface"
  | "block_missing_proof_command"
  | "block_no_probe_modules";

export interface ProofExampleFailureSurface {
  surface_id: string;
  branch: string;
  head_sha: string;
  check_name: string;
  failed_step: string;
  exit_code?: number;
  log_excerpt?: string;
  exact_proof_module?: string;
}

export interface ProofExampleProbeModule {
  module_id: string;
  dist_path: string;
  source_path: string;
}

export interface ProofExampleBisectInput {
  active_branch: string;
  live_head_sha: string;
  proof_script_command: string;
  status_verdict: "failing" | "pending" | "passing" | "passing_with_warnings" | "unknown";
  failure_surface: ProofExampleFailureSurface;
  probe_modules: ProofExampleProbeModule[];
  spent_probe_modules: string[];
}

export interface ProofExampleBisectCommand {
  module_id: string;
  command: string;
  source_path: string;
}

export interface ProofExampleBisectVerdict {
  ok: boolean;
  action: ProofExampleBisectAction;
  branch: string;
  head_sha: string;
  failing_surface_id: string;
  decisive_evidence: string[];
  commands: ProofExampleBisectCommand[];
  blockers: string[];
  next_route: string;
}

function base(input: ProofExampleBisectInput): Pick<
  ProofExampleBisectVerdict,
  "branch" | "head_sha" | "failing_surface_id"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    failing_surface_id: input.failure_surface.surface_id,
  };
}

function block(
  input: ProofExampleBisectInput,
  action: Exclude<ProofExampleBisectAction, "emit_bisect_plan" | "repair_from_exact_proof_module">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProofExampleBisectVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    commands: [],
    blockers,
    next_route: nextRoute,
  };
}

function proofCommandIncludes(input: ProofExampleBisectInput, distPath: string): boolean {
  return input.proof_script_command.split("&&").some((segment) => segment.trim() === `node ${distPath}`);
}

function unspentProbeModules(input: ProofExampleBisectInput): ProofExampleProbeModule[] {
  return input.probe_modules.filter(
    (module) => !input.spent_probe_modules.includes(module.module_id) && proofCommandIncludes(input, module.dist_path),
  );
}

function compactSurface(surface: ProofExampleFailureSurface): string {
  return [
    surface.surface_id,
    surface.check_name,
    `step=${surface.failed_step}`,
    typeof surface.exit_code === "number" ? `exit=${surface.exit_code}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join("; ");
}

function commandFor(module: ProofExampleProbeModule): ProofExampleBisectCommand {
  return {
    module_id: module.module_id,
    command: `node ${module.dist_path}`,
    source_path: module.source_path,
  };
}

export function compileProofExampleBisectPlan(input: ProofExampleBisectInput): ProofExampleBisectVerdict {
  const surface = input.failure_surface;

  if (surface.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`failure surface branch ${surface.branch} does not match active branch ${input.active_branch}`],
      "bind the proof-example failure surface to the active branch before probing",
    );
  }

  if (surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_failure_surface",
      [`failure surface belongs to ${surface.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale proof-example failure evidence before selecting probe commands",
      [compactSurface(surface)],
    );
  }

  if (input.status_verdict !== "failing") {
    return block(
      input,
      "block_non_failing_surface",
      [`status verdict is ${input.status_verdict}`],
      "do not bisect proof examples unless the live head has a failing proof surface",
      [compactSurface(surface)],
    );
  }

  if (!input.proof_script_command.trim()) {
    return block(
      input,
      "block_missing_proof_command",
      ["proof:examples command is empty"],
      "read the route-governor proof:examples script before constructing probe commands",
    );
  }

  if (surface.exact_proof_module?.trim()) {
    return {
      ...base(input),
      ok: true,
      action: "repair_from_exact_proof_module",
      decisive_evidence: [compactSurface(surface), `exact proof module ${surface.exact_proof_module}`],
      commands: [],
      blockers: [],
      next_route: "repair only the source path owned by the exact failing proof module, then require moved-head status readback",
    };
  }

  const modules = unspentProbeModules(input);
  if (modules.length === 0) {
    return block(
      input,
      "block_no_probe_modules",
      ["no unspent proof modules remain in the proof:examples command"],
      "obtain the exact failing assertion or add a new probe module before attempting repair",
      [compactSurface(surface)],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "emit_bisect_plan",
    decisive_evidence: [compactSurface(surface), ...modules.map((module) => module.module_id)],
    commands: modules.map(commandFor),
    blockers: [],
    next_route:
      "run isolated proof-module commands until the exact failing proof module is known; do not edit code from a generic proof-examples failure",
  };
}
