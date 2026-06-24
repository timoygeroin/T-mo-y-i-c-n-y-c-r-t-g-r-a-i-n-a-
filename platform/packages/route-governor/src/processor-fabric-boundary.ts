export type ProcessorFabricBoundaryAction =
  | "admit_processor_fabric_boundary"
  | "block_missing_package_boundary"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_spent_boundary"
  | "block_incomplete_boundary";

export interface ProcessorFabricBoundaryCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  package_boundary: "platform/packages/processor-fabric";
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface ProcessorFabricBoundaryInput {
  active_branch: string;
  live_head_sha: string;
  spent_candidate_ids: string[];
  existing_package_boundaries: string[];
  candidate: ProcessorFabricBoundaryCandidate;
}

export interface ProcessorFabricBoundaryVerdict {
  ok: boolean;
  action: ProcessorFabricBoundaryAction;
  candidate_id: string | null;
  branch: string;
  head_sha: string;
  admitted_package_boundary: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ProcessorFabricBoundaryInput): Pick<
  ProcessorFabricBoundaryVerdict,
  "candidate_id" | "branch" | "head_sha"
> {
  return {
    candidate_id: input.candidate.candidate_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ProcessorFabricBoundaryInput,
  action: Exclude<ProcessorFabricBoundaryAction, "admit_processor_fabric_boundary">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProcessorFabricBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_package_boundary: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function boundaryBlockers(input: ProcessorFabricBoundaryInput): string[] {
  const candidate = input.candidate;
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("processor fabric boundary candidate has no id");
  if (input.spent_candidate_ids.includes(candidate.candidate_id)) {
    blockers.push(`processor fabric boundary candidate already spent: ${candidate.candidate_id}`);
  }
  if (input.existing_package_boundaries.includes(candidate.package_boundary)) {
    blockers.push(`processor fabric package boundary already exists: ${candidate.package_boundary}`);
  }
  if (!candidate.changed_files.some((file) => file.startsWith(`${candidate.package_boundary}/`))) {
    blockers.push("candidate does not create files inside the processor fabric package boundary");
  }
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("candidate changes no behavior-bearing processor fabric file");
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate exposes no processor fabric executable artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate exposes no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate exposes no proof artifact");

  return blockers;
}

export function admitProcessorFabricBoundary(input: ProcessorFabricBoundaryInput): ProcessorFabricBoundaryVerdict {
  const candidate = input.candidate;
  const evidence = [`live head ${input.live_head_sha}`, candidate.package_boundary, ...candidate.changed_files];

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} is not active branch ${input.active_branch}`],
      "bind the processor fabric boundary candidate to the active PR branch",
      evidence,
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the processor fabric boundary candidate to the live PR head before writing",
      evidence,
    );
  }

  const blockers = boundaryBlockers(input);
  if (blockers.some((item) => item.includes("already spent"))) {
    return block(input, "block_spent_boundary", blockers, "select an unspent processor fabric boundary candidate", evidence);
  }

  if (blockers.some((item) => item.includes("already exists"))) {
    return block(
      input,
      "block_missing_package_boundary",
      blockers,
      "extend an existing processor fabric package through a different admission route",
      evidence,
    );
  }

  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_boundary",
      blockers,
      "supply package, behavior, routing, and proof evidence before admitting the boundary",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_processor_fabric_boundary",
    admitted_package_boundary: candidate.package_boundary,
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      candidate.package_boundary,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the processor fabric boundary, then require status/readback for the moved resulting head before claiming status authority",
  };
}
