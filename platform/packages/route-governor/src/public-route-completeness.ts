export type PublicRouteCompletenessAction =
  | "accept_public_route_completeness"
  | "repair_public_route_completeness"
  | "block_public_route_completeness";

export interface PublicRouteCompletenessSurface {
  surface_id: string;
  package_subpath: string;
  index_export: string;
  proof_script: string;
}

export interface PublicRouteCompletenessInput {
  branch: string;
  active_branch: string;
  package_exports: string[];
  index_exports: string[];
  proof_command: string;
  required_surfaces: PublicRouteCompletenessSurface[];
}

export interface PublicRouteCompletenessVerdict {
  ok: boolean;
  action: PublicRouteCompletenessAction;
  branch: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalizedSubpath(subpath: string): string {
  return subpath.startsWith("./") ? subpath : `./${subpath}`;
}

function surfaceLabel(surface: PublicRouteCompletenessSurface): string {
  return `${surface.surface_id}:${normalizedSubpath(surface.package_subpath)}`;
}

function validateSurface(surface: PublicRouteCompletenessSurface): string[] {
  const blockers: string[] = [];
  const label = surface.surface_id || "<unknown>";

  if (!surface.surface_id.trim()) blockers.push("public route completeness surface has no id");
  if (!surface.package_subpath.trim()) blockers.push(`public route completeness surface ${label} has no package subpath`);
  if (!surface.index_export.trim()) blockers.push(`public route completeness surface ${label} has no index export`);
  if (!surface.proof_script.trim()) blockers.push(`public route completeness surface ${label} has no proof script`);

  return blockers;
}

export function compilePublicRouteCompleteness(
  input: PublicRouteCompletenessInput,
): PublicRouteCompletenessVerdict {
  const blockers: string[] = [];
  const decisive_evidence: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`public route completeness branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  if (input.required_surfaces.length === 0) {
    blockers.push("no public route completeness surfaces were required");
  }

  for (const surface of input.required_surfaces) {
    blockers.push(...validateSurface(surface));

    const packageSubpath = normalizedSubpath(surface.package_subpath);
    const label = surfaceLabel(surface);

    if (!input.package_exports.includes(packageSubpath)) {
      blockers.push(`package-public route surface is missing package export: ${label}`);
    }

    if (!input.index_exports.includes(surface.index_export)) {
      blockers.push(`package-public route surface is missing root index export: ${label} -> ${surface.index_export}`);
    }

    if (!input.proof_command.includes(surface.proof_script)) {
      blockers.push(`package-public route surface is missing proof command: ${label} -> ${surface.proof_script}`);
    }

    decisive_evidence.push(label, surface.index_export, surface.proof_script);
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      action: input.branch === input.active_branch ? "repair_public_route_completeness" : "block_public_route_completeness",
      branch: input.branch,
      decisive_evidence,
      blockers,
      next_route: "wire each package-public route surface through package exports, root index exports, and proof script visibility before release",
    };
  }

  return {
    ok: true,
    action: "accept_public_route_completeness",
    branch: input.branch,
    decisive_evidence,
    blockers: [],
    next_route: "package-public route surfaces are root-routable and proof-visible; continue only with a non-repeated embodiment or live-head status readback",
  };
}
