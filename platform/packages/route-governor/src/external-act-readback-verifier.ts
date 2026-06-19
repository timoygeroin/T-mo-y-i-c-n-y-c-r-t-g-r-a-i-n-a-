export type ExternalActReadbackKind = "behavior" | "routing" | "proof" | "root_export";

export type ExternalActReadbackSourceKind = "github_file" | "pr_diff" | "commit_metadata" | "memory_receipt";

export type ExternalActReadbackAction =
  | "admit_external_act_readback"
  | "block_branch_mismatch"
  | "block_unmoved_head"
  | "block_missing_required_readback"
  | "block_stale_readback"
  | "block_weak_readback_source"
  | "block_missing_symbol";

export interface ExternalActRequiredReadback {
  path: string;
  kind: ExternalActReadbackKind;
  required_symbols: string[];
}

export interface ExternalActFileReadback {
  path: string;
  kind: ExternalActReadbackKind;
  source_kind: ExternalActReadbackSourceKind;
  branch: string;
  head_sha: string;
  content_sha?: string;
  symbols: string[];
  evidence: string[];
}

export interface ExternalActReadbackInput {
  active_branch: string;
  base_head_sha: string;
  moved_head_sha: string;
  act_id: string;
  spent_act_ids: string[];
  required_readbacks: ExternalActRequiredReadback[];
  readbacks: ExternalActFileReadback[];
}

export interface ExternalActReadbackVerdict {
  ok: boolean;
  action: ExternalActReadbackAction;
  branch: string;
  base_head_sha: string;
  moved_head_sha: string;
  act_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const REQUIRED_KINDS = new Set<ExternalActReadbackKind>(["behavior", "routing", "proof"]);

function base(input: ExternalActReadbackInput): Pick<
  ExternalActReadbackVerdict,
  "branch" | "base_head_sha" | "moved_head_sha" | "act_id"
> {
  return {
    branch: input.active_branch,
    base_head_sha: input.base_head_sha,
    moved_head_sha: input.moved_head_sha,
    act_id: input.act_id.trim() || null,
  };
}

function block(
  input: ExternalActReadbackInput,
  action: Exclude<ExternalActReadbackAction, "admit_external_act_readback">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ExternalActReadbackVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function requirementKey(requirement: ExternalActRequiredReadback): string {
  return `${requirement.kind}:${requirement.path}`;
}

function readbackKey(readback: ExternalActFileReadback): string {
  return `${readback.kind}:${readback.path}`;
}

function groupedReadbacks(input: ExternalActReadbackInput): Map<string, ExternalActFileReadback> {
  const byKey = new Map<string, ExternalActFileReadback>();
  for (const readback of input.readbacks) {
    byKey.set(readbackKey(readback), readback);
  }
  return byKey;
}

function requiredKindBlockers(required: ExternalActRequiredReadback[]): string[] {
  const present = new Set(required.map((item) => item.kind));
  return [...REQUIRED_KINDS]
    .filter((kind) => !present.has(kind))
    .map((kind) => `external act readback is missing required ${kind} file`);
}

export function verifyExternalActReadback(input: ExternalActReadbackInput): ExternalActReadbackVerdict {
  const actId = input.act_id.trim();
  if (!actId || input.spent_act_ids.includes(actId)) {
    return block(
      input,
      "block_missing_required_readback",
      [actId ? `external act readback already spent: ${actId}` : "external act readback has no act id"],
      "issue an unspent act id before publishing an external embodiment receipt",
    );
  }

  if (input.moved_head_sha === input.base_head_sha) {
    return block(
      input,
      "block_unmoved_head",
      [`external act readback head did not move from ${input.base_head_sha}`],
      "perform a branch-moving external act before verifying file readback",
    );
  }

  const blockers = requiredKindBlockers(input.required_readbacks);
  const byKey = groupedReadbacks(input);
  const decisiveEvidence: string[] = [`act ${actId}`, `base ${input.base_head_sha}`, `moved ${input.moved_head_sha}`];

  for (const requirement of input.required_readbacks) {
    const readback = byKey.get(requirementKey(requirement));
    if (!readback) {
      blockers.push(`missing GitHub file readback for ${requirement.path}`);
      continue;
    }

    decisiveEvidence.push(readback.path, readback.content_sha ?? "<missing content sha>", ...readback.evidence);

    if (readback.branch !== input.active_branch) {
      return block(
        input,
        "block_branch_mismatch",
        [`readback ${readback.path} came from ${readback.branch}, not ${input.active_branch}`],
        "read the external act files from the active PR branch before publishing the receipt",
        decisiveEvidence,
      );
    }

    if (readback.head_sha !== input.moved_head_sha) {
      return block(
        input,
        "block_stale_readback",
        [`readback ${readback.path} is bound to ${readback.head_sha}, not moved head ${input.moved_head_sha}`],
        "discard stale file readback and fetch the behavior, routing, and proof files from the moved head",
        decisiveEvidence,
      );
    }

    if (readback.source_kind !== "github_file" || !readback.content_sha?.trim()) {
      return block(
        input,
        "block_weak_readback_source",
        [`readback ${readback.path} used ${readback.source_kind} without GitHub content SHA authority`],
        "use GitHub file readback with content SHA before counting the external act as embodied",
        decisiveEvidence,
      );
    }

    const missingSymbols = requirement.required_symbols.filter((symbol) => !readback.symbols.includes(symbol));
    if (missingSymbols.length > 0) {
      return block(
        input,
        "block_missing_symbol",
        [`readback ${readback.path} is missing symbols: ${missingSymbols.join(", ")}`],
        "fetch the exact file content that exposes the required behavior and routing symbols",
        decisiveEvidence,
      );
    }
  }

  if (blockers.length > 0) {
    return block(
      input,
      "block_missing_required_readback",
      blockers,
      "obtain GitHub file readback for behavior, routing, and proof files before publishing the external act receipt",
      decisiveEvidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_external_act_readback",
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route:
      "publish the embodiment receipt only after this moved-head GitHub file readback; status authority remains a separate current-head surface",
  };
}
