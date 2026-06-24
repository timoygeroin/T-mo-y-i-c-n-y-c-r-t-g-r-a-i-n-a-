export type StatusConclusion = "success" | "neutral" | "skipped" | "failure" | "timed_out" | "cancelled" | "action_required" | null;
export type StatusState = "queued" | "in_progress" | "completed" | "pending" | "success" | "failure" | "error";

export interface StatusRunSurface {
  id: string;
  name: string;
  status: StatusState;
  conclusion: StatusConclusion;
  head_sha?: string;
  html_url?: string;
}

export interface StatusSurfaceInput {
  expected_head_sha: string;
  check_runs: StatusRunSurface[];
  workflow_runs: StatusRunSurface[];
  notices: string[];
}

export type StatusReadbackVerdict = "passing_with_warnings" | "passing" | "pending" | "failing" | "no_status_surface";

export interface StatusSurfaceClassification {
  verdict: StatusReadbackVerdict;
  ok: boolean;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

const BLOCKING_CONCLUSIONS = new Set<StatusConclusion>(["failure", "timed_out", "cancelled", "action_required"]);
const PASSING_CONCLUSIONS = new Set<StatusConclusion>(["success", "neutral", "skipped"]);
const NODE20_DEPRECATION_PATTERN = /node\.js\s*20|node20|actions?\s+deprecation/i;

function runLabel(run: StatusRunSurface): string {
  return run.html_url ? `${run.name} (${run.id}) ${run.html_url}` : `${run.name} (${run.id})`;
}

function belongsToHead(run: StatusRunSurface, expectedHeadSha: string): boolean {
  return !run.head_sha || run.head_sha === expectedHeadSha;
}

export function isNode20ActionsDeprecationNotice(notice: string): boolean {
  return NODE20_DEPRECATION_PATTERN.test(notice);
}

export function classifyStatusSurface(input: StatusSurfaceInput): StatusSurfaceClassification {
  const decisive_successes: string[] = [];
  const blocking_failures: string[] = [];
  const pending_surfaces: string[] = [];
  const non_blocking_warnings = input.notices.filter(isNode20ActionsDeprecationNotice);
  const surfaces = [...input.check_runs, ...input.workflow_runs].filter((run) => belongsToHead(run, input.expected_head_sha));

  for (const surface of surfaces) {
    const label = runLabel(surface);

    if (surface.status !== "completed" || surface.conclusion === null) {
      pending_surfaces.push(label);
      continue;
    }

    if (BLOCKING_CONCLUSIONS.has(surface.conclusion)) {
      blocking_failures.push(`${label}: ${surface.conclusion}`);
      continue;
    }

    if (PASSING_CONCLUSIONS.has(surface.conclusion)) {
      decisive_successes.push(`${label}: ${surface.conclusion}`);
    }
  }

  if (blocking_failures.length > 0) {
    return { verdict: "failing", ok: false, decisive_successes, blocking_failures, pending_surfaces, non_blocking_warnings };
  }

  if (pending_surfaces.length > 0) {
    return { verdict: "pending", ok: false, decisive_successes, blocking_failures, pending_surfaces, non_blocking_warnings };
  }

  if (decisive_successes.length === 0) {
    return { verdict: "no_status_surface", ok: false, decisive_successes, blocking_failures, pending_surfaces, non_blocking_warnings };
  }

  return {
    verdict: non_blocking_warnings.length > 0 ? "passing_with_warnings" : "passing",
    ok: true,
    decisive_successes,
    blocking_failures,
    pending_surfaces,
    non_blocking_warnings,
  };
}
