export type ExternalWriteSurface =
  | "github_contents_create_file"
  | "github_contents_update_file"
  | "local_git_push"
  | "connector_branch_ref_update"
  | "pr_metadata"
  | "commit_diff"
  | "local_memory"
  | "public_rest_status";

export type ExternalWriteAction =
  | "commit_via_external_write_surface"
  | "emit_exact_external_blocker"
  | "block_false_external_blocker";

export interface ExternalWriteSurfaceInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  available_surfaces: ExternalWriteSurface[];
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  attempted_blocker?: string;
  prohibited_blockers: string[];
}

export interface ExternalWriteSurfaceVerdict {
  ok: boolean;
  action: ExternalWriteAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const WRITE_SURFACES = new Set<ExternalWriteSurface>([
  "github_contents_create_file",
  "github_contents_update_file",
  "local_git_push",
  "connector_branch_ref_update",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function writeSurfaces(input: ExternalWriteSurfaceInput): ExternalWriteSurface[] {
  return input.available_surfaces.filter((surface) => WRITE_SURFACES.has(surface));
}

function hasExecutableIncrement(input: ExternalWriteSurfaceInput): boolean {
  return (
    input.changed_files.some(isExecutablePlatformPath) &&
    input.executable_artifacts.length > 0 &&
    input.routing_artifacts.length > 0
  );
}

function attemptedProhibitedBlocker(input: ExternalWriteSurfaceInput): string | null {
  const blocker = input.attempted_blocker?.trim();
  if (!blocker) return null;
  return input.prohibited_blockers.find((prohibited) => prohibited === blocker) ?? null;
}

export function routeExternalWriteSurface(input: ExternalWriteSurfaceInput): ExternalWriteSurfaceVerdict {
  const base = {
    branch: input.branch,
    head_sha: input.live_head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "emit_exact_external_blocker",
      decisive_evidence: [],
      blockers: [`external write branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the write surface to the active PR branch before committing",
    };
  }

  const prohibited = attemptedProhibitedBlocker(input);
  if (prohibited) {
    return {
      ...base,
      ok: false,
      action: "block_false_external_blocker",
      decisive_evidence: writeSurfaces(input),
      blockers: [`prohibited or spent blocker cannot be emitted while a write surface exists: ${prohibited}`],
      next_route: "discard the false blocker and commit through the available external write surface",
    };
  }

  const writable = writeSurfaces(input);
  if (writable.length === 0) {
    return {
      ...base,
      ok: false,
      action: "emit_exact_external_blocker",
      decisive_evidence: [],
      blockers: [input.attempted_blocker?.trim() || "no external branch write surface is available"],
      next_route: "restore a GitHub contents, branch-ref, or git-push write surface before embodiment",
    };
  }

  if (!hasExecutableIncrement(input)) {
    return {
      ...base,
      ok: false,
      action: "emit_exact_external_blocker",
      decisive_evidence: writable,
      blockers: ["external write surface exists, but no executable platform increment is supplied"],
      next_route: "supply executable platform files plus routing artifacts, then commit through the write surface",
    };
  }

  return {
    ...base,
    ok: true,
    action: "commit_via_external_write_surface",
    decisive_evidence: [
      ...writable.map((surface) => `write surface ${surface}`),
      ...input.changed_files.filter(isExecutablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    next_route: "commit the executable embodiment through the external write surface, then bind the next status readback to the moved PR head",
  };
}
