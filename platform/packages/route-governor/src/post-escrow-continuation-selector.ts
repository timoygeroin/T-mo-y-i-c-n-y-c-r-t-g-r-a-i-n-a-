import type { PostWriteStatusEscrowVerdict } from "./post-write-status-escrow.js";
import type { StatusReadbackTransportVerdict } from "./status-readback-transport.js";

export type PostEscrowContinuationAction =
  | "select_head_status_readback"
  | "select_statusless_embodiment"
  | "select_exact_external_blocker"
  | "block_premature_or_repeated_continuation";

export interface PostEscrowEmbodimentCandidate {
  candidate_id: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface PostEscrowContinuationInput {
  active_branch: string;
  live_head_sha: string;
  escrow: PostWriteStatusEscrowVerdict;
  transport: StatusReadbackTransportVerdict;
  spent_artifact_classes: string[];
  prohibited_blockers: string[];
  candidate?: PostEscrowEmbodimentCandidate;
}

export interface PostEscrowContinuationVerdict {
  ok: boolean;
  action: PostEscrowContinuationAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPlatformPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function candidateBlockers(input: PostEscrowContinuationInput): string[] {
  const candidate = input.candidate;
  if (!candidate) return ["post-escrow continuation has no executable embodiment candidate"];

  const blockers: string[] = [];
  if (!candidate.candidate_id.trim()) blockers.push("post-escrow candidate has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("post-escrow candidate has no artifact class");
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`post-escrow candidate repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("post-escrow candidate changes no executable platform file");
  }
  if (!candidate.changed_files.some(behaviorPlatformPath)) {
    blockers.push("post-escrow candidate changes no behavior-bearing platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("post-escrow candidate has no executable artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-escrow candidate has no routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-escrow candidate has no proof artifact");
  return blockers;
}

function candidateEvidence(candidate: PostEscrowEmbodimentCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.artifact_class,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

function block(input: PostEscrowContinuationInput, blockers: string[], evidence: string[] = []): PostEscrowContinuationVerdict {
  return {
    ok: false,
    action: "block_premature_or_repeated_continuation",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    decisive_evidence: evidence,
    blockers,
    next_route: "supply current-head status, a non-repeated executable fallback, or one exact external blocker",
  };
}

export function selectPostEscrowContinuation(input: PostEscrowContinuationInput): PostEscrowContinuationVerdict {
  const boundaryBlockers: string[] = [];

  if (input.escrow.branch !== input.active_branch) {
    boundaryBlockers.push(`escrow branch ${input.escrow.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.transport.branch !== input.active_branch) {
    boundaryBlockers.push(`transport branch ${input.transport.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.escrow.required_status_head_sha !== input.live_head_sha) {
    boundaryBlockers.push(
      `escrow requires status for ${input.escrow.required_status_head_sha}, not live head ${input.live_head_sha}`,
    );
  }
  if (input.transport.required_head_sha !== input.live_head_sha) {
    boundaryBlockers.push(
      `transport requires status for ${input.transport.required_head_sha}, not live head ${input.live_head_sha}`,
    );
  }

  if (boundaryBlockers.length > 0) return block(input, boundaryBlockers);

  if (input.escrow.ok && input.escrow.action === "release_head_bound_status") {
    if (input.transport.ok && input.transport.action === "use_status_transport" && input.transport.selected_surface) {
      return {
        ok: true,
        action: "select_head_status_readback",
        branch: input.active_branch,
        head_sha: input.live_head_sha,
        decisive_evidence: [
          `status head ${input.live_head_sha}`,
          input.transport.selected_surface.kind,
          input.transport.selected_surface.evidence,
          ...input.escrow.decisive_evidence,
        ],
        blockers: [],
        next_route: "release only the current-head status readback; do not bundle embodiment, metadata, comments, or labels",
      };
    }

    return block(
      input,
      ["post-write escrow released status but no current-head status transport was selected"],
      input.escrow.decisive_evidence,
    );
  }

  if (input.escrow.ok && input.escrow.action === "open_post_write_status_escrow") {
    if (input.transport.ok && input.transport.action === "route_to_executable_embodiment") {
      const blockers = candidateBlockers(input);
      if (blockers.length > 0) return block(input, blockers, input.transport.decisive_evidence);

      const candidate = input.candidate;
      if (!candidate) return block(input, ["post-escrow continuation has no executable embodiment candidate"]);

      return {
        ok: true,
        action: "select_statusless_embodiment",
        branch: input.active_branch,
        head_sha: input.live_head_sha,
        decisive_evidence: [
          "no current-head status claim is released",
          ...input.escrow.decisive_evidence,
          ...input.transport.decisive_evidence,
          ...candidateEvidence(candidate),
        ],
        blockers: [],
        next_route: "commit only the selected executable fallback, then open a new post-write status escrow for the moved head",
      };
    }

    if (input.transport.action === "emit_exact_status_access_blocker" && input.transport.blocker) {
      const blocker = input.transport.blocker.trim();
      if (input.prohibited_blockers.includes(blocker)) {
        return block(input, [`post-escrow exact blocker repeats prohibited blocker: ${blocker}`], input.transport.decisive_evidence);
      }

      return {
        ok: true,
        action: "select_exact_external_blocker",
        branch: input.active_branch,
        head_sha: input.live_head_sha,
        decisive_evidence: [blocker, ...input.transport.decisive_evidence, ...input.escrow.decisive_evidence],
        blockers: [blocker],
        next_route: "remove the named status access blocker before attempting status readback or another embodiment",
      };
    }
  }

  return block(input, [...input.escrow.blockers, ...(input.transport.blocker ? [input.transport.blocker] : [])], [
    ...input.escrow.decisive_evidence,
    ...input.transport.decisive_evidence,
  ]);
}
