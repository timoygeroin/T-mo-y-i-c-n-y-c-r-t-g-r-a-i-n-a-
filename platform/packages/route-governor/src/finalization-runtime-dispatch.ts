import type { ExternalWriteSurface } from "./external-write-surface.js";
import type { FinalizationDeliveryGateVerdict } from "./finalization-delivery-gate.js";

export type FinalizationRuntimeEffect =
  | "execute_external_embodiment_commit"
  | "publish_live_head_status_readback"
  | "publish_exact_external_blocker"
  | "block_runtime_dispatch";

export interface FinalizationRuntimeDispatchInput {
  repository_full_name: string;
  active_pr: number;
  active_branch: string;
  live_head_sha: string;
  delivery: FinalizationDeliveryGateVerdict;
  available_write_surfaces: ExternalWriteSurface[];
  runtime_class: string;
  spent_runtime_classes: string[];
  runtime_artifacts: string[];
  executor_artifacts: string[];
  proof_artifacts: string[];
}

export interface FinalizationRuntimeDispatchVerdict {
  ok: boolean;
  effect: FinalizationRuntimeEffect;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  command_plan: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const EMBODIMENT_WRITE_SURFACES = new Set<ExternalWriteSurface>([
  "github_contents_create_file",
  "github_contents_update_file",
  "local_git_push",
  "connector_branch_ref_update",
]);

function usableWriteSurfaces(surfaces: ExternalWriteSurface[]): ExternalWriteSurface[] {
  return surfaces.filter((surface) => EMBODIMENT_WRITE_SURFACES.has(surface));
}

function base(input: FinalizationRuntimeDispatchInput): Pick<
  FinalizationRuntimeDispatchVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.active_pr,
    branch: input.delivery.branch,
    head_sha: input.delivery.head_sha,
  };
}

function block(input: FinalizationRuntimeDispatchInput, blockers: string[], nextRoute: string): FinalizationRuntimeDispatchVerdict {
  return {
    ...base(input),
    ok: false,
    effect: "block_runtime_dispatch",
    command_plan: [],
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function runtimeCompletenessBlockers(input: FinalizationRuntimeDispatchInput): string[] {
  const blockers: string[] = [];

  if (!input.runtime_class.trim()) blockers.push("runtime dispatch has no runtime class");
  if (input.spent_runtime_classes.includes(input.runtime_class)) {
    blockers.push(`runtime class already spent: ${input.runtime_class}`);
  }
  if (input.runtime_artifacts.length === 0) blockers.push("runtime dispatch has no runtime artifact");
  if (input.executor_artifacts.length === 0) blockers.push("runtime dispatch has no executor artifact");
  if (input.proof_artifacts.length === 0) blockers.push("runtime dispatch has no proof artifact");

  return blockers;
}

export function compileFinalizationRuntimeDispatch(
  input: FinalizationRuntimeDispatchInput,
): FinalizationRuntimeDispatchVerdict {
  if (input.delivery.branch !== input.active_branch) {
    return block(
      input,
      [`delivery branch ${input.delivery.branch} does not match active branch ${input.active_branch}`],
      "rebind runtime dispatch to the active PR branch before execution",
    );
  }

  if (input.delivery.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`delivery head ${input.delivery.head_sha} does not match live head ${input.live_head_sha}`],
      "read the live PR head before dispatching finalization output",
    );
  }

  if (!input.delivery.ok) {
    return block(
      input,
      input.delivery.blockers.length > 0 ? input.delivery.blockers : ["delivery gate did not produce publishable progress"],
      "repair the delivery gate verdict before runtime dispatch",
    );
  }

  if (input.delivery.action === "publish_external_embodiment_to_pr") {
    const writable = usableWriteSurfaces(input.available_write_surfaces);
    const blockers = runtimeCompletenessBlockers(input);

    if (writable.length === 0) {
      blockers.push("external embodiment dispatch has no branch write surface");
    }

    if (blockers.length > 0) {
      return block(input, blockers, "complete the runtime executor artifact and branch write surface before dispatch");
    }

    return {
      ...base(input),
      ok: true,
      effect: "execute_external_embodiment_commit",
      command_plan: [
        `target ${input.repository_full_name}#${input.active_pr}`,
        `write ${input.active_branch}@${input.live_head_sha} through ${writable[0]}`,
        `execute runtime class ${input.runtime_class}`,
      ],
      decisive_evidence: [
        input.runtime_class,
        ...writable.map((surface) => `write surface ${surface}`),
        ...input.runtime_artifacts,
        ...input.executor_artifacts,
        ...input.proof_artifacts,
        ...input.delivery.decisive_evidence,
      ],
      blockers: [],
      next_route: "execute the external embodiment commit, then read only the moved-head status surface",
    };
  }

  if (input.delivery.action === "publish_live_head_status_to_pr") {
    return {
      ...base(input),
      ok: true,
      effect: "publish_live_head_status_readback",
      command_plan: [
        `target ${input.repository_full_name}#${input.active_pr}`,
        `publish live-head status readback for ${input.live_head_sha}`,
      ],
      decisive_evidence: input.delivery.decisive_evidence,
      blockers: [],
      next_route: "after publishing status readback, choose a non-repeated runtime or embodiment class",
    };
  }

  if (input.delivery.action === "publish_exact_blocker_to_pr") {
    return {
      ...base(input),
      ok: true,
      effect: "publish_exact_external_blocker",
      command_plan: [`target ${input.repository_full_name}#${input.active_pr}`, "publish exact PR-bound blocker"],
      decisive_evidence: input.delivery.decisive_evidence,
      blockers: input.delivery.blockers,
      next_route: "do not advance until the exact external blocker is removed",
    };
  }

  return block(
    input,
    [`delivery action is not runtime-dispatchable: ${input.delivery.action}`],
    "return to delivery gating before runtime dispatch",
  );
}
