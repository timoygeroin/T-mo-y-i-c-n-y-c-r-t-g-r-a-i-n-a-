import type { FinalizationReleaseMuxVerdict } from "./finalization-release-mux.js";

export type TerminalReleaseExecutionBoundary =
  | "github_branch_commit"
  | "github_status_readback"
  | "external_blocker_report"
  | "pr_comment"
  | "pr_metadata_reread"
  | "local_memory_update";

export type TerminalReleaseEnvelopeAction =
  | "compile_branch_commit_envelope"
  | "compile_status_readback_envelope"
  | "compile_exact_blocker_envelope"
  | "block_unadmitted_release"
  | "block_stale_execution_head"
  | "block_wrong_execution_boundary"
  | "block_missing_result_head";

export interface TerminalReleaseEnvelopeInput {
  release: FinalizationReleaseMuxVerdict;
  live_head_sha: string;
  active_branch: string;
  execution_boundary: TerminalReleaseExecutionBoundary;
  expected_result_head_sha?: string;
}

export interface TerminalReleaseEnvelope {
  operation: "commit_external_embodiment" | "read_fresh_status" | "emit_exact_blocker";
  branch: string;
  base_head_sha: string;
  expected_result_head_sha?: string;
  guard: {
    require_live_head_sha: string;
    require_release_id: string;
    require_release_action:
      | "release_external_embodiment"
      | "release_fresh_status_readback"
      | "release_exact_external_blocker";
    forbidden_boundaries: TerminalReleaseExecutionBoundary[];
  };
}

export interface TerminalReleaseEnvelopeVerdict {
  ok: boolean;
  action: TerminalReleaseEnvelopeAction;
  envelope: TerminalReleaseEnvelope | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const FORBIDDEN_BOUNDARIES: TerminalReleaseExecutionBoundary[] = [
  "pr_comment",
  "pr_metadata_reread",
  "local_memory_update",
];

function block(
  action: Exclude<
    TerminalReleaseEnvelopeAction,
    "compile_branch_commit_envelope" | "compile_status_readback_envelope" | "compile_exact_blocker_envelope"
  >,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): TerminalReleaseEnvelopeVerdict {
  return {
    ok: false,
    action,
    envelope: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function evidence(input: TerminalReleaseEnvelopeInput): string[] {
  return [
    `release action ${input.release.action}`,
    `release id ${input.release.release_id ?? "<none>"}`,
    `release head ${input.release.head_sha}`,
    `live head ${input.live_head_sha}`,
    `boundary ${input.execution_boundary}`,
  ];
}

function envelope(
  input: TerminalReleaseEnvelopeInput,
  operation: TerminalReleaseEnvelope["operation"],
  requiredAction: TerminalReleaseEnvelope["guard"]["require_release_action"],
): TerminalReleaseEnvelope {
  return {
    operation,
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    expected_result_head_sha: input.expected_result_head_sha,
    guard: {
      require_live_head_sha: input.live_head_sha,
      require_release_id: input.release.release_id ?? "",
      require_release_action: requiredAction,
      forbidden_boundaries: FORBIDDEN_BOUNDARIES,
    },
  };
}

export function compileTerminalReleaseEnvelope(
  input: TerminalReleaseEnvelopeInput,
): TerminalReleaseEnvelopeVerdict {
  const decisiveEvidence = evidence(input);

  if (!input.release.ok || !input.release.release_id) {
    return block(
      "block_unadmitted_release",
      decisiveEvidence,
      [...input.release.blockers, "terminal release was not admitted by the finalization release mux"],
      "return to the release mux and admit exactly one terminal progress class before execution",
    );
  }

  if (input.release.branch !== input.active_branch) {
    return block(
      "block_stale_execution_head",
      decisiveEvidence,
      [`release branch ${input.release.branch} is not active branch ${input.active_branch}`],
      "rebind the terminal release envelope to the active manifestation branch",
    );
  }

  if (input.release.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_execution_head",
      decisiveEvidence,
      [`release head ${input.release.head_sha} is not live head ${input.live_head_sha}`],
      "refresh terminal release admission against the live PR head before execution",
    );
  }

  if (FORBIDDEN_BOUNDARIES.includes(input.execution_boundary)) {
    return block(
      "block_wrong_execution_boundary",
      decisiveEvidence,
      [`terminal release cannot execute through ${input.execution_boundary}`],
      "execute through the concrete GitHub write, status-readback, or exact-blocker boundary only",
    );
  }

  if (input.release.action === "release_external_embodiment") {
    if (input.execution_boundary !== "github_branch_commit") {
      return block(
        "block_wrong_execution_boundary",
        decisiveEvidence,
        [`external embodiment cannot execute through ${input.execution_boundary}`],
        "execute the admitted embodiment as a branch commit or emit the exact external blocker",
      );
    }

    if (!input.expected_result_head_sha?.trim() || input.expected_result_head_sha === input.live_head_sha) {
      return block(
        "block_missing_result_head",
        decisiveEvidence,
        ["external embodiment envelope requires a future result head distinct from the live head"],
        "bind the envelope to the branch commit result head before claiming embodiment completion",
      );
    }

    return {
      ok: true,
      action: "compile_branch_commit_envelope",
      envelope: envelope(input, "commit_external_embodiment", "release_external_embodiment"),
      decisive_evidence: [...decisiveEvidence, input.expected_result_head_sha],
      blockers: [],
      next_route: "execute the branch commit and then read status only for the resulting head",
    };
  }

  if (input.release.action === "release_fresh_status_readback") {
    if (input.execution_boundary !== "github_status_readback") {
      return block(
        "block_wrong_execution_boundary",
        decisiveEvidence,
        [`fresh status readback cannot execute through ${input.execution_boundary}`],
        "read the live-head status surface or choose a different terminal release class",
      );
    }

    return {
      ok: true,
      action: "compile_status_readback_envelope",
      envelope: envelope(input, "read_fresh_status", "release_fresh_status_readback"),
      decisive_evidence: decisiveEvidence,
      blockers: [],
      next_route: "publish only the live-head status verdict carried by this envelope",
    };
  }

  if (input.execution_boundary !== "external_blocker_report") {
    return block(
      "block_wrong_execution_boundary",
      decisiveEvidence,
      [`exact external blocker cannot execute through ${input.execution_boundary}`],
      "emit the exact blocker without comments, labels, memory-only writes, or metadata rereads",
    );
  }

  return {
    ok: true,
    action: "compile_exact_blocker_envelope",
    envelope: envelope(input, "emit_exact_blocker", "release_exact_external_blocker"),
    decisive_evidence: [...decisiveEvidence, ...input.release.blockers],
    blockers: input.release.blockers,
    next_route: "remove the named blocker before attempting another terminal release",
  };
}
