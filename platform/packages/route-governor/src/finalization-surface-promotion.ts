export type FinalizationSurfaceBoundary = "review_handoff" | "merge_command" | "merge_result_receipt";

export type FinalizationSurfacePromotionAction =
  | "admit_finalization_surface_promotion"
  | "repair_finalization_surface_promotion"
  | "block_finalization_surface_promotion";

export interface FinalizationSurfacePromotionCandidate {
  surface_id: string;
  boundary: FinalizationSurfaceBoundary;
  package_subpath: string;
  index_export: string;
  source_path: string;
  proof_module: string;
  route_gain: string;
}

export interface FinalizationSurfacePromotionInput {
  branch: string;
  active_branch: string;
  changed_files: string[];
  package_exports: string[];
  index_exports: string[];
  proof_command: string;
  candidates: FinalizationSurfacePromotionCandidate[];
  spent_surface_ids: string[];
}

export interface FinalizationSurfacePromotionVerdict {
  ok: boolean;
  action: FinalizationSurfacePromotionAction;
  branch: string;
  promoted_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalizePackageSubpath(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("./") ? trimmed : `./${trimmed}`;
}

function normalizeProofModule(value: string): string {
  return value
    .trim()
    .replace(/^node\s+/, "")
    .replace(/^dist\//, "")
    .replace(/^src\//, "")
    .replace(/\.(ts|js)$/, "");
}

function proofSourcePath(candidate: FinalizationSurfacePromotionCandidate): string {
  return `platform/packages/route-governor/src/${normalizeProofModule(candidate.proof_module)}.ts`;
}

function proofCommandModules(command: string): string[] {
  return [
    ...new Set(
      command
        .split(/&&|;/)
        .map((part) => part.trim())
        .filter((part) => part.startsWith("node "))
        .map(normalizeProofModule),
    ),
  ];
}

function validateCandidateShape(candidate: FinalizationSurfacePromotionCandidate): string[] {
  const blockers: string[] = [];
  const surfaceId = candidate.surface_id || "<unknown>";

  if (!candidate.surface_id.trim()) blockers.push("finalization surface has no surface id");
  if (!candidate.package_subpath.trim()) blockers.push(`finalization surface ${surfaceId} has no package subpath`);
  if (!candidate.index_export.trim()) blockers.push(`finalization surface ${surfaceId} has no index export`);
  if (!candidate.source_path.trim()) blockers.push(`finalization surface ${surfaceId} has no source path`);
  if (!candidate.proof_module.trim()) blockers.push(`finalization surface ${surfaceId} has no proof module`);
  if (!candidate.route_gain.trim()) blockers.push(`finalization surface ${surfaceId} has no route gain`);
  if (candidate.source_path && !candidate.source_path.startsWith("platform/packages/route-governor/src/")) {
    blockers.push(`finalization surface ${surfaceId} is outside the route-governor source boundary`);
  }

  return blockers;
}

export function compileFinalizationSurfacePromotion(
  input: FinalizationSurfacePromotionInput,
): FinalizationSurfacePromotionVerdict {
  const blockers: string[] = [];
  const decisiveEvidence: string[] = [];
  const proofModules = proofCommandModules(input.proof_command);

  if (input.branch !== input.active_branch) {
    blockers.push(`finalization surface promotion branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  if (input.candidates.length === 0) {
    blockers.push("no finalization surfaces were supplied for promotion");
  }

  if (!input.changed_files.includes("platform/packages/route-governor/package.json")) {
    blockers.push("finalization surface promotion did not change the route-governor package manifest");
  }

  for (const candidate of input.candidates) {
    blockers.push(...validateCandidateShape(candidate));

    const packageSubpath = normalizePackageSubpath(candidate.package_subpath);
    const proofModule = normalizeProofModule(candidate.proof_module);
    const proofPath = proofSourcePath(candidate);

    if (input.spent_surface_ids.includes(candidate.surface_id)) {
      blockers.push(`finalization surface was already promoted: ${candidate.surface_id}`);
    }

    if (!input.package_exports.includes(packageSubpath)) {
      blockers.push(`finalization surface is missing package export: ${candidate.surface_id}:${packageSubpath}`);
    }

    if (!input.index_exports.includes(candidate.index_export)) {
      blockers.push(`finalization surface is missing root index export: ${candidate.surface_id}:${candidate.index_export}`);
    }

    if (!proofModules.includes(proofModule)) {
      blockers.push(`finalization surface proof is not executed by proof script: ${candidate.surface_id}:${proofModule}`);
    }

    if (!input.changed_files.includes(proofPath)) {
      blockers.push(`finalization surface proof source was not changed: ${proofPath}`);
    }

    decisiveEvidence.push(
      candidate.surface_id,
      candidate.boundary,
      packageSubpath,
      candidate.index_export,
      candidate.source_path,
      proofModule,
      candidate.route_gain,
    );
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      action: input.branch === input.active_branch ? "repair_finalization_surface_promotion" : "block_finalization_surface_promotion",
      branch: input.branch,
      promoted_surface_ids: [],
      decisive_evidence: decisiveEvidence,
      blockers,
      next_route: "wire finalization surfaces through package exports, root exports, and proof execution before treating them as public route surfaces",
    };
  }

  return {
    ok: true,
    action: "admit_finalization_surface_promotion",
    branch: input.branch,
    promoted_surface_ids: input.candidates.map((candidate) => candidate.surface_id),
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route: "public finalization surfaces may now be used by downstream review or merge routing; the next progress claim must use a moved head or a different unspent surface",
  };
}
