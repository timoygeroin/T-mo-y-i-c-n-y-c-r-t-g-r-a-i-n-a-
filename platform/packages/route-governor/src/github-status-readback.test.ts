import test from "node:test";
import assert from "node:assert/strict";

import { compileGithubStatusReadback, type GithubHeadStatusReadback } from "./github-status-readback.js";

const head = "34b6e5fae4fa81ca41a500cb2ceb77dfff2634e2";

function readback(overrides: Partial<GithubHeadStatusReadback> = {}): GithubHeadStatusReadback {
  return {
    repo: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    draft: false,
    mergeable: true,
    combined_status: {
      state: "success",
      total_count: 1,
      statuses: [
        {
          context: "Monday Platform CI / Route governor proof surface",
          state: "success",
          target_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/27070000001",
          description: "Route governor proof surface succeeded",
          updated_at: "2026-06-06T18:00:00Z",
        },
      ],
    },
    check_runs: [
      {
        id: "27070000002",
        name: "Route Governor Proof / Route governor proof examples",
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/27070000002",
      },
    ],
    workflow_runs: [
      {
        id: "27070000003",
        name: "PR Head Status Readback / Read PR head status",
        status: "completed",
        conclusion: "success",
        head_sha: head,
        html_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/27070000003",
      },
    ],
    verdict: "passing_or_neutral",
    ...overrides,
  };
}

test("classifies the real PR-head readback artifact into a current-head status surface", () => {
  const verdict = compileGithubStatusReadback({
    expected_head_sha: head,
    readback: readback(),
    notices: ["Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions"],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "classify_current_head_status");
  assert.equal(verdict.head_sha, head);
  assert.equal(verdict.status_surface?.verdict, "passing_with_warnings");
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.decisive_evidence.length, 3);
  assert.deepEqual(verdict.status_surface?.non_blocking_warnings, [
    "Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions",
  ]);
});

test("rejects a stale readback artifact before it can publish a status verdict", () => {
  const staleHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
  const verdict = compileGithubStatusReadback({
    expected_head_sha: head,
    readback: readback({ head_sha: staleHead }),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "reject_stale_readback");
  assert.equal(verdict.status_surface, null);
  assert.deepEqual(verdict.failures, [`readback head ${staleHead} does not match expected head ${head}`]);
});

test("emits an exact blocker from a failing current-head readback", () => {
  const verdict = compileGithubStatusReadback({
    expected_head_sha: head,
    readback: readback({
      combined_status: {
        state: "failure",
        total_count: 1,
        statuses: [
          {
            context: "Route Governor Proof / Typecheck route governor",
            state: "failure",
            target_url: "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/27070000004",
          },
        ],
      },
      check_runs: [],
      workflow_runs: [],
      verdict: "failing",
    }),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_blocker");
  assert.deepEqual(verdict.failures, [
    "combined status / Route Governor Proof / Typecheck route governor (Route Governor Proof / Typecheck route governor) https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/actions/runs/27070000004: failure",
  ]);
});

test("keeps pending current-head readback pending instead of guessing CI", () => {
  const verdict = compileGithubStatusReadback({
    expected_head_sha: head,
    readback: readback({
      combined_status: { state: "pending", total_count: 0, statuses: [] },
      check_runs: [],
      workflow_runs: [
        {
          id: "27070000005",
          name: "Monday Platform CI / Route governor proof surface",
          status: "in_progress",
          conclusion: null,
          head_sha: head,
        },
      ],
      verdict: "pending",
    }),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_blocker");
  assert.deepEqual(verdict.failures, ["Monday Platform CI / Route governor proof surface (27070000005)"]);
});
