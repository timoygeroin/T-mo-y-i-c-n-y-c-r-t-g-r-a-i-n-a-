import type { ReviewCycleExitVerdict } from "./review-cycle-exit-router.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";
import type { ReviewTargetPolicyVerdict } from "./review-target-policy.js";

export type PostReadyStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";

export type PostReadyReviewWindowAction =
  | "request_review_on_live_head"
  | "route_to_review_response_wait"
  | "route_to_review_repair"
  | "route_to_merge_gate"
  | "route_to_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_unready_pr"
  | "block_stale_surface"
  | "block_missing_review_target"
  | "block_incomplete_embodiment";

export interface PostReadySurface {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  status_verdict: PostReadyStatusVerdict;
  status_surface_id: string;
  decisive_successes: string[];
  warnings: string[];
  blocker_ids_retired: string[];
  pr_ready: boolean;
  mergeable: boolean | "unknown" | null;
}

export interface PostReadyEmbodimentCandidate {
  candidate_id: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  spent_artifact_classes: string[];
}

export interface PostReadyReviewWindowInput {
  surface: PostReadySurface;
  candidate_branch: string;
  review_targets?: ReviewTargetPolicyVerdict;
  review_response?: ReviewResponseIntakeVerdict;
  review_exit?: ReviewCycleExitVerdict;
  embodiment?: PostReadyEmbodimentCandidate;
  exact_external_blocker?: string;
}

export interface PostReadyReviewWindowVerdict {
  ok: boolean;
  action: PostReadyReviewWindowAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  retired_heads: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: PostReadyReviewWindowInput): Pick<
  PostReadyReviewWindowVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings" | "retired_heads"
> {
  const retiredHeads = input.surface.repaired_head_sha === input.surface.live_head_sha
    ? []
    : [input.surface.repaired_head_sha];

  return {
    repository_full_name: input.surface.repository_full_name,
    pr_number: input.surface.pr_number,
    branch: input.surface.branch,
    head_sha: input.surface.live_head_sha,
    warnings: input.surface.warnings,
    retired_heads: retiredHeads,
  };
}

function surfaceEvidence(surface: PostReadySurface): string[] {
  return [
    `live head ${surface.live_head_sha}`,
    `status surface ${surface.status_surface_id}`,
    ...surface.decisive_successes,
    ...surface.blocker_ids_retired.map((id) => `retired blocker ${id}`),
  ];
}

function block(
  input: PostReadyReviewWindowInput,
  action: Exclude<
    PostReadyReviewWindowAction,
    | "request_review_on_live_head"
    | "route_to_review_response_wait"
    | "route_to_review_repair"
    | "route_to_merge_gate"
    | "route_to_external_embodiment"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostReadyReviewWindowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function passing(surface: PostReadySurface): boolean {
  return (
    (surface.status_verdict === "passing" || surface.status_verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0
  );
}

function embodimentBlockers(candidate: PostReadyEmbodimentCandidate | undefined): string[] {
  if (!candidate) return ["post-ready embodiment route has no candidate"];

  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("post-ready embodiment candidate has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("post-ready embodiment candidate has no artifact class");
  if (candidate.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`post-ready embodiment artifact class already spent: ${candidate.artifact_class}`);
  }
  if (executableChanges.length === 0) blockers.push("post-ready embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("post-ready embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("post-ready embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-ready embodiment has no routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-ready embodiment has no proof artifact evidence");

  return blockers;
}

function admitEmbodiment(
  input: PostReadyReviewWindowInput,
  evidence: string[],
): PostReadyReviewWindowVerdict {
  const blockers = embodimentBlockers(input.embodiment);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply a behavior-bearing executable post-ready embodiment or provide a real review target",
      evidence,
    );
  }

  const candidate = input.embodiment;
  if (!candidate) {
    return block(input, "block_incomplete_embodiment", ["post-ready embodiment route has no candidate"], "supply a candidate");
  }

  return {
    ...base(input),
    ok: true,
    action: "route_to_external_embodiment",
    decisive_evidence: [
      ...evidence,
      candidate.candidate_id,
      candidate.artifact_class,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the post-ready embodiment, then bind the next status readback to the moved live head",
  };
}

export function routePostReadyReviewWindow(input: PostReadyReviewWindowInput): PostReadyReviewWindowVerdict {
  const evidence = surfaceEvidence(input.surface);
  const exactBlocker = input.exact_external_blocker?.trim();

  if (input.candidate_branch !== input.surface.branch) {
    return block(
      input,
      "block_stale_surface",
      [`candidate branch ${input.candidate_branch} does not match ready PR branch ${input.surface.branch}`],
      "re-enter the post-ready window from the live PR branch before choosing a route",
      evidence,
    );
  }

  if (exactBlocker) {
    return block(
      input,
      "emit_exact_external_blocker",
      [exactBlocker],
      "remove the named external blocker before post-ready review-window routing",
      evidence,
    );
  }

  if (!input.surface.pr_ready || !passing(input.surface)) {
    return block(
      input,
      "block_unready_pr",
      [
        ...(!input.surface.pr_ready ? ["PR is not ready for review"] : []),
        ...(!passing(input.surface) ? [`post-ready status is ${input.surface.status_verdict}`] : []),
      ],
      "do not enter the post-ready review window until the PR is ready and status is passing on the live head",
      evidence,
    );
  }

  if (input.review_exit) {
    if (input.review_exit.head_sha !== input.surface.live_head_sha) {
      return block(
        input,
        "block_stale_surface",
        [`review exit head ${input.review_exit.head_sha} is not live head ${input.surface.live_head_sha}`],
        "discard stale review exit evidence and re-enter from the live PR head",
        evidence,
      );
    }

    if (input.review_exit.ok && input.review_exit.action === "route_to_merge_gate") {
      return {
        ...base(input),
        ok: true,
        action: "route_to_merge_gate",
        decisive_evidence: [...evidence, ...input.review_exit.decisive_evidence],
        blockers: [],
        next_route: "compile the guarded GitHub merge command only while the live head still matches",
      };
    }

    return block(
      input,
      input.review_exit.action === "route_to_review_repair" ? "block_unready_pr" : "emit_exact_external_blocker",
      input.review_exit.blockers,
      input.review_exit.next_route,
      [...evidence, ...input.review_exit.decisive_evidence],
    );
  }

  if (input.review_response) {
    if (input.review_response.head_sha !== input.surface.live_head_sha) {
      return block(
        input,
        "block_stale_surface",
        [`review response head ${input.review_response.head_sha} is not live head ${input.surface.live_head_sha}`],
        "discard stale review response evidence and re-enter from the live PR head",
        evidence,
      );
    }

    if (input.review_response.action === "route_to_review_repair") {
      return {
        ...base(input),
        ok: false,
        action: "route_to_review_repair",
        decisive_evidence: [...evidence, ...input.review_response.decisive_evidence],
        blockers: input.review_response.blockers,
        next_route: input.review_response.next_route,
      };
    }

    if (input.review_response.action === "route_to_merge_gate" && input.review_response.ok) {
      return {
        ...base(input),
        ok: true,
        action: "route_to_merge_gate",
        decisive_evidence: [...evidence, ...input.review_response.decisive_evidence],
        blockers: [],
        next_route: "enter review-cycle exit with live-head status and mergeability still current",
      };
    }

    return {
      ...base(input),
      ok: false,
      action: "route_to_review_response_wait",
      decisive_evidence: [...evidence, ...input.review_response.decisive_evidence],
      blockers: input.review_response.blockers,
      next_route: input.review_response.next_route,
    };
  }

  if (input.review_targets?.ok && input.review_targets.action === "admit_external_review_targets") {
    if (input.review_targets.head_sha !== input.surface.live_head_sha) {
      return block(
        input,
        "block_stale_surface",
        [`review target policy head ${input.review_targets.head_sha} is not live head ${input.surface.live_head_sha}`],
        "refresh review targets against the live PR head",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "request_review_on_live_head",
      decisive_evidence: [...evidence, ...input.review_targets.decisive_evidence],
      blockers: [],
      next_route: "compile and execute the guarded GitHub review request command for the admitted targets",
    };
  }

  if (input.embodiment) {
    return admitEmbodiment(input, evidence);
  }

  return block(
    input,
    "block_missing_review_target",
    input.review_targets?.blockers.length
      ? input.review_targets.blockers
      : ["post-ready PR has no admitted external reviewer target and no non-repeated embodiment candidate"],
    "provide a real external reviewer target, a live review response surface, a non-repeated executable embodiment, or one exact external blocker",
    evidence,
  );
}
