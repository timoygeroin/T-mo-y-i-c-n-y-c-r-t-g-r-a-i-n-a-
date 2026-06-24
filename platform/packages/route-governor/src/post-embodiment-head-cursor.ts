export type PostEmbodimentHeadCursorAction =
  | "require_new_head_status_readback"
  | "accept_new_head_status_readback"
  | "block_no_head_move"
  | "block_incomplete_embodiment";

export interface PostEmbodimentHeadCursorInput {
  branch: string;
  active_branch: string;
  previous_head_sha: string;
  new_head_sha: string;
  write_surface: string;
  committed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_readback_head_sha?: string;
}

export interface PostEmbodimentHeadCursorVerdict {
  ok: boolean;
  action: PostEmbodimentHeadCursorAction;
  branch: string;
  head_sha: string;
  required_status_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: PostEmbodimentHeadCursorInput): Pick<
  PostEmbodimentHeadCursorVerdict,
  "branch" | "head_sha" | "required_status_head_sha"
> {
  return {
    branch: input.branch,
    head_sha: input.new_head_sha,
    required_status_head_sha: input.new_head_sha,
  };
}

function incompleteBlockers(input: PostEmbodimentHeadCursorInput): string[] {
  const blockers: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`post-embodiment branch ${input.branch} does not match active branch ${input.active_branch}`);
  }
  if (!input.write_surface.trim()) {
    blockers.push("post-embodiment cursor has no external write surface");
  }
  if (!input.committed_files.some(executablePlatformPath)) {
    blockers.push("post-embodiment cursor has no executable platform file in committed files");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("post-embodiment cursor has no executable artifact evidence");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("post-embodiment cursor has no future-routing artifact evidence");
  }

  return blockers;
}

export function compilePostEmbodimentHeadCursor(
  input: PostEmbodimentHeadCursorInput,
): PostEmbodimentHeadCursorVerdict {
  const baseFields = base(input);

  if (input.previous_head_sha === input.new_head_sha) {
    return {
      ...baseFields,
      ok: false,
      action: "block_no_head_move",
      decisive_evidence: [],
      blockers: [`branch head did not move from ${input.previous_head_sha}`],
      next_route: "do not count a post-embodiment cursor until an external commit moves the PR head",
    };
  }

  const blockers = incompleteBlockers(input);
  if (blockers.length > 0) {
    return {
      ...baseFields,
      ok: false,
      action: "block_incomplete_embodiment",
      decisive_evidence: [],
      blockers,
      next_route: "complete the executable embodiment evidence before opening a post-commit status cursor",
    };
  }

  const decisiveEvidence = [
    `head moved from ${input.previous_head_sha} to ${input.new_head_sha}`,
    `write surface ${input.write_surface}`,
    ...input.committed_files.filter(executablePlatformPath),
    ...input.executable_artifacts,
    ...input.routing_artifacts,
  ];

  if (input.status_readback_head_sha !== input.new_head_sha) {
    return {
      ...baseFields,
      ok: false,
      action: "require_new_head_status_readback",
      decisive_evidence: decisiveEvidence,
      blockers: [
        input.status_readback_head_sha
          ? `status readback belongs to ${input.status_readback_head_sha}, not new head ${input.new_head_sha}`
          : `missing status readback for new head ${input.new_head_sha}`,
      ],
      next_route: "read only Checks, Actions, or workflow evidence bound to the new PR head before any pass/fail claim",
    };
  }

  return {
    ...baseFields,
    ok: true,
    action: "accept_new_head_status_readback",
    decisive_evidence: [...decisiveEvidence, `status readback bound to ${input.new_head_sha}`],
    blockers: [],
    next_route: "continue with the next non-repeated executable embodiment or the exact blocker surfaced by the new-head checks",
  };
}
