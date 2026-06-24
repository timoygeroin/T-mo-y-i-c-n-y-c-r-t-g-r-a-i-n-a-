export type LiveEmbodimentCovenantMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "warning_maintenance";

export type LiveEmbodimentCovenantAction =
  | "admit_live_embodiment_covenant"
  | "block_branch_mismatch"
  | "block_stale_or_resolved_head_base"
  | "block_non_embodiment_move"
  | "block_spent_covenant"
  | "block_non_behavior_delta"
  | "block_missing_public_surface"
  | "block_missing_next_status_binding";

export interface LiveEmbodimentCovenantCandidate {
  covenant_id: string;
  move_class: LiveEmbodimentCovenantMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  package_export: string;
  index_export: string;
  proof_module: string;
  next_status_expected_head?: string;
}

export interface LiveEmbodimentCovenantInput {
  active_branch: string;
  live_head_sha: string;
  resolved_historical_heads: string[];
  spent_covenant_ids: string[];
  package_exports: string[];
  index_exports: string[];
  proof_command: string;
  candidate: LiveEmbodimentCovenantCandidate;
}

export interface LiveEmbodimentCovenantVerdict {
  ok: boolean;
  action: LiveEmbodimentCovenantAction;
  branch: string;
  head_sha: string;
  covenant_id: string | null;
  historical_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_EMBODIMENT_MOVES = new Set<LiveEmbodimentCovenantMoveClass>([
  "fresh_status_readback",
  "exact_external_blocker",
  "duplicate_ci_summary",
  "metadata_reread",
  "warning_maintenance",
]);

function normalizeExport(value: string): string {
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

function base(input: LiveEmbodimentCovenantInput): Pick<
  LiveEmbodimentCovenantVerdict,
  "branch" | "head_sha" | "historical_head_shas"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    historical_head_shas: input.resolved_historical_heads.filter((head) => head !== input.live_head_sha),
  };
}

function block(
  input: LiveEmbodimentCovenantInput,
  action: Exclude<LiveEmbodimentCovenantAction, "admit_live_embodiment_covenant">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveEmbodimentCovenantVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    covenant_id: input.candidate.covenant_id || null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function completionBlockers(input: LiveEmbodimentCovenantInput): string[] {
  const candidate = input.candidate;
  const blockers: string[] = [];
  const packageExport = normalizeExport(candidate.package_export);
  const proofModule = normalizeProofModule(candidate.proof_module);
  const proofModules = proofCommandModules(input.proof_command);

  if (!candidate.covenant_id.trim()) blockers.push("live embodiment covenant has no covenant id");
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("live embodiment covenant changes no behavior-bearing platform file");
  if (candidate.behavior_artifacts.length === 0) blockers.push("live embodiment covenant has no behavior artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("live embodiment covenant has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("live embodiment covenant has no proof artifact evidence");
  if (!input.package_exports.includes(packageExport)) blockers.push(`live embodiment covenant is missing package export: ${packageExport}`);
  if (!input.index_exports.includes(candidate.index_export)) {
    blockers.push(`live embodiment covenant is missing root index export: ${candidate.index_export}`);
  }
  if (!proofModules.includes(proofModule)) blockers.push(`live embodiment covenant proof is not executed: ${proofModule}`);

  return blockers;
}

export function enforceLiveEmbodimentCovenant(
  input: LiveEmbodimentCovenantInput,
): LiveEmbodimentCovenantVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the embodiment covenant to the active PR branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_or_resolved_head_base",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the embodiment covenant to the live PR head; keep repaired or prompt-carried heads as history only",
      input.resolved_historical_heads.map((head) => `historical head ${head}`),
    );
  }

  if (input.resolved_historical_heads.includes(candidate.base_head_sha)) {
    return block(
      input,
      "block_stale_or_resolved_head_base",
      [`candidate base ${candidate.base_head_sha} is a resolved historical head`],
      "do not base a new embodiment on a repaired-head success receipt after the PR has moved",
    );
  }

  if (NON_EMBODIMENT_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_embodiment_move",
      [`live embodiment covenant cannot be satisfied by ${candidate.move_class}`],
      "choose a behavior-bearing external platform embodiment or emit the terminal blocker directly",
      [candidate.move_class],
    );
  }

  if (input.spent_covenant_ids.includes(candidate.covenant_id)) {
    return block(
      input,
      "block_spent_covenant",
      [`live embodiment covenant already spent: ${candidate.covenant_id}`],
      "select an unspent covenant id and behavior surface before moving the branch again",
    );
  }

  const completion = completionBlockers(input);
  if (completion.some((item) => item.includes("behavior-bearing"))) {
    return block(input, "block_non_behavior_delta", completion, "add a behavior-bearing platform module before release");
  }
  if (completion.some((item) => item.includes("export") || item.includes("proof is not executed"))) {
    return block(
      input,
      "block_missing_public_surface",
      completion,
      "wire the behavior through package exports, root exports, and proof execution before release",
    );
  }
  if (completion.length > 0) {
    return block(input, "block_non_behavior_delta", completion, "complete behavior, routing, and proof evidence before release");
  }

  if (!candidate.next_status_expected_head || candidate.next_status_expected_head === input.live_head_sha) {
    return block(
      input,
      "block_missing_next_status_binding",
      ["live embodiment covenant must bind the next status readback to the moved post-write head"],
      "write the embodiment, record its resulting head, and require status only for that new head",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_embodiment_covenant",
    covenant_id: candidate.covenant_id,
    decisive_evidence: [
      candidate.covenant_id,
      `live base ${input.live_head_sha}`,
      `next status head ${candidate.next_status_expected_head}`,
      normalizeExport(candidate.package_export),
      candidate.index_export,
      normalizeProofModule(candidate.proof_module),
      ...candidate.changed_files.filter(behaviorPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the live-head embodiment covenant, then require all status authority to bind to the moved resulting head",
  };
}
