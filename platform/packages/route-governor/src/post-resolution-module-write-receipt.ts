import type {
  PostResolutionPlatformModuleId,
  PostResolutionPlatformModuleSelectorVerdict,
} from "./post-resolution-platform-module-selector.js";

export type PostResolutionModuleWriteAction =
  | "compile_post_resolution_module_write_receipt"
  | "compile_post_resolution_exact_blocker_receipt"
  | "block_unselected_module_write"
  | "block_stale_write_base"
  | "block_unmoved_write_head"
  | "block_spent_write"
  | "block_proof_only_write"
  | "block_missing_module_boundary"
  | "block_incomplete_write_receipt";

export interface PostResolutionModuleWriteReceiptInput {
  active_branch: string;
  live_head_sha: string;
  resulting_head_sha: string;
  write_id: string;
  spent_write_ids: string[];
  selector: PostResolutionPlatformModuleSelectorVerdict;
  changed_files: string[];
  behavior_exports: string[];
  package_boundary_files: string[];
  proof_artifacts: string[];
}

export interface PostResolutionModuleWriteReceipt {
  ok: boolean;
  action: PostResolutionModuleWriteAction;
  write_id: string | null;
  module_id: PostResolutionPlatformModuleId | null;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  required_status_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const MODULE_PATHS: Record<PostResolutionPlatformModuleId, string> = {
  route_governor: "platform/packages/route-governor/",
  processor_fabric: "platform/packages/processor-fabric/",
  proof_evaluation: "platform/packages/proof-evaluation/",
  corpus_memory: "platform/packages/corpus-memory/",
  manifestation_engine: "platform/packages/manifestation-engine/",
};

function executablePath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function modulePath(moduleId: PostResolutionPlatformModuleId): string {
  return MODULE_PATHS[moduleId];
}

function behaviorFiles(input: PostResolutionModuleWriteReceiptInput, moduleId: PostResolutionPlatformModuleId): string[] {
  const prefix = modulePath(moduleId);
  return input.changed_files.filter((path) => path.startsWith(prefix) && executablePath(path) && !proofOnlyPath(path));
}

function requiredBoundaryFiles(moduleId: PostResolutionPlatformModuleId): string[] {
  if (moduleId === "route_governor") return [];
  const prefix = modulePath(moduleId);
  return [`${prefix}package.json`, `${prefix}tsconfig.json`, `${prefix}src/index.ts`];
}

function missingBoundaryFiles(input: PostResolutionModuleWriteReceiptInput, moduleId: PostResolutionPlatformModuleId): string[] {
  const supplied = new Set([...input.changed_files, ...input.package_boundary_files]);
  return requiredBoundaryFiles(moduleId).filter((path) => !supplied.has(path));
}

function baseReceipt(
  input: PostResolutionModuleWriteReceiptInput,
  action: PostResolutionModuleWriteAction,
  moduleId: PostResolutionPlatformModuleId | null,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): PostResolutionModuleWriteReceipt {
  return {
    ok: false,
    action,
    write_id: input.write_id.trim() || null,
    module_id: moduleId,
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    resulting_head_sha: input.resulting_head_sha,
    required_status_head_sha: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compilePostResolutionModuleWriteReceipt(
  input: PostResolutionModuleWriteReceiptInput,
): PostResolutionModuleWriteReceipt {
  const writeId = input.write_id.trim();
  const selected = input.selector.selected;

  if (!writeId || input.spent_write_ids.includes(writeId)) {
    return baseReceipt(
      input,
      "block_spent_write",
      selected?.module_id ?? null,
      [writeId ? `post-resolution write already spent: ${writeId}` : "post-resolution write has no id"],
      "choose a fresh write id before recording another post-resolution module embodiment",
    );
  }

  if (!input.selector.ok || !selected) {
    return baseReceipt(
      input,
      "block_unselected_module_write",
      null,
      ["post-resolution selector did not admit a module or blocker"],
      "run the post-resolution platform module selector before compiling a write receipt",
      input.selector.blockers,
    );
  }

  if (input.selector.branch !== input.active_branch) {
    return baseReceipt(
      input,
      "block_stale_write_base",
      selected.module_id,
      [`selector branch ${input.selector.branch} is not active branch ${input.active_branch}`],
      "refresh the selector against the active branch before writing",
      selected.decisive_evidence,
    );
  }

  if (input.selector.head_sha !== input.live_head_sha) {
    return baseReceipt(
      input,
      "block_stale_write_base",
      selected.module_id,
      [`selector head ${input.selector.head_sha} is not live head ${input.live_head_sha}`],
      "refresh the selector against the live PR head before writing",
      selected.decisive_evidence,
    );
  }

  if (selected.progress_class === "exact_external_blocker") {
    return {
      ok: true,
      action: "compile_post_resolution_exact_blocker_receipt",
      write_id: writeId,
      module_id: null,
      branch: input.active_branch,
      base_head_sha: input.live_head_sha,
      resulting_head_sha: input.resulting_head_sha,
      required_status_head_sha: null,
      decisive_evidence: selected.decisive_evidence,
      blockers: selected.decisive_evidence,
      next_route: "remove the exact external blocker before attempting a module write",
    };
  }

  const moduleId = selected.module_id;
  if (!moduleId) {
    return baseReceipt(
      input,
      "block_unselected_module_write",
      null,
      ["selected platform embodiment has no module id"],
      "select a concrete platform module before writing",
      selected.decisive_evidence,
    );
  }

  if (input.resulting_head_sha === input.live_head_sha) {
    return baseReceipt(
      input,
      "block_unmoved_write_head",
      moduleId,
      ["post-resolution module write did not move the PR head"],
      "perform an external write that moves the PR head before compiling a receipt",
      selected.decisive_evidence,
    );
  }

  const behavior = behaviorFiles(input, moduleId);
  if (behavior.length === 0) {
    return baseReceipt(
      input,
      "block_proof_only_write",
      moduleId,
      [`post-resolution write changes no behavior-bearing file under ${modulePath(moduleId)}`],
      "add a behavior-bearing module file before proof or export wiring can count",
      [...selected.decisive_evidence, ...input.changed_files],
    );
  }

  const missingBoundary = missingBoundaryFiles(input, moduleId);
  if (missingBoundary.length > 0) {
    return baseReceipt(
      input,
      "block_missing_module_boundary",
      moduleId,
      missingBoundary.map((path) => `missing module boundary file: ${path}`),
      "create the package boundary files required for the selected platform module",
      [...selected.decisive_evidence, ...input.changed_files, ...input.package_boundary_files],
    );
  }

  const incomplete: string[] = [];
  if (input.behavior_exports.length === 0) incomplete.push("post-resolution module write has no behavior export");
  if (input.proof_artifacts.length === 0) incomplete.push("post-resolution module write has no proof artifact");
  if (incomplete.length > 0) {
    return baseReceipt(
      input,
      "block_incomplete_write_receipt",
      moduleId,
      incomplete,
      "attach behavior exports and proof artifacts before the write can become a receipt",
      [...selected.decisive_evidence, ...behavior],
    );
  }

  return {
    ok: true,
    action: "compile_post_resolution_module_write_receipt",
    write_id: writeId,
    module_id: moduleId,
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    resulting_head_sha: input.resulting_head_sha,
    required_status_head_sha: input.resulting_head_sha,
    decisive_evidence: [
      ...selected.decisive_evidence,
      `write:${writeId}`,
      ...behavior,
      ...input.behavior_exports,
      ...input.package_boundary_files,
      ...input.proof_artifacts,
    ],
    blockers: [],
    next_route: "read only the moved resulting head status before review, merge, or another embodiment consumes this write",
  };
}
