import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

export type ReviewHandoffPacketAction =
  | "compile_review_handoff_packet"
  | "block_unadmitted_terminal_handoff"
  | "block_stale_handoff_head"
  | "block_replayed_packet"
  | "block_missing_review_target"
  | "block_placeholder_review_target"
  | "block_missing_status_evidence"
  | "block_unbounded_next_route";

export interface ReviewHandoffPacketInput {
  handoff: TerminalReviewHandoffVerdict;
  live_head_sha: string;
  packet_id: string;
  spent_packet_ids: string[];
  requested_reviewers: string[];
  requested_team_reviewers: string[];
  status_surface_ids: string[];
  mergeability_lease_id?: string;
  prohibited_next_embodiment_classes: string[];
}

export interface ReviewHandoffPacket {
  packet_id: string;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  reviewers: string[];
  team_reviewers: string[];
  status_surface_ids: string[];
  mergeability_lease_id?: string;
  frozen_context: string[];
  allowed_next_operations: Array<
    "request_pull_request_reviewers" | "intake_review_response" | "exact_external_blocker"
  >;
  forbidden_continuations: string[];
}

export interface ReviewHandoffPacketVerdict {
  ok: boolean;
  action: ReviewHandoffPacketAction;
  packet: ReviewHandoffPacket | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const PLACEHOLDER_TARGETS = new Set([
  "platform-reviewer",
  "reviewer",
  "todo",
  "tbd",
  "example-reviewer",
  "placeholder-reviewer",
]);

function normalize(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function placeholders(values: string[]): string[] {
  return values.filter((value) => PLACEHOLDER_TARGETS.has(value.toLowerCase()));
}

function block(
  action: Exclude<ReviewHandoffPacketAction, "compile_review_handoff_packet">,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): ReviewHandoffPacketVerdict {
  return {
    ok: false,
    action,
    packet: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileReviewHandoffPacket(input: ReviewHandoffPacketInput): ReviewHandoffPacketVerdict {
  const evidence = [
    `handoff action ${input.handoff.action}`,
    `handoff head ${input.handoff.head_sha}`,
    `live head ${input.live_head_sha}`,
    `branch ${input.handoff.branch}`,
  ];

  if (!input.handoff.ok || input.handoff.action !== "admit_review_request") {
    return block(
      "block_unadmitted_terminal_handoff",
      evidence,
      [...input.handoff.blockers, `terminal handoff action is ${input.handoff.action}`],
      "compile a review handoff packet only after terminal review handoff admits a review request",
    );
  }

  if (input.handoff.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_handoff_head",
      evidence,
      [`terminal handoff head ${input.handoff.head_sha} is not live head ${input.live_head_sha}`],
      "refresh terminal review handoff against the live PR head before compiling a review packet",
    );
  }

  const packetId = input.packet_id.trim();
  if (!packetId || input.spent_packet_ids.includes(packetId)) {
    return block(
      "block_replayed_packet",
      evidence,
      [packetId ? `review handoff packet already spent: ${packetId}` : "review handoff packet has no id"],
      "compile each live-head review handoff packet with a new durable packet id",
    );
  }

  const reviewers = normalize(input.requested_reviewers);
  const teamReviewers = normalize(input.requested_team_reviewers);
  const targetPlaceholders = placeholders([...reviewers, ...teamReviewers]);

  if (reviewers.length === 0 && teamReviewers.length === 0) {
    return block(
      "block_missing_review_target",
      evidence,
      ["review handoff packet has no reviewer or team reviewer target"],
      "name a real GitHub reviewer or team before compiling the review handoff packet",
    );
  }

  if (targetPlaceholders.length > 0) {
    return block(
      "block_placeholder_review_target",
      evidence,
      targetPlaceholders.map((target) => `review target is a placeholder: ${target}`),
      "replace placeholder targets with real GitHub reviewer or team slugs before review handoff",
    );
  }

  const statusSurfaceIds = normalize(input.status_surface_ids);
  if (statusSurfaceIds.length === 0) {
    return block(
      "block_missing_status_evidence",
      evidence,
      ["review handoff packet has no live-head status surface id"],
      "attach the live-head status surface that admitted terminal review handoff before packet release",
    );
  }

  const forbiddenContinuations = normalize([
    "duplicate_comment",
    "duplicate_label",
    "metadata_reread",
    "local_memory_guard",
    "reclose_resolved_blocker",
    "stale_repaired_head_status",
    ...input.prohibited_next_embodiment_classes,
  ]);

  if (forbiddenContinuations.length === 0) {
    return block(
      "block_unbounded_next_route",
      evidence,
      ["review handoff packet does not freeze any forbidden continuation classes"],
      "freeze non-progress continuations before review handoff leaves the route-governor",
    );
  }

  const packet: ReviewHandoffPacket = {
    packet_id: packetId,
    repository_full_name: input.handoff.repository_full_name,
    pr_number: input.handoff.pr_number,
    branch: input.handoff.branch,
    head_sha: input.handoff.head_sha,
    reviewers,
    team_reviewers: teamReviewers,
    status_surface_ids: statusSurfaceIds,
    ...(input.mergeability_lease_id?.trim() ? { mergeability_lease_id: input.mergeability_lease_id.trim() } : {}),
    frozen_context: [
      ...input.handoff.decisive_evidence,
      ...statusSurfaceIds.map((surfaceId) => `status surface ${surfaceId}`),
      ...(input.mergeability_lease_id?.trim() ? [`mergeability lease ${input.mergeability_lease_id.trim()}`] : []),
    ],
    allowed_next_operations: [
      "request_pull_request_reviewers",
      "intake_review_response",
      "exact_external_blocker",
    ],
    forbidden_continuations: forbiddenContinuations,
  };

  return {
    ok: true,
    action: "compile_review_handoff_packet",
    packet,
    decisive_evidence: [
      ...evidence,
      `packet ${packetId}`,
      ...reviewers.map((reviewer) => `reviewer:${reviewer}`),
      ...teamReviewers.map((team) => `team:${team}`),
      ...statusSurfaceIds.map((surfaceId) => `status surface ${surfaceId}`),
      ...forbiddenContinuations.map((moveClass) => `forbidden:${moveClass}`),
    ],
    blockers: [],
    next_route:
      "use the packet for a live-head reviewer request or review-response intake; do not add another embodiment unless review, status, or mergeability changes",
  };
}
