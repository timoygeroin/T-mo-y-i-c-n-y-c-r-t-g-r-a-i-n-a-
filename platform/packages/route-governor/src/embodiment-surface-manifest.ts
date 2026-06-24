export type EmbodimentSurfaceManifestAction =
  | "accept_embodiment_surface_manifest"
  | "block_reused_manifest"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_unmoved_result_head"
  | "block_missing_behavior_surface"
  | "block_hidden_behavior_surface"
  | "block_unproven_behavior_surface"
  | "block_missing_next_status_cursor";

export interface EmbodimentSurfaceEntry {
  path: string;
  export_name: string;
  proof_artifact: string;
}

export interface EmbodimentSurfaceManifestInput {
  manifest_id: string;
  spent_manifest_ids: string[];
  active_branch: string;
  branch: string;
  base_head_sha: string;
  live_head_sha: string;
  resulting_head_sha: string;
  next_status_expected_head?: string;
  behavior_surfaces: EmbodimentSurfaceEntry[];
  root_index_exports: string[];
  proof_artifacts: string[];
}

export interface EmbodimentSurfaceManifestVerdict {
  ok: boolean;
  action: EmbodimentSurfaceManifestAction;
  manifest_id: string | null;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  required_status_head_sha: string | null;
  admitted_surfaces: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableBehaviorPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    /\.(ts|js|mjs|json)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path) &&
    !path.endsWith("/index.ts") &&
    !path.endsWith("/package.json")
  );
}

function normalizeExport(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function expectedIndexExport(entry: EmbodimentSurfaceEntry): string {
  const modulePath = entry.path
    .replace(/^platform\/packages\/route-governor\/src\//, "./")
    .replace(/\.ts$/, ".js");
  return `export * from "${modulePath}";`;
}

function base(input: EmbodimentSurfaceManifestInput): Pick<
  EmbodimentSurfaceManifestVerdict,
  "manifest_id" | "branch" | "base_head_sha" | "resulting_head_sha" | "required_status_head_sha"
> {
  return {
    manifest_id: input.manifest_id.trim() || null,
    branch: input.branch,
    base_head_sha: input.base_head_sha,
    resulting_head_sha: input.resulting_head_sha,
    required_status_head_sha: input.next_status_expected_head ?? null,
  };
}

function block(
  input: EmbodimentSurfaceManifestInput,
  action: Exclude<EmbodimentSurfaceManifestAction, "accept_embodiment_surface_manifest">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): EmbodimentSurfaceManifestVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_surfaces: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function missingBehaviorSurfaces(input: EmbodimentSurfaceManifestInput): string[] {
  const blockers: string[] = [];
  for (const entry of input.behavior_surfaces) {
    if (!executableBehaviorPath(entry.path)) {
      blockers.push(`behavior surface is not behavior-bearing executable platform code: ${entry.path}`);
    }
    if (!entry.export_name.trim()) {
      blockers.push(`behavior surface has no export name: ${entry.path}`);
    }
  }
  return blockers;
}

export function compileEmbodimentSurfaceManifest(
  input: EmbodimentSurfaceManifestInput,
): EmbodimentSurfaceManifestVerdict {
  const manifestId = input.manifest_id.trim();
  const evidence = [`manifest ${manifestId || "<missing>"}`, `base ${input.base_head_sha}`, `result ${input.resulting_head_sha}`];

  if (!manifestId || input.spent_manifest_ids.includes(manifestId)) {
    return block(
      input,
      "block_reused_manifest",
      [manifestId ? `embodiment surface manifest already spent: ${manifestId}` : "embodiment surface manifest has no id"],
      "issue a fresh manifest id before admitting another embodiment surface",
      evidence,
    );
  }

  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`manifest branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the embodiment surface manifest to the active PR branch",
      evidence,
    );
  }

  if (input.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`manifest base ${input.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebuild the manifest from the live PR head before write admission",
      evidence,
    );
  }

  if (input.resulting_head_sha === input.base_head_sha) {
    return block(
      input,
      "block_unmoved_result_head",
      [`manifest result did not move from ${input.base_head_sha}`],
      "write the embodiment before accepting its public surface manifest",
      evidence,
    );
  }

  if (input.behavior_surfaces.length === 0) {
    return block(
      input,
      "block_missing_behavior_surface",
      ["embodiment surface manifest has no behavior surfaces"],
      "attach at least one behavior-bearing surface before release",
      evidence,
    );
  }

  const behaviorBlockers = missingBehaviorSurfaces(input);
  if (behaviorBlockers.length > 0) {
    return block(
      input,
      "block_missing_behavior_surface",
      behaviorBlockers,
      "replace proof-only or hidden entries with behavior-bearing platform surfaces",
      evidence,
    );
  }

  const indexExports = new Set(input.root_index_exports.map(normalizeExport));
  const hidden = input.behavior_surfaces
    .map((entry) => expectedIndexExport(entry))
    .filter((entryExport) => !indexExports.has(entryExport));
  if (hidden.length > 0) {
    return block(
      input,
      "block_hidden_behavior_surface",
      hidden.map((entryExport) => `missing root index export: ${entryExport}`),
      "wire every behavior surface through the public root export before counting the embodiment",
      evidence,
    );
  }

  const proofs = new Set(input.proof_artifacts);
  const unproven = input.behavior_surfaces.filter((entry) => !proofs.has(entry.proof_artifact));
  if (unproven.length > 0) {
    return block(
      input,
      "block_unproven_behavior_surface",
      unproven.map((entry) => `missing proof artifact ${entry.proof_artifact} for ${entry.path}`),
      "attach proof evidence for every admitted behavior surface",
      evidence,
    );
  }

  if (input.next_status_expected_head !== input.resulting_head_sha) {
    return block(
      input,
      "block_missing_next_status_cursor",
      ["embodiment surface manifest must bind next status to the resulting post-write head"],
      "set the next status cursor to the resulting head before any status, review, or merge route consumes it",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_embodiment_surface_manifest",
    admitted_surfaces: input.behavior_surfaces.map((entry) => entry.path),
    decisive_evidence: [
      ...evidence,
      `next status ${input.resulting_head_sha}`,
      ...input.behavior_surfaces.flatMap((entry) => [
        entry.path,
        entry.export_name,
        expectedIndexExport(entry),
        entry.proof_artifact,
      ]),
    ],
    blockers: [],
    next_route: "read status only for the resulting post-write head before review, merge, or another embodiment route consumes this surface",
  };
}
