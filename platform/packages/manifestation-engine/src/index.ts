export type ManifestationCommand =
  | "request_final_review"
  | "merge_after_review"
  | "publish_release_candidate"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "local_memory_guard";

export type ManifestationSourceAuthority =
  | "direct_current_instruction"
  | "live_pr_head_readback"
  | "source_ranked_route"
  | "review_authority"
  | "status_surface"
  | "model_summary";

export type ManifestationAdmissionAction =
  | "admit_manifestation_command"
  | "emit_exact_external_blocker"
  | "block_stale_head"
  | "block_reused_command"
  | "block_non_progress_command"
  | "block_internal_target"
  | "block_missing_authority"
  | "block_active_blocker"
  | "block_missing_blocker";

export interface ManifestationTarget {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  external_surface: "github_pull_request" | "github_branch" | "external_review_queue";
}

export interface ManifestationCommandInput {
  command_id: string;
  spent_command_ids: string[];
  command: ManifestationCommand;
  target: ManifestationTarget;
  expected_branch: string;
  expected_head_sha: string;
  source_authority: ManifestationSourceAuthority[];
  active_blockers: string[];
  external_artifacts: string[];
  exact_blocker?: string;
}

export interface ManifestationCommandVerdict {
  ok: boolean;
  action: ManifestationAdmissionAction;
  command_id: string | null;
  command: ManifestationCommand;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_COMMANDS = new Set<ManifestationCommand>([
  "metadata_reread",
  "duplicate_comment",
  "local_memory_guard",
]);

const REQUIRED_AUTHORITIES: ManifestationSourceAuthority[] = [
  "direct_current_instruction",
  "live_pr_head_readback",
  "source_ranked_route",
];

function clean(value: string): string {
  return value.trim();
}

function base(input: ManifestationCommandInput): Pick<
  ManifestationCommandVerdict,
  "command_id" | "command" | "branch" | "head_sha"
> {
  return {
    command_id: clean(input.command_id) || null,
    command: input.command,
    branch: input.target.branch,
    head_sha: input.target.live_head_sha,
  };
}

function evidence(input: ManifestationCommandInput): string[] {
  return [
    `command ${clean(input.command_id) || "<missing>"}`,
    `target ${input.target.repository_full_name}#${input.target.pr_number}`,
    `branch ${input.target.branch}`,
    `head ${input.target.live_head_sha}`,
    ...input.external_artifacts,
  ];
}

function block(
  input: ManifestationCommandInput,
  action: Exclude<ManifestationAdmissionAction, "admit_manifestation_command" | "emit_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
): ManifestationCommandVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers,
    next_route: nextRoute,
  };
}

function missingAuthority(input: ManifestationCommandInput): ManifestationSourceAuthority[] {
  const present = new Set(input.source_authority);
  return REQUIRED_AUTHORITIES.filter((authority) => !present.has(authority));
}

export function admitManifestationCommand(input: ManifestationCommandInput): ManifestationCommandVerdict {
  const commandId = clean(input.command_id);
  const routeEvidence = evidence(input);

  if (!commandId || input.spent_command_ids.includes(commandId)) {
    return block(
      input,
      "block_reused_command",
      [commandId ? `manifestation command already spent: ${commandId}` : "manifestation command has no id"],
      "issue one fresh command id before consuming manifestation authority",
    );
  }

  if (NON_PROGRESS_COMMANDS.has(input.command)) {
    return block(
      input,
      "block_non_progress_command",
      [`${input.command} cannot count as a manifestation command`],
      "choose final review, merge, release-candidate publication, or one exact external blocker",
    );
  }

  if (input.target.branch !== input.expected_branch || input.target.live_head_sha !== input.expected_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`target ${input.target.branch}:${input.target.live_head_sha} does not match expected ${input.expected_branch}:${input.expected_head_sha}`],
      "rebuild manifestation authority from the live PR head before issuing any command",
    );
  }

  if (input.command === "exact_external_blocker") {
    const blockerText = clean(input.exact_blocker ?? "");
    if (!blockerText) {
      return block(
        input,
        "block_missing_blocker",
        ["exact external blocker command has no blocker text"],
        "name the external blocker or choose an executable manifestation command",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...routeEvidence, blockerText],
      blockers: [blockerText],
      next_route: "remove the named external blocker before issuing another manifestation command",
    };
  }

  if (input.target.external_surface !== "github_pull_request" && input.target.external_surface !== "external_review_queue") {
    return block(
      input,
      "block_internal_target",
      [`${input.target.external_surface} is not a sufficient manifestation command target`],
      "bind manifestation to PR review, merge, release, or another external review surface",
    );
  }

  const missing = missingAuthority(input);
  if (missing.length > 0) {
    return block(
      input,
      "block_missing_authority",
      missing.map((authority) => `missing manifestation authority: ${authority}`),
      "attach direct instruction, live PR head readback, and source-ranked route authority before command admission",
    );
  }

  if (input.source_authority.includes("model_summary")) {
    return block(
      input,
      "block_missing_authority",
      ["model_summary cannot supply manifestation authority"],
      "replace model-summary authority with direct, live-head, or source-ranked evidence",
    );
  }

  if (input.active_blockers.length > 0) {
    return block(
      input,
      "block_active_blocker",
      input.active_blockers,
      "resolve or emit the active external blocker before consuming manifestation authority",
    );
  }

  if (input.external_artifacts.length === 0) {
    return block(
      input,
      "block_internal_target",
      ["manifestation command has no external artifact evidence"],
      "attach an externally retrievable PR, branch, status, review, or release artifact",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_manifestation_command",
    decisive_evidence: routeEvidence,
    blockers: [],
    next_route: "execute this command once against the live external surface, then record a result receipt",
  };
}

export function runManifestationEngineProof(): void {
  const target: ManifestationTarget = {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    live_head_sha: "8f58f5f0e000faa09b1ee3ebd98973febc1fde6d",
    external_surface: "github_pull_request",
  };

  const accepted = admitManifestationCommand({
    command_id: "manifestation-8f58-review",
    spent_command_ids: [],
    command: "request_final_review",
    target,
    expected_branch: target.branch,
    expected_head_sha: target.live_head_sha,
    source_authority: ["direct_current_instruction", "live_pr_head_readback", "source_ranked_route"],
    active_blockers: [],
    external_artifacts: ["PR #2", "branch monday-platform-genesis-01", `head ${target.live_head_sha}`],
  });
  if (!accepted.ok || accepted.action !== "admit_manifestation_command") {
    throw new Error(`manifestation command proof failed: ${accepted.blockers.join("; ")}`);
  }

  const stale = admitManifestationCommand({
    command_id: "manifestation-stale",
    spent_command_ids: [],
    command: "request_final_review",
    target,
    expected_branch: target.branch,
    expected_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    source_authority: ["direct_current_instruction", "live_pr_head_readback", "source_ranked_route"],
    active_blockers: [],
    external_artifacts: ["PR #2"],
  });
  if (stale.ok || stale.action !== "block_stale_head") {
    throw new Error("manifestation engine accepted a stale-head command");
  }

  const summaryOnly = admitManifestationCommand({
    command_id: "manifestation-summary",
    spent_command_ids: [],
    command: "merge_after_review",
    target,
    expected_branch: target.branch,
    expected_head_sha: target.live_head_sha,
    source_authority: ["model_summary"],
    active_blockers: [],
    external_artifacts: ["PR #2"],
  });
  if (summaryOnly.ok || summaryOnly.action !== "block_missing_authority") {
    throw new Error("manifestation engine accepted model-summary authority");
  }
}

runManifestationEngineProof();

export * from "./manifestation-result-receipt.js";
export * from "./processor-packet-manifestation-admission.js";
export * from "./branch-embodiment-result-receipt.js";
