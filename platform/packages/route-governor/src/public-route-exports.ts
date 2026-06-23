export type PublicRouteExportAction = "accept_public_exports" | "repair_public_exports" | "block_public_exports";

export interface PublicRouteSurface {
  surface_id: string;
  package_subpath: string;
  index_export: string;
  source_path: string;
}

export interface PublicRouteExportInput {
  branch: string;
  active_branch: string;
  package_exports: string[];
  index_exports: string[];
  changed_files: string[];
  required_surfaces: PublicRouteSurface[];
  spent_surface_ids: string[];
}

export interface PublicRouteExportVerdict {
  ok: boolean;
  action: PublicRouteExportAction;
  branch: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function packageExportForSource(surface: PublicRouteSurface): string {
  return surface.package_subpath.startsWith("./") ? surface.package_subpath : `./${surface.package_subpath}`;
}

function proofSourceFor(surface: PublicRouteSurface): string {
  return surface.source_path.replace(/\.ts$/, "-proof.ts");
}

function surfaceEvidence(surface: PublicRouteSurface): string[] {
  return [surface.surface_id, packageExportForSource(surface), surface.index_export, surface.source_path];
}

function validateSurfaceShape(surface: PublicRouteSurface): string[] {
  const blockers: string[] = [];

  if (!surface.surface_id.trim()) blockers.push("public route surface has no id");
  if (!surface.package_subpath.trim()) blockers.push(`public route surface ${surface.surface_id || "<unknown>"} has no package subpath`);
  if (!surface.index_export.trim()) blockers.push(`public route surface ${surface.surface_id || "<unknown>"} has no index export`);
  if (!surface.source_path.trim()) blockers.push(`public route surface ${surface.surface_id || "<unknown>"} has no source path`);
  if (surface.source_path && !surface.source_path.startsWith("platform/packages/route-governor/src/")) {
    blockers.push(`public route surface ${surface.surface_id} is outside the route-governor source boundary`);
  }

  return blockers;
}

export function compilePublicRouteExports(input: PublicRouteExportInput): PublicRouteExportVerdict {
  const blockers: string[] = [];
  const decisive_evidence: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`public export branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  if (input.required_surfaces.length === 0) {
    blockers.push("no public route surfaces were required");
  }

  for (const surface of input.required_surfaces) {
    blockers.push(...validateSurfaceShape(surface));

    const packageSubpath = packageExportForSource(surface);
    const proofSource = proofSourceFor(surface);

    if (input.spent_surface_ids.includes(surface.surface_id)) {
      blockers.push(`public route surface is already spent: ${surface.surface_id}`);
    }

    if (!input.package_exports.includes(packageSubpath)) {
      blockers.push(`package export is missing: ${packageSubpath}`);
    }

    if (!input.index_exports.includes(surface.index_export)) {
      blockers.push(`index export is missing: ${surface.index_export}`);
    }

    if (!input.changed_files.includes(surface.source_path)) {
      blockers.push(`public route source was not changed: ${surface.source_path}`);
    }

    if (!input.changed_files.includes(proofSource)) {
      blockers.push(`public route proof was not changed: ${proofSource}`);
    }

    decisive_evidence.push(...surfaceEvidence(surface));
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      action: input.branch === input.active_branch ? "repair_public_exports" : "block_public_exports",
      branch: input.branch,
      decisive_evidence,
      blockers,
      next_route: "wire the public route source through package exports, index exports, and proof before claiming embodiment progress",
    };
  }

  return {
    ok: true,
    action: "accept_public_exports",
    branch: input.branch,
    decisive_evidence,
    blockers: [],
    next_route: "commit the public route export boundary, then require future public route surfaces to prove their exports before release",
  };
}

export {
  consumeDownstreamAuthority,
  type DownstreamAuthorityConsumptionAction,
  type DownstreamAuthorityConsumptionInput,
  type DownstreamAuthorityConsumptionVerdict,
  type DownstreamAuthorityKind,
  type DownstreamStatusAuthorityLease,
  type DownstreamStatusVerdict,
} from "./downstream-authority-consumption-lease.js";
