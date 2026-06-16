export type ManifestationHandoffIntent =
  | "merge_after_review"
  | "repair_after_review"
  | "wait_for_review"
  | "continue_embodiment"
  | "emit_exact_blocker";

export type ManifestationHandoffAction =
  | "compile_merge_handoff_packet"
  | "compile_repair_handoff_packet"
  | "compile_wait_handoff_packet"
  | "compile_embodiment_handoff_packet"
  | "compile_blocker_handoff_packet"
  | "block_stale_packet_head"
  | "block_repeated_packet"
  | "block_unready_handoff";

export interface ManifestationHandoffStatus {
  head_sha: string;
  verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";
  blocking_surfaces: string[];
  warning_surfaces: string[];
}

export interface ManifestationHandoffReview {
  head_sha: string;
  approvals: string[];
  change_requests: string[];
  pending_reviewers: string[];
}

export interface ManifestationHandoffEmbodiment {
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface ManifestationHandoffPacketInput {
  packet_id: string;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  expected_head_sha: string;
  intent: ManifestationHandoffIntent;
  status: ManifestationHandoffStatus;
  review: ManifestationHandoffReview;
  embodiment?: ManifestationHandoffEmbodiment;
  exact_blocker?: string;
  spent_packet_ids: string[];
}

export interface ManifestationHandoffPacket {
  ok: boolean;
  action: ManifestationHandoffAction;
  packet_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  command: "merge_pull_request" | "repair_review_changes" | "wait_for_external_review" | "commit_external_embodiment" | "emit_exact_blocker" | "none";
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function stable(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function statusGreen(status: ManifestationHandoffStatus): boolean {
  return status.verdict === "passing" || status.verdict === "passing_with_warnings";
}

function base(input: ManifestationHandoffPacketInput): Pick<
  ManifestationHandoffPacket,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: stable(input.status.warning_surfaces),
  };
}

function block(
  input: ManifestationHandoffPacketInput,
  action: Extract<ManifestationHandoffAction, "block_stale_packet_head" | "block_repeated_packet" | "block_unready_handoff">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ManifestationHandoffPacket {
  return {
    ...base(input),
    ok: false,
    action,
    packet_id: null,
    command: "none",
    decisive_evidence: [
      `packet ${input.packet_id || "<none>"}`,
      `expected head ${input.expected_head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(embodiment?: ManifestationHandoffEmbodiment): string[] {
  if (!embodiment) return ["handoff embodiment packet has no embodiment payload"];

  const executableChanges = embodiment.changed_files.filter(executablePlatformPath);
  const behaviorChanges = embodiment.changed_files.filter(behaviorPath);
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("handoff embodiment changes no executable platform file");
  if (behaviorChanges.length === 0) blockers.push("handoff embodiment is proof-only and has no behavior file");
  if (embodiment.executable_artifacts.length === 0) blockers.push("handoff embodiment has no executable artifact");
  if (embodiment.routing_artifacts.length === 0) blockers.push("handoff embodiment has no routing artifact");
  if (embodiment.proof_artifacts.length === 0) blockers.push("handoff embodiment has no proof artifact");

  return blockers;
}

function packet(
  input: ManifestationHandoffPacketInput,
  action: Exclude<ManifestationHandoffAction, "block_stale_packet_head" | "block_repeated_packet" | "block_unready_handoff">,
  command: Exclude<ManifestationHandoffPacket["command"], "none">,
  evidence: string[],
  nextRoute: string,
  blockers: string[] = [],
): ManifestationHandoffPacket {
  return {
    ...base(input),
    ok: blockers.length === 0,
    action,
    packet_id: input.packet_id.trim(),
    command,
    decisive_evidence: stable([`packet ${input.packet_id}`, `live head ${input.live_head_sha}`, ...evidence]),
    blockers,
    next_route: nextRoute,
  };
}

export function compileManifestationHandoffPacket(
  input: ManifestationHandoffPacketInput,
): ManifestationHandoffPacket {
  const packetId = input.packet_id.trim();

  if (input.expected_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_packet_head",
      [`handoff expected head ${input.expected_head_sha} is not live head ${input.live_head_sha}`],
      "recompile the handoff packet from the live PR head before issuing the next command",
    );
  }

  if (input.status.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_packet_head",
      [`status surface head ${input.status.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale status before compiling a manifestation handoff packet",
    );
  }

  if (input.review.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_packet_head",
      [`review surface head ${input.review.head_sha} is not live head ${input.live_head_sha}`],
      "discard stale review surfaces before compiling a manifestation handoff packet",
    );
  }

  if (!packetId || input.spent_packet_ids.includes(packetId)) {
    return block(
      input,
      "block_repeated_packet",
      [packetId ? `manifestation handoff packet already spent: ${packetId}` : "manifestation handoff packet has no id"],
      "issue a new packet id only after live state or intended command changes",
    );
  }

  if (input.intent === "emit_exact_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_unready_handoff",
        ["exact blocker handoff has no blocker text"],
        "name one exact external blocker or choose a different handoff intent",
      );
    }

    return packet(
      input,
      "compile_blocker_handoff_packet",
      "emit_exact_blocker",
      [blocker],
      "remove the named blocker before compiling another manifestation handoff packet",
      [blocker],
    );
  }

  if (input.intent === "continue_embodiment") {
    const blockers = embodimentBlockers(input.embodiment);
    if (blockers.length > 0) {
      return block(
        input,
        "block_unready_handoff",
        blockers,
        "supply a behavior-bearing executable embodiment payload before handoff",
      );
    }

    const embodiment = input.embodiment as ManifestationHandoffEmbodiment;
    return packet(
      input,
      "compile_embodiment_handoff_packet",
      "commit_external_embodiment",
      [
        ...embodiment.changed_files.filter(executablePlatformPath),
        ...embodiment.executable_artifacts,
        ...embodiment.routing_artifacts,
        ...embodiment.proof_artifacts,
      ],
      "commit the embodiment and bind the next status readback to the moved head only",
    );
  }

  if (input.review.change_requests.length > 0) {
    return packet(
      input,
      "compile_repair_handoff_packet",
      "repair_review_changes",
      input.review.change_requests.map((reviewer) => `changes requested by ${reviewer}`),
      "repair live-head review changes before merge or further embodiment",
      input.review.change_requests.map((reviewer) => `review changes requested by ${reviewer}`),
    );
  }

  if (input.intent === "merge_after_review") {
    if (!statusGreen(input.status)) {
      return block(
        input,
        "block_unready_handoff",
        [`live-head status is ${input.status.verdict}`, ...input.status.blocking_surfaces],
        "obtain passing live-head status before compiling a merge handoff packet",
      );
    }

    if (input.review.approvals.length === 0) {
      return block(
        input,
        "block_unready_handoff",
        ["merge handoff requires at least one live-head approval"],
        "wait for review approval or route to a non-merge handoff packet",
      );
    }

    return packet(
      input,
      "compile_merge_handoff_packet",
      "merge_pull_request",
      [
        `status ${input.status.verdict}`,
        ...input.review.approvals.map((reviewer) => `approved by ${reviewer}`),
      ],
      "issue a guarded merge command only for this live head",
    );
  }

  if (input.intent === "repair_after_review") {
    return block(
      input,
      "block_unready_handoff",
      ["repair handoff was requested but no live-head change request is present"],
      "use wait, merge, embodiment, or exact blocker handoff according to the current live surface",
    );
  }

  return packet(
    input,
    "compile_wait_handoff_packet",
    "wait_for_external_review",
    input.review.pending_reviewers.map((reviewer) => `pending review by ${reviewer}`),
    "wait for the named live-head review response before merge routing",
    input.review.pending_reviewers.length > 0 ? ["required review response has not surfaced"] : [],
  );
}
