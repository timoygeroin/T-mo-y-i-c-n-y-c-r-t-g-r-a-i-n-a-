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
