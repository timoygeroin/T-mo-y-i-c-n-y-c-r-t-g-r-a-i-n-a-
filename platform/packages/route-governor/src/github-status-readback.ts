import { classifyStatusSurface, type StatusRunSurface, type StatusSurfaceClassification } from "./status-surface.js";

export type GithubCombinedStatusState = "error" | "failure" | "pending" | "success";

export interface GithubCombinedStatusEntry {
  context: string;
  state: GithubCombinedStatusState;
  target_url?: string | null;
  description?: string | null;
  updated_at?: string | null;
}

export interface GithubCombinedStatusSurface {
  state: GithubCombinedStatusState;
  total_count: number;
  statuses: GithubCombinedStatusEntry[];
}

export interface GithubReadbackRunSurface {
  id: string | number;
  name: string;
  status: StatusRunSurface["status"];
  conclusion: StatusRunSurface["conclusion"];
  head_sha?: string;
  html_url?: string;
}

export interface GithubHeadStatusReadback {
  repo: string;
  pr: number;
  branch: string;
  head_sha: string;
  draft: boolean;
  mergeable: boolean | null;
  combined_status: GithubCombinedStatusSurface;
  check_runs: GithubReadbackRunSurface[];
  workflow_runs: GithubReadbackRunSurface[];
  verdict: string;
}

export type GithubStatusReadbackAction =
  | "classify_current_head_status"
  | "reject_stale_readback"
  | "emit_exact_blocker";

export interface GithubStatusReadbackCompileInput {
  expected_head_sha: string;
  readback: GithubHeadStatusReadback;
  notices?: string[];
}

export interface GithubStatusReadbackCompileVerdict {
  ok: boolean;
  action: GithubStatusReadbackAction;
  head_sha: string;
  status_surface: StatusSurfaceClassification | null;
  decisive_evidence: string[];
  failures: string[];
}

function statusContext(entry: GithubCombinedStatusEntry): string {
  return entry.target_url ? `${entry.context} ${entry.target_url}` : entry.context;
}

function combinedStatusRuns(readback: GithubHeadStatusReadback): StatusRunSurface[] {
  return readback.combined_status.statuses.map((status) => ({
    id: status.context,
    name: `combined status / ${statusContext(status)}`,
    status: status.state === "pending" ? "pending" : "completed",
    conclusion:
      status.state === "success"
        ? "success"
        : status.state === "failure" || status.state === "error"
          ? "failure"
          : null,
    head_sha: readback.head_sha,
    html_url: status.target_url ?? undefined,
  }));
}

function runSurface(readback: GithubHeadStatusReadback, run: GithubReadbackRunSurface): StatusRunSurface {
  return {
    id: String(run.id),
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.head_sha ?? readback.head_sha,
    html_url: run.html_url,
  };
}

export function compileGithubStatusReadback(
  input: GithubStatusReadbackCompileInput,
): GithubStatusReadbackCompileVerdict {
  const { expected_head_sha: expectedHeadSha, readback } = input;

  if (readback.head_sha !== expectedHeadSha) {
    return {
      ok: false,
      action: "reject_stale_readback",
      head_sha: readback.head_sha,
      status_surface: null,
      decisive_evidence: [`readback head ${readback.head_sha}`],
      failures: [`readback head ${readback.head_sha} does not match expected head ${expectedHeadSha}`],
    };
  }

  const statusSurface = classifyStatusSurface({
    expected_head_sha: expectedHeadSha,
    check_runs: [...readback.check_runs.map((run) => runSurface(readback, run)), ...combinedStatusRuns(readback)],
    workflow_runs: readback.workflow_runs.map((run) => runSurface(readback, run)),
    notices: input.notices ?? [],
  });

  if (!statusSurface.ok) {
    return {
      ok: false,
      action: "emit_exact_blocker",
      head_sha: readback.head_sha,
      status_surface: statusSurface,
      decisive_evidence: [
        ...statusSurface.blocking_failures,
        ...statusSurface.pending_surfaces,
        ...(statusSurface.decisive_successes.length === 0 ? [statusSurface.verdict] : []),
      ],
      failures:
        statusSurface.blocking_failures.length > 0
          ? statusSurface.blocking_failures
          : statusSurface.pending_surfaces.length > 0
            ? statusSurface.pending_surfaces
            : ["current-head readback returned no decisive status surface"],
    };
  }

  return {
    ok: true,
    action: "classify_current_head_status",
    head_sha: readback.head_sha,
    status_surface: statusSurface,
    decisive_evidence: statusSurface.decisive_successes,
    failures: [],
  };
}
