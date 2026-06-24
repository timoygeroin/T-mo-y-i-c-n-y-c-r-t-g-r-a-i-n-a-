export type PostResolutionPublicRouteSurfaceKind =
  | "source_file"
  | "root_barrel_export"
  | "package_subpath_export"
  | "proof_surface";

export type PostResolutionPublicRouteBoundaryAction =
  | "admit_public_route_boundary"
  | "block_reused_route"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_missing_resolved_boundary"
  | "block_incomplete_route_candidate"
  | "block_missing_public_surface";

export interface PostResolutionPublicRouteSurface {
  surface_id: string;
  kind: PostResolutionPublicRouteSurfaceKind;
  branch: string;
  head_sha: string;
  path: string;
  exports: string[];
  evidence: string[];
}

export interface PostResolutionPublicRouteCandidate {
  route_id: string;
  base_head_sha: string;
  source_path: string;
  package_subpath: string;
  exported_symbols: string[];
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface PostResolutionPublicRouteBoundaryInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  resolved_boundary_ids: string[];
  spent_route_ids: string[];
  candidate: PostResolutionPublicRouteCandidate;
  surfaces: PostResolutionPublicRouteSurface[];
}

export interface PostResolutionPublicRouteBoundaryVerdict {
  ok: boolean;
  action: PostResolutionPublicRouteBoundaryAction;
  branch: string;
  head_sha: string;
  route_id: string | null;
  accepted_surface_ids: string[];
  blockers: string[];
  decisive_evidence: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: PostResolutionPublicRouteBoundaryInput): Pick<
  PostResolutionPublicRouteBoundaryVerdict,
  "branch" | "head_sha" | "route_id"
> {
  const routeId = input.candidate.route_id.trim();
  return { branch: input.active_branch, head_sha: input.live_head_sha, route_id: routeId || null };
}

function block(
  input: PostResolutionPublicRouteBoundaryInput,
  action: Exclude<PostResolutionPublicRouteBoundaryAction, "admit_public_route_boundary">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostResolutionPublicRouteBoundaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_surface_ids: [],
    blockers,
    decisive_evidence: evidence,
    next_route: nextRoute,
  };
}

function liveSurfaces(input: PostResolutionPublicRouteBoundaryInput): PostResolutionPublicRouteSurface[] {
  return input.surfaces.filter(
    (surface) => surface.branch === input.active_branch && surface.head_sha === input.live_head_sha,
  );
}

function matchingSurface(
  input: PostResolutionPublicRouteBoundaryInput,
  kind: PostResolutionPublicRouteSurfaceKind,
  predicate: (surface: PostResolutionPublicRouteSurface) => boolean,
): PostResolutionPublicRouteSurface | undefined {
  return liveSurfaces(input).find((surface) => surface.kind === kind && predicate(surface));
}

function missingCandidateEvidence(candidate: PostResolutionPublicRouteCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.route_id.trim()) blockers.push("public route candidate has no route id");
  if (!candidate.source_path.trim()) blockers.push("public route candidate has no source path");
  if (!candidate.package_subpath.trim()) blockers.push("public route candidate has no package subpath");
  if (candidate.exported_symbols.length === 0) blockers.push("public route candidate has no exported symbols");
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("public route candidate changes no behavior-bearing platform file");
  if (candidate.behavior_artifacts.length === 0) blockers.push("public route candidate has no behavior artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("public route candidate has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("public route candidate has no proof artifact");

  return blockers;
}

export function admitPostResolutionPublicRouteBoundary(
  input: PostResolutionPublicRouteBoundaryInput,
): PostResolutionPublicRouteBoundaryVerdict {
  const candidate = input.candidate;
  const routeId = candidate.route_id.trim();
  const routeEvidence = [`route ${routeId || "<missing>"}`, `live head ${input.live_head_sha}`];

  if (!routeId || input.spent_route_ids.includes(routeId)) {
    return block(
      input,
      "block_reused_route",
      [routeId ? `post-resolution public route already spent: ${routeId}` : "post-resolution public route has no id"],
      "choose a fresh public route id before admitting another route boundary",
      routeEvidence,
    );
  }

  if (input.resolved_boundary_ids.length === 0) {
    return block(
      input,
      "block_missing_resolved_boundary",
      ["post-resolution public route has no resolved boundary id"],
      "bind the public route to a resolved blocker boundary before counting it as post-resolution progress",
      routeEvidence,
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`public route candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the public route candidate to the live PR head before admission",
      routeEvidence,
    );
  }

  if (candidate.base_head_sha === input.repaired_head_sha && input.repaired_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`public route candidate is based on repaired historical head ${input.repaired_head_sha}`],
      "do not admit repaired-head history as the current post-resolution base",
      routeEvidence,
    );
  }

  const candidateBlockers = missingCandidateEvidence(candidate);
  if (candidateBlockers.length > 0) {
    return block(
      input,
      "block_incomplete_route_candidate",
      candidateBlockers,
      "complete behavior, routing, proof, and changed-file evidence before public route admission",
      routeEvidence,
    );
  }

  const source = matchingSurface(input, "source_file", (surface) => surface.path === candidate.source_path);
  const root = matchingSurface(input, "root_barrel_export", (surface) =>
    candidate.exported_symbols.every((symbol) => surface.exports.includes(symbol)),
  );
  const pkg = matchingSurface(input, "package_subpath_export", (surface) => surface.path === candidate.package_subpath);
  const proof = matchingSurface(input, "proof_surface", (surface) =>
    candidate.proof_artifacts.some((artifact) => surface.path === artifact),
  );

  const missingSurfaces = [
    ...(source ? [] : [`missing live source file surface ${candidate.source_path}`]),
    ...(root ? [] : [`missing live root barrel export for ${candidate.exported_symbols.join(", ")}`]),
    ...(pkg ? [] : [`missing live package subpath export ${candidate.package_subpath}`]),
    ...(proof ? [] : ["missing live proof surface for public route candidate"]),
  ];

  if (missingSurfaces.length > 0) {
    return block(
      input,
      "block_missing_public_surface",
      missingSurfaces,
      "publish the source, root barrel, package subpath, and proof surfaces on the live head before calling the route public",
      routeEvidence,
    );
  }

  const accepted = [source, root, pkg, proof].filter((surface): surface is PostResolutionPublicRouteSurface => Boolean(surface));

  return {
    ...base(input),
    ok: true,
    action: "admit_public_route_boundary",
    accepted_surface_ids: accepted.map((surface) => surface.surface_id),
    blockers: [],
    decisive_evidence: [
      ...routeEvidence,
      ...input.resolved_boundary_ids.map((id) => `resolved boundary ${id}`),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
      ...accepted.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
    ],
    next_route: "after this branch write, require status/readback on the moved head before any review, merge, or further embodiment route consumes it",
  };
}
