import {
  selectNextContinuationMove,
  type ContinuationMoveCandidate,
  type ContinuationPreflightVerdict,
  type ContinuationMoveInput,
} from "./index.js";
import type { StatusSurfaceClassification } from "./status-surface.js";

export type ManifestationReleaseAction =
  | "commit_external_embodiment"
  | "publish_fresh_status_readback"
  | "emit_exact_blocker"
  | "hold_release";

export interface ManifestationEmbodimentEvidence {
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
}

export interface ManifestationReleaseInput {
  current_head_sha: string;
  previous_readback_head_sha: string;
  new_check_run_ids: string[];
  status_surface?: StatusSurfaceClassification;
  embodiment?: ManifestationEmbodimentEvidence;
  blocker?: string;
}

export interface ManifestationReleaseVerdict {
  ok: boolean;
  action: ManifestationReleaseAction;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  failures: string[];
  preflight: ContinuationPreflightVerdict;
}

function continuationInput(
  input: ManifestationReleaseInput,
  move_class: ContinuationMoveInput["move_class"],
  overrides: Partial<ContinuationMoveInput> = {},
): ContinuationMoveInput {
  return {
    move_class,
    current_head_sha: input.current_head_sha,
    previous_readback_head_sha: input.previous_readback_head_sha,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    new_check_run_ids: input.new_check_run_ids,
    ...overrides,
  };
}

function statusBlocker(status: StatusSurfaceClassification): string {
  const blockers = [...status.blocking_failures, ...status.pending_surfaces];
  if (blockers.length > 0) {
    return blockers.join("; ");
  }
  return `status surface verdict is ${status.verdict}`;
}

function statusCandidate(input: ManifestationReleaseInput): ContinuationMoveCandidate | null {
  const status = input.status_surface;
  if (!status) return null;

  if (status.ok) {
    return {
      candidate_id: "fresh-status-readback",
      input: continuationInput(input, "fresh_status_readback"),
    };
  }

  return {
    candidate_id: "status-surface-blocker",
    input: continuationInput(input, "exact_external_blocker", {
      blocker: statusBlocker(status),
    }),
  };
}

function releaseAction(preflight: ContinuationPreflightVerdict): ManifestationReleaseAction {
  switch (preflight.selected?.release_instruction) {
    case "commit_external_embodiment":
      return "commit_external_embodiment";
    case "read_fresh_status":
      return "publish_fresh_status_readback";
    case "emit_exact_blocker":
      return "emit_exact_blocker";
    default:
      return "hold_release";
  }
}

export function compileManifestationRelease(input: ManifestationReleaseInput): ManifestationReleaseVerdict {
  const candidates: ContinuationMoveCandidate[] = [];

  if (input.embodiment) {
    candidates.push({
      candidate_id: "external-embodiment",
      input: continuationInput(input, "external_platform_embodiment", input.embodiment),
    });
  }

  const status = statusCandidate(input);
  if (status) candidates.push(status);

  if (input.blocker?.trim()) {
    candidates.push({
      candidate_id: "exact-blocker",
      input: continuationInput(input, "exact_external_blocker", { blocker: input.blocker }),
    });
  }

  const preflight = selectNextContinuationMove(candidates);
  const rejectedFailures = preflight.rejected.flatMap((candidate) =>
    candidate.reasons.map((reason) => `${candidate.candidate_id}: ${reason}`),
  );

  return {
    ok: preflight.ok,
    action: releaseAction(preflight),
    selected_candidate_id: preflight.selected?.candidate_id ?? null,
    decisive_evidence: preflight.selected?.decisive_evidence ?? [],
    failures: [...preflight.failures, ...rejectedFailures],
    preflight,
  };
}

export type PostEmbodimentHandoffAction =
  | "read_current_head_status"
  | "advance_review_handoff"
  | "emit_exact_blocker"
  | "hold_handoff";

export interface PostEmbodimentHandoffInput {
  current_head_sha: string;
  last_status_readback_head_sha: string;
  changed_files_since_readback: string[];
  executable_artifacts_since_readback: string[];
  routing_artifacts_since_readback: string[];
  pr_ready_for_review: boolean;
  blocker_issue_open: boolean;
  status_surface?: StatusSurfaceClassification;
  status_surface_head_sha?: string;
}

export interface PostEmbodimentHandoffVerdict {
  ok: boolean;
  action: PostEmbodimentHandoffAction;
  decisive_evidence: string[];
  failures: string[];
}

function isExecutableHandoffPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function hasExecutableEmbodiment(input: PostEmbodimentHandoffInput): boolean {
  return (
    input.changed_files_since_readback.some(isExecutableHandoffPath) &&
    input.executable_artifacts_since_readback.length > 0 &&
    input.routing_artifacts_since_readback.length > 0
  );
}

function blockerVerdict(blocker: string, decisive_evidence: string[] = []): PostEmbodimentHandoffVerdict {
  return {
    ok: true,
    action: "emit_exact_blocker",
    decisive_evidence: decisive_evidence.length > 0 ? decisive_evidence : [blocker],
    failures: [blocker],
  };
}

export function compilePostEmbodimentHandoff(input: PostEmbodimentHandoffInput): PostEmbodimentHandoffVerdict {
  const headMovedSinceReadback = input.current_head_sha !== input.last_status_readback_head_sha;
  const executableEmbodiment = hasExecutableEmbodiment(input);

  if (headMovedSinceReadback && executableEmbodiment && !input.status_surface) {
    return {
      ok: true,
      action: "read_current_head_status",
      decisive_evidence: [
        `head moved from ${input.last_status_readback_head_sha} to ${input.current_head_sha}`,
        ...input.executable_artifacts_since_readback,
        ...input.routing_artifacts_since_readback,
      ],
      failures: [],
    };
  }

  if (input.status_surface && input.status_surface_head_sha !== input.current_head_sha) {
    return {
      ok: true,
      action: "read_current_head_status",
      decisive_evidence: [
        `status surface is stale for ${input.status_surface_head_sha ?? "unknown head"}`,
        `current head is ${input.current_head_sha}`,
      ],
      failures: [],
    };
  }

  if (input.status_surface && !input.status_surface.ok) {
    return blockerVerdict(statusBlocker(input.status_surface));
  }

  if (input.status_surface?.ok) {
    if (!input.pr_ready_for_review) {
      return blockerVerdict("PR is not ready for review after current-head passing status");
    }

    if (input.blocker_issue_open) {
      return blockerVerdict("status blocker issue remains open after current-head passing status");
    }

    return {
      ok: true,
      action: "advance_review_handoff",
      decisive_evidence: [
        `current head ${input.current_head_sha} has passing status evidence`,
        "PR is ready for review",
        "status blocker issue is closed",
      ],
      failures: [],
    };
  }

  if (headMovedSinceReadback && !executableEmbodiment) {
    return blockerVerdict("head moved since readback but no executable embodiment evidence was supplied");
  }

  return {
    ok: false,
    action: "hold_handoff",
    decisive_evidence: [],
    failures: ["no moved executable head, current-head status, or exact blocker is available for handoff"],
  };
}
