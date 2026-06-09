export type CapabilityFrontierAction =
  | "accept_capability_frontier"
  | "block_branch_mismatch"
  | "block_repeated_capability"
  | "block_incomplete_capability";

export interface CapabilityFrontierAdmissionInput {
  target_branch: string;
  active_branch: string;
  current_head_sha: string;
  proposed_capability: string;
  spent_capabilities: string[];
  changed_files: string[];
  executable_exports: string[];
  proof_artifacts: string[];
  future_routing_effects: string[];
  rejected_move_classes: string[];
}

export interface CapabilityFrontierAdmissionVerdict {
  ok: boolean;
  action: CapabilityFrontierAction;
  branch: string;
  head_sha: string;
  admitted_capability: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: CapabilityFrontierAdmissionInput): Pick<
  CapabilityFrontierAdmissionVerdict,
  "branch" | "head_sha"
> {
  return { branch: input.target_branch, head_sha: input.current_head_sha };
}

function incompleteBlockers(input: CapabilityFrontierAdmissionInput): string[] {
  const blockers: string[] = [];

  if (!input.proposed_capability.trim()) {
    blockers.push("capability frontier has no named capability");
  }
  if (!input.changed_files.some(executablePlatformPath)) {
    blockers.push("capability frontier does not change executable platform files");
  }
  if (input.executable_exports.length === 0) {
    blockers.push("capability frontier exposes no executable export");
  }
  if (input.proof_artifacts.length === 0) {
    blockers.push("capability frontier has no proof artifact");
  }
  if (input.future_routing_effects.length === 0) {
    blockers.push("capability frontier has no future-routing effect");
  }
  if (!input.rejected_move_classes.some((moveClass) => NON_PROGRESS_MOVE_CLASSES.has(moveClass))) {
    blockers.push("capability frontier does not explicitly reject any known non-progress class");
  }

  return blockers;
}

export function admitCapabilityFrontier(
  input: CapabilityFrontierAdmissionInput,
): CapabilityFrontierAdmissionVerdict {
  const baseFields = base(input);
  const capability = input.proposed_capability.trim();

  if (input.target_branch !== input.active_branch) {
    return {
      ...baseFields,
      ok: false,
      action: "block_branch_mismatch",
      admitted_capability: null,
      decisive_evidence: [],
      blockers: [`target branch ${input.target_branch} does not match active branch ${input.active_branch}`],
      next_route: "bind the capability frontier to the active PR branch before advancing embodiment",
    };
  }

  if (capability && input.spent_capabilities.includes(capability)) {
    return {
      ...baseFields,
      ok: false,
      action: "block_repeated_capability",
      admitted_capability: null,
      decisive_evidence: [],
      blockers: [`capability already spent: ${capability}`],
      next_route: "choose a capability frontier that changes the platform class instead of extending the same proof family",
    };
  }

  const blockers = incompleteBlockers(input);
  if (blockers.length > 0) {
    return {
      ...baseFields,
      ok: false,
      action: "block_incomplete_capability",
      admitted_capability: null,
      decisive_evidence: [],
      blockers,
      next_route: "supply executable files, exports, proof evidence, future-routing effects, and explicit non-progress rejection",
    };
  }

  return {
    ...baseFields,
    ok: true,
    action: "accept_capability_frontier",
    admitted_capability: capability,
    decisive_evidence: [
      capability,
      ...input.changed_files.filter(executablePlatformPath),
      ...input.executable_exports,
      ...input.proof_artifacts,
      ...input.future_routing_effects,
      ...input.rejected_move_classes.filter((moveClass) => NON_PROGRESS_MOVE_CLASSES.has(moveClass)),
    ],
    blockers: [],
    next_route: "commit the capability-frontier embodiment, then read only the new head status before making CI claims",
  };
}
