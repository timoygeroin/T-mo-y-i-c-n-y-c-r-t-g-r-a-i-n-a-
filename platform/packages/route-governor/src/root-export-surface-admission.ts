export type RootExportSurfaceAction =
  | "admit_root_consumable_behavior"
  | "block_hidden_behavior"
  | "block_missing_behavior"
  | "block_missing_root_export"
  | "block_missing_routing_effect";

export interface RootExportSurfaceAdmissionInput {
  candidate_id: string;
  behavior_exports: string[];
  root_exports: string[];
  changed_files: string[];
  routing_effects: string[];
}

export interface RootExportSurfaceAdmissionVerdict {
  ok: boolean;
  action: RootExportSurfaceAction;
  candidate_id: string;
  admitted_exports: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableSource(path: string): boolean {
  return path.startsWith("platform/packages/route-governor/src/") && /\.(?:ts|js|mjs)$/.test(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function block(
  input: RootExportSurfaceAdmissionInput,
  action: Exclude<RootExportSurfaceAction, "admit_root_consumable_behavior">,
  blockers: string[],
  nextRoute: string,
): RootExportSurfaceAdmissionVerdict {
  return {
    ok: false,
    action,
    candidate_id: input.candidate_id,
    admitted_exports: [],
    decisive_evidence: unique([...input.changed_files, ...input.behavior_exports, ...input.root_exports]),
    blockers,
    next_route: nextRoute,
  };
}

export function admitRootExportSurface(
  input: RootExportSurfaceAdmissionInput,
): RootExportSurfaceAdmissionVerdict {
  const behaviorExports = unique(input.behavior_exports);
  const rootExports = unique(input.root_exports);
  const changedExecutableFiles = unique(input.changed_files).filter(executableSource);
  const missingRootExports = behaviorExports.filter((name) => !rootExports.includes(name));

  if (changedExecutableFiles.length === 0) {
    return block(
      input,
      "block_missing_behavior",
      ["candidate changes no executable route-governor source file"],
      "add a behavior-bearing route-governor source file before claiming root-consumable embodiment",
    );
  }

  if (behaviorExports.length === 0) {
    return block(
      input,
      "block_missing_behavior",
      ["candidate names no behavior export"],
      "name the executable behavior export that downstream routes can consume",
    );
  }

  if (rootExports.length === 0) {
    return block(
      input,
      "block_missing_root_export",
      ["candidate has no root export surface"],
      "publish the behavior through the package root or mark it as internal-only",
    );
  }

  if (missingRootExports.length > 0) {
    return block(
      input,
      "block_hidden_behavior",
      missingRootExports.map((name) => `behavior export is hidden from root surface: ${name}`),
      "extend the root export surface before this candidate can count as public platform routing behavior",
    );
  }

  if (input.routing_effects.length === 0) {
    return block(
      input,
      "block_missing_routing_effect",
      ["candidate has no future-routing effect"],
      "state how the root-consumable behavior changes future routing before admitting it",
    );
  }

  return {
    ok: true,
    action: "admit_root_consumable_behavior",
    candidate_id: input.candidate_id,
    admitted_exports: behaviorExports,
    decisive_evidence: unique([...changedExecutableFiles, ...behaviorExports, ...rootExports, ...input.routing_effects]),
    blockers: [],
    next_route: "consume this behavior from the package root, then bind any follow-up status claim to the moved PR head",
  };
}
