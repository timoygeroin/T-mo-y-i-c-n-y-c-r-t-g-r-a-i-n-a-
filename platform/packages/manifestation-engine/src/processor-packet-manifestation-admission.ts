export type ProcessorPacketManifestationTarget =
  | "github_contents_write"
  | "exact_external_blocker"
  | "fresh_status_readback"
  | "metadata_reread"
  | "duplicate_comment"
  | "local_memory_guard"
  | "proof_only_change";

export type ProcessorPacketManifestationAction =
  | "admit_processor_packet_manifestation_write"
  | "emit_processor_packet_exact_blocker"
  | "block_missing_admission_id"
  | "block_reused_packet"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_non_progress_target"
  | "block_incomplete_packet"
  | "block_missing_external_target";

export interface ProcessorPacketManifestationFile {
  path: string;
  behavior_export: string;
  routing_effect: string;
}

export interface ProcessorPacketManifestationPacket {
  packet_id: string;
  branch: string;
  base_head_sha: string;
  accepted_output: string;
  semantic_signature: string;
  changed_files: string[];
  behavior_exports: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  guard: {
    require_live_head_sha: string;
    forbidden_targets: ProcessorPacketManifestationTarget[];
  };
}

export interface ProcessorPacketManifestationAdmissionInput {
  admission_id: string;
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  live_head_sha: string;
  spent_packet_ids: string[];
  target: ProcessorPacketManifestationTarget;
  packet?: ProcessorPacketManifestationPacket;
  exact_blocker?: string;
}

export interface ProcessorPacketManifestationWriteCommand {
  admission_id: string;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  base_head_sha: string;
  packet_id: string;
  semantic_signature: string;
  files: ProcessorPacketManifestationFile[];
  proof_artifacts: string[];
  guard: {
    require_live_head_sha: string;
    forbidden_targets: ProcessorPacketManifestationTarget[];
  };
}

export interface ProcessorPacketManifestationAdmissionVerdict {
  ok: boolean;
  action: ProcessorPacketManifestationAction;
  command: ProcessorPacketManifestationWriteCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_TARGETS = new Set<ProcessorPacketManifestationTarget>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_comment",
  "local_memory_guard",
  "proof_only_change",
]);

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function behaviorFiles(packet: ProcessorPacketManifestationPacket): string[] {
  return packet.changed_files.filter((path) => executablePlatformPath(path) && !proofOnlyPath(path));
}

function evidence(input: ProcessorPacketManifestationAdmissionInput): string[] {
  return unique([
    `admission ${input.admission_id || "<missing>"}`,
    `target ${input.repository_full_name}#${input.pr_number}`,
    `branch ${input.active_branch}`,
    `live head ${input.live_head_sha}`,
    input.packet?.packet_id ?? "",
    input.packet?.semantic_signature ?? "",
    ...(input.packet?.changed_files ?? []),
    ...(input.packet?.behavior_exports ?? []),
    ...(input.packet?.routing_artifacts ?? []),
    ...(input.packet?.proof_artifacts ?? []),
  ]);
}

function block(
  input: ProcessorPacketManifestationAdmissionInput,
  action: Exclude<
    ProcessorPacketManifestationAction,
    "admit_processor_packet_manifestation_write" | "emit_processor_packet_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): ProcessorPacketManifestationAdmissionVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: evidence(input),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

export function admitProcessorPacketManifestation(
  input: ProcessorPacketManifestationAdmissionInput,
): ProcessorPacketManifestationAdmissionVerdict {
  const admissionId = clean(input.admission_id);
  const blocker = clean(input.exact_blocker ?? "");

  if (!admissionId) {
    return block(input, "block_missing_admission_id", ["processor packet manifestation admission has no id"], "mint a fresh admission id before consuming a processor packet");
  }

  if (!input.repository_full_name.trim() || !Number.isInteger(input.pr_number) || input.pr_number < 1) {
    return block(input, "block_missing_external_target", ["processor packet admission has no valid GitHub PR target"], "bind the packet to a concrete GitHub repository and PR before manifestation");
  }

  if (input.target === "exact_external_blocker" || blocker) {
    if (!blocker) {
      return block(input, "block_incomplete_packet", ["exact blocker target has no blocker text"], "name the exact processor-packet manifestation blocker");
    }

    return {
      ok: true,
      action: "emit_processor_packet_exact_blocker",
      command: null,
      decisive_evidence: [...evidence(input), blocker],
      blockers: [blocker],
      next_route: "remove the named processor-packet blocker before admitting another manifestation write",
    };
  }

  if (NON_PROGRESS_TARGETS.has(input.target)) {
    return block(input, "block_non_progress_target", [`processor packet target is non-progress: ${input.target}`], "admit only a GitHub contents write or one exact external blocker");
  }

  if (input.target !== "github_contents_write") {
    return block(input, "block_non_progress_target", [`unsupported processor packet target: ${input.target}`], "route processor packets only to GitHub contents writes unless blocked exactly");
  }

  const packet = input.packet;
  if (!packet) {
    return block(input, "block_incomplete_packet", ["processor packet admission has no packet"], "attach the processor release packet before manifestation admission");
  }

  if (input.spent_packet_ids.includes(packet.packet_id)) {
    return block(input, "block_reused_packet", [`processor packet already spent: ${packet.packet_id}`], "compile a fresh processor packet for the live PR head");
  }

  if (packet.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`packet branch ${packet.branch} is not ${input.active_branch}`], "discard cross-branch processor packets before manifestation admission");
  }

  if (packet.base_head_sha !== input.live_head_sha || packet.guard.require_live_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [
        ...(packet.base_head_sha !== input.live_head_sha ? [`packet base ${packet.base_head_sha} is not live head ${input.live_head_sha}`] : []),
        ...(packet.guard.require_live_head_sha !== input.live_head_sha
          ? [`packet guard requires ${packet.guard.require_live_head_sha}, not live head ${input.live_head_sha}`]
          : []),
      ],
      "rebuild processor packet manifestation from the live PR head",
    );
  }

  if (packet.guard.forbidden_targets.includes(input.target)) {
    return block(input, "block_non_progress_target", [`packet guard forbids target ${input.target}`], "choose a target allowed by the processor packet guard");
  }

  const behavior = behaviorFiles(packet);
  if (!packet.packet_id.trim() || !packet.semantic_signature.trim() || !packet.accepted_output.trim()) {
    return block(input, "block_incomplete_packet", ["processor packet is missing id, semantic signature, or accepted output"], "complete packet identity before manifestation admission");
  }

  if (behavior.length === 0) {
    return block(input, "block_incomplete_packet", ["processor packet has no behavior-bearing executable file"], "include a non-proof executable platform file before GitHub contents manifestation");
  }

  if (packet.behavior_exports.length === 0 || packet.routing_artifacts.length === 0 || packet.proof_artifacts.length === 0) {
    return block(
      input,
      "block_incomplete_packet",
      [
        ...(packet.behavior_exports.length === 0 ? ["missing behavior export evidence"] : []),
        ...(packet.routing_artifacts.length === 0 ? ["missing routing artifact evidence"] : []),
        ...(packet.proof_artifacts.length === 0 ? ["missing proof artifact evidence"] : []),
      ],
      "complete behavior, routing, and proof evidence before GitHub contents manifestation",
    );
  }

  return {
    ok: true,
    action: "admit_processor_packet_manifestation_write",
    command: {
      admission_id: admissionId,
      repository_full_name: input.repository_full_name,
      pr_number: input.pr_number,
      branch: input.active_branch,
      base_head_sha: input.live_head_sha,
      packet_id: packet.packet_id,
      semantic_signature: packet.semantic_signature,
      files: behavior.map((path) => ({
        path,
        behavior_export: packet.behavior_exports[0] ?? packet.accepted_output,
        routing_effect: packet.routing_artifacts[0] ?? "moved-head status required after write",
      })),
      proof_artifacts: unique(packet.proof_artifacts),
      guard: {
        require_live_head_sha: input.live_head_sha,
        forbidden_targets: unique([...packet.guard.forbidden_targets, ...NON_PROGRESS_TARGETS]) as ProcessorPacketManifestationTarget[],
      },
    },
    decisive_evidence: evidence(input),
    blockers: [],
    next_route: "execute the admitted GitHub contents write once, then require status only for the moved head",
  };
}
