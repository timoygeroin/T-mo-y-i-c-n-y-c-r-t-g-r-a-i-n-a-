export type ProcessorLiveEmbodimentWorkOrderAction =
  | "compile_live_embodiment_work_order"
  | "settle_live_embodiment_exact_blocker"
  | "block_stale_work_order_head"
  | "block_branch_mismatch"
  | "block_duplicate_semantic_signature"
  | "block_proof_only_work_order"
  | "block_missing_work_order_evidence"
  | "block_missing_write_plan";

export interface ProcessorLiveEmbodimentWritePlan {
  path: string;
  operation: "create" | "update";
  behavior_export: string;
  routing_effect: string;
}

export interface ProcessorLiveEmbodimentCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  semantic_signature: string;
  write_plan: ProcessorLiveEmbodimentWritePlan[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  exact_blocker?: string;
}

export interface ProcessorLiveEmbodimentWorkOrderInput {
  active_branch: string;
  live_head_sha: string;
  spent_semantic_signatures: string[];
  candidate: ProcessorLiveEmbodimentCandidate;
}

export interface ProcessorLiveEmbodimentWorkOrder {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  semantic_signature: string;
  files: ProcessorLiveEmbodimentWritePlan[];
  guard: {
    require_live_head_sha: string;
    forbidden_progress_classes: string[];
  };
}

export interface ProcessorLiveEmbodimentWorkOrderVerdict {
  ok: boolean;
  action: ProcessorLiveEmbodimentWorkOrderAction;
  work_order: ProcessorLiveEmbodimentWorkOrder | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function block(
  action: Exclude<
    ProcessorLiveEmbodimentWorkOrderAction,
    "compile_live_embodiment_work_order" | "settle_live_embodiment_exact_blocker"
  >,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): ProcessorLiveEmbodimentWorkOrderVerdict {
  return {
    ok: false,
    action,
    work_order: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileProcessorLiveEmbodimentWorkOrder(
  input: ProcessorLiveEmbodimentWorkOrderInput,
): ProcessorLiveEmbodimentWorkOrderVerdict {
  const candidate = input.candidate;
  const signature = normalized(candidate.semantic_signature);
  const files = candidate.write_plan.filter((file) => executablePlatformPath(file.path));
  const behaviorFiles = files.filter((file) => !proofOnlyPath(file.path));
  const evidence = unique([
    `candidate ${candidate.candidate_id || "<missing>"}`,
    `signature ${signature || "<missing>"}`,
    `live head ${input.live_head_sha}`,
    ...candidate.write_plan.map((file) => file.path),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ]);

  if (candidate.branch !== input.active_branch) {
    return block(
      "block_branch_mismatch",
      evidence,
      [`candidate branch ${candidate.branch} is not active branch ${input.active_branch}`],
      "bind the processor work order to the active manifestation branch before writing",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      "block_stale_work_order_head",
      evidence,
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "discard stale-head work orders and rebuild the write plan from the live PR head",
    );
  }

  const exactBlocker = normalized(candidate.exact_blocker ?? "");
  if (exactBlocker) {
    return {
      ok: true,
      action: "settle_live_embodiment_exact_blocker",
      work_order: null,
      decisive_evidence: evidence,
      blockers: [exactBlocker],
      next_route: "release the exact live-head embodiment blocker before compiling another work order",
    };
  }

  if (!signature || input.spent_semantic_signatures.includes(signature)) {
    return block(
      "block_duplicate_semantic_signature",
      evidence,
      [signature ? `semantic signature already spent: ${signature}` : "work order has no semantic signature"],
      "synthesize a materially new live-head embodiment signature before writing",
    );
  }

  if (files.length === 0) {
    return block(
      "block_missing_write_plan",
      evidence,
      ["work order has no executable platform write path"],
      "attach at least one executable platform file write before claiming embodiment",
    );
  }

  if (behaviorFiles.length === 0) {
    return block(
      "block_proof_only_work_order",
      evidence,
      ["work order changes proof files only and no behavior-bearing source"],
      "add a behavior-bearing platform source write before proof can count as embodiment",
    );
  }

  if (candidate.executable_artifacts.length === 0 || candidate.routing_artifacts.length === 0 || candidate.proof_artifacts.length === 0) {
    return block(
      "block_missing_work_order_evidence",
      evidence,
      [
        ...(candidate.executable_artifacts.length === 0 ? ["missing executable artifact evidence"] : []),
        ...(candidate.routing_artifacts.length === 0 ? ["missing routing artifact evidence"] : []),
        ...(candidate.proof_artifacts.length === 0 ? ["missing proof artifact evidence"] : []),
      ],
      "complete executable, routing, and proof evidence before releasing the work order",
    );
  }

  return {
    ok: true,
    action: "compile_live_embodiment_work_order",
    work_order: {
      candidate_id: candidate.candidate_id,
      branch: candidate.branch,
      base_head_sha: candidate.base_head_sha,
      semantic_signature: signature,
      files,
      guard: {
        require_live_head_sha: input.live_head_sha,
        forbidden_progress_classes: [
          "metadata_reread",
          "duplicate_ci_summary",
          "duplicate_comment",
          "local_memory_guard",
          "repaired_head_blocker_reuse",
          "proof_only_change",
        ],
      },
    },
    decisive_evidence: evidence,
    blockers: [],
    next_route: "execute the work order only while the PR head still matches the live-head guard, then read status only for the moved head",
  };
}
