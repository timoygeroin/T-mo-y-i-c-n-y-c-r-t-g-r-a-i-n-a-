#!/usr/bin/env node

const DEFAULT_REPO = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const DEFAULT_PR = "2";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const repo = argValue("repo", process.env.GITHUB_REPOSITORY || DEFAULT_REPO);
const prNumber = argValue("pr", process.env.PR_NUMBER || DEFAULT_PR);
const expectedHead = argValue("expected-head", process.env.EXPECTED_HEAD || "");
const currentRunId = argValue("current-run-id", process.env.GITHUB_RUN_ID || "");
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  console.error("Missing GITHUB_TOKEN or GH_TOKEN; status readback must use an authenticated GitHub API surface.");
  process.exit(64);
}

const [owner, name] = repo.split("/");
if (!owner || !name) {
  console.error(`Invalid repo: ${repo}`);
  process.exit(64);
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mondayid-status-readback",
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message || response.statusText;
    throw new Error(`${response.status} ${message} for ${path}`);
  }

  return body;
}

function summarizeCheckRuns(checkRuns) {
  return (checkRuns.check_runs || [])
    .filter((run) => !currentRunId || !run.html_url?.includes(`/actions/runs/${currentRunId}/`))
    .map((run) => ({
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    started_at: run.started_at,
    completed_at: run.completed_at,
    html_url: run.html_url,
  }));
}

function summarizeWorkflowRuns(workflowRuns) {
  return (workflowRuns.workflow_runs || [])
    .filter((run) => run.event === "pull_request")
    .filter((run) => !currentRunId || String(run.id) !== String(currentRunId))
    .map((run) => ({
    id: run.id,
    name: run.name,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.head_sha,
    html_url: run.html_url,
    created_at: run.created_at,
    updated_at: run.updated_at,
  }));
}

function classify({ combinedStatus, checkRuns, workflowRuns }) {
  const failingCheck = checkRuns.find((run) => ["failure", "timed_out", "cancelled", "action_required"].includes(run.conclusion));
  const pendingCheck = checkRuns.find((run) => run.status !== "completed" || run.conclusion === null);
  const failingWorkflow = workflowRuns.find((run) => ["failure", "timed_out", "cancelled", "action_required"].includes(run.conclusion));
  const pendingWorkflow = workflowRuns.find((run) => run.status !== "completed" || run.conclusion === null);

  if (failingCheck || failingWorkflow || combinedStatus.state === "failure" || combinedStatus.state === "error") {
    return "failing";
  }

  if (pendingCheck || pendingWorkflow || (combinedStatus.statuses.length > 0 && combinedStatus.state === "pending")) {
    return "pending";
  }

  if (checkRuns.length > 0 || workflowRuns.length > 0 || combinedStatus.statuses.length > 0) {
    return "passing_or_neutral";
  }

  return "no_status_surface_returned";
}

const pr = await github(`/repos/${owner}/${name}/pulls/${prNumber}`);
const headSha = pr.head.sha;

if (expectedHead && headSha !== expectedHead) {
  console.error(`PR #${prNumber} head moved: expected ${expectedHead}, got ${headSha}. Re-run with --expected-head=${headSha} after retargeting the blocker.`);
  process.exit(65);
}

const [combinedStatus, rawCheckRuns, rawWorkflowRuns] = await Promise.all([
  github(`/repos/${owner}/${name}/commits/${headSha}/status`),
  github(`/repos/${owner}/${name}/commits/${headSha}/check-runs`),
  github(`/repos/${owner}/${name}/actions/runs?head_sha=${headSha}&per_page=100`),
]);

const checkRuns = summarizeCheckRuns(rawCheckRuns);
const workflowRuns = summarizeWorkflowRuns(rawWorkflowRuns);
const verdict = classify({ combinedStatus, checkRuns, workflowRuns });

const readback = {
  repo,
  pr: Number(prNumber),
  branch: pr.head.ref,
  head_sha: headSha,
  draft: pr.draft,
  mergeable: pr.mergeable,
  combined_status: {
    state: combinedStatus.state,
    total_count: combinedStatus.total_count,
    statuses: combinedStatus.statuses.map((status) => ({
      context: status.context,
      state: status.state,
      target_url: status.target_url,
      description: status.description,
      updated_at: status.updated_at,
    })),
  },
  check_runs: checkRuns,
  workflow_runs: workflowRuns,
  verdict,
};

console.log(JSON.stringify(readback, null, 2));

if (verdict === "failing") process.exit(1);
if (verdict === "no_status_surface_returned") process.exit(66);
