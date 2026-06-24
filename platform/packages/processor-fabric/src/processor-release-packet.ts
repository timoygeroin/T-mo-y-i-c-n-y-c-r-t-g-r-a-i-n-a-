export type ProcessorReleasePacketTarget =
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "fresh_status_readback"
  | "metadata_reread"
  | "proof_only_change"
  | "local_memory_guard";

export type ProcessorReleasePacketAction =
  | "compile_processor_release_packet"
  | "emit_processor_release_blocker"
  | "block_missing_packet_id"
  | "block_reused_packet"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_non_progress_target"
  | "block_missing_convergence"
  | "block_missing_work_order"
  | "block_incomplete_packet";

export interface ProcessorReleaseConvergenceReceipt {
  ok: boolean;
  branch: string;
  head_sha: string;
  accepted_output: string | null;
  blockers: string[];
  decisive_evidence: string[];
}

export interface ProcessorReleaseWorkOrderFile {
  path: string;
  operation: "create" | "update";
  behavior_export: string;
  routing_effect: string;
}

export interface ProcessorReleaseWorkOrderReceipt {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  semantic_signature: string;
  files: ProcessorReleaseWorkOrderFile[];
  proof_artifacts: string[];
}

export interface ProcessorReleasePacketInput {
  active_branch: string;
  live_head_sha: string;
  packet_id: string;
  spent_packet_ids: string[];
  target: ProcessorReleasePacketTarget;
  convergence: ProcessorReleaseConvergenceReceipt;
  work_order?: ProcessorReleaseWorkOrderReceipt;
  exact_blocker?: string;
}

export interface ProcessorReleasePacket {
  packet_id: string;
  target: Extract<ProcessorReleasePacketTarget, "external_platform_embodiment">;
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
    forbidden_targets: ProcessorReleasePacketTarget[];
  };
}

export interface ProcessorReleasePacketVerdict {
  ok: boolean;
  action: ProcessorReleasePacketAction;
  packet: ProcessorReleasePacket | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_TARGETS = new Set<ProcessorReleasePacketTarget>([
  "fresh_status_readback",
  "metadata_reread",
  "proof_only_change",
  "local_memory_guard",
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

function behaviorFiles(workOrder: ProcessorReleaseWorkOrderReceipt): ProcessorReleaseWorkOrderFile[] {
  return workOrder.files.filter((file) => executablePlatformPath(file.path) && !proofOnlyPath(file.path));
}

function evidence(input: ProcessorReleasePacketInput): string[] {
  return unique([
    `packet ${input.packet_id || "<missing>"}`,
    `live head ${input.live_head_sha || "<missing>"}`,
    `convergence ${input.convergence.accepted_output ?? "<none>"}`,
    ...input.convergence.decisive_evidence,
    ...(input.work_order
      ? [
          input.work_order.candidate_id,
          input.work_order.semantic_signature,
          ...input.work_order.files.map((file) => file.path),
          ...input.work_order.files.map((file) => file.behavior_export),
          ...input.work_order.files.map((file) => file.routing_effect),
          ...input.work_order.proof_artifacts,
        ]
      : []),
  ]);
}

function block(
  input: ProcessorReleasePacketInput,
  action: Exclude<ProcessorReleasePacketAction, "compile_processor_release_packet" | "emit_processor_release_blocker">,
  blockers: string[],
  nextRoute: string,
): ProcessorReleasePacketVerdict {
  return {
    ok: false,
    action,
    packet: null,
    decisive_evidence: evidence(input),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

export function compileProcessorReleasePacket(input: ProcessorReleasePacketInput): ProcessorReleasePacketVerdict {
  const packetId = clean(input.packet_id);
  const exactBlocker = clean(input.exact_blocker ?? "");

  if (!packetId) {
    return block(input, "block_missing_packet_id", ["processor release packet has no id"], "mint a packet id before release handoff");
  }

  if (input.spent_packet_ids.includes(packetId)) {
    return block(input, "block_reused_packet", [`processor release packet already spent: ${packetId}`], "compile a fresh packet for the live PR head");
  }

  if (input.convergence.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`convergence branch ${input.convergence.branch} is not ${input.active_branch}`], "rerun convergence on the active PR branch");
  }

  if (input.convergence.head_sha !== input.live_head_sha) {
    return block(input, "block_wrong_head", [`convergence head ${input.convergence.head_sha} is not live head ${input.live_head_sha}`], "rerun convergence on the live PR head before packet release");
  }

  if (!input.convergence.ok || input.target === "exact_external_blocker" || exactBlocker) {
    const blockers = unique([exactBlocker, ...input.convergence.blockers, input.convergence.accepted_output ?? ""]);
    if (blockers.length === 0) {
      return block(input, "block_incomplete_packet", ["exact blocker packet has no blocker text"], "name the exact processor release blocker before release");
    }

    return {
      ok: true,
      action: "emit_processor_release_blocker",
      packet: null,
      decisive_evidence: evidence(input),
      blockers,
      next_route: "release the processor-settled blocker instead of packaging an embodiment",
    };
  }

  if (NON_PROGRESS_TARGETS.has(input.target)) {
    return block(input, "block_non_progress_target", [`processor release target is non-progress: ${input.target}`], "choose external embodiment or exact blocker only");
  }

  if (!input.convergence.accepted_output) {
    return block(input, "block_missing_convergence", ["processor convergence has no accepted output"], "settle one processor output before release packet compilation");
  }

  const workOrder = input.work_order;
  if (!workOrder) {
    return block(input, "block_missing_work_order", ["processor release packet has no live-head work order"], "attach a live-head work order before packaging embodiment release");
  }

  if (workOrder.branch !== input.active_branch) {
    return block(input, "block_wrong_branch", [`work order branch ${workOrder.branch} is not ${input.active_branch}`], "bind work order to the active PR branch");
  }

  if (workOrder.base_head_sha !== input.live_head_sha) {
    return block(input, "block_wrong_head", [`work order base ${workOrder.base_head_sha} is not live head ${input.live_head_sha}`], "rebuild the work order from the live PR head");
  }

  const behavior = behaviorFiles(workOrder);
  if (behavior.length === 0) {
    return block(input, "block_incomplete_packet", ["processor release packet has no behavior-bearing executable file"], "add a behavior-bearing executable write before proof can release");
  }

  if (workOrder.proof_artifacts.length === 0) {
    return block(input, "block_incomplete_packet", ["processor release packet has no proof artifact"], "attach a proof artifact before release packet handoff");
  }

  return {
    ok: true,
    action: "compile_processor_release_packet",
    packet: {
      packet_id: packetId,
      target: "external_platform_embodiment",
      branch: input.active_branch,
      base_head_sha: input.live_head_sha,
      accepted_output: input.convergence.accepted_output,
      semantic_signature: workOrder.semantic_signature,
      changed_files: unique(workOrder.files.map((file) => file.path)),
      behavior_exports: unique(behavior.map((file) => file.behavior_export)),
      routing_artifacts: unique(workOrder.files.map((file) => file.routing_effect)),
      proof_artifacts: unique(workOrder.proof_artifacts),
      guard: {
        require_live_head_sha: input.live_head_sha,
        forbidden_targets: ["fresh_status_readback", "metadata_reread", "proof_only_change", "local_memory_guard"],
      },
    },
    decisive_evidence: evidence(input),
    blockers: [],
    next_route: "handoff this packet as the only processor-selected embodiment candidate, then require moved-head status after write",
  };
}
