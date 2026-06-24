import assert from "node:assert/strict";
import { test } from "node:test";

export type MovedHeadStatusAction =
  | "admit_fresh_status_readback"
  | "emit_moved_head_status_blocker"
  | "block_duplicate_readback"
  | "block_stale_status_surface";

export interface HeadCheckRunEvidence {
  id: string;
  head_sha: string;
  conclusion: "success" | "failure" | "pending" | "cancelled" | "neutral" | "skipped";
}

export interface MovedHeadStatusBoundaryInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  previous_repaired_head_sha: string;
  previous_readback_head_sha: string;
  status_surface_head_sha?: string;
  status_surface_available: boolean;
  current_head_check_runs: HeadCheckRunEvidence[];
}

export interface MovedHeadStatusBoundaryVerdict {
  ok: boolean;
  action: MovedHeadStatusAction;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function currentHeadChecks(input: MovedHeadStatusBoundaryInput): HeadCheckRunEvidence[] {
  return input.current_head_check_runs.filter((run) => run.head_sha === input.current_head_sha);
}

export function routeMovedHeadStatusBoundary(
  input: MovedHeadStatusBoundaryInput,
): MovedHeadStatusBoundaryVerdict {
  const headMoved = input.current_head_sha !== input.previous_readback_head_sha;
  const checks = currentHeadChecks(input);

  if (input.branch !== input.active_branch) {
    return {
      ok: false,
      action: "block_stale_status_surface",
      head_sha: input.current_head_sha,
      decisive_evidence: [],
      blockers: [`status boundary branch ${input.branch} does not match active branch ${input.active_branch}`],
      next_route: "bind moved-head readback to the active PR branch before release",
    };
  }

  if (input.status_surface_available && input.status_surface_head_sha !== input.current_head_sha) {
    return {
      ok: false,
      action: "block_stale_status_surface",
      head_sha: input.current_head_sha,
      decisive_evidence: [],
      blockers: [
        `status surface belongs to ${input.status_surface_head_sha ?? "unknown head"}, not current head ${input.current_head_sha}`,
      ],
      next_route: "discard stale status evidence and read only the current PR head",
    };
  }

  if (input.status_surface_available && (headMoved || checks.length > 0)) {
    return {
      ok: true,
      action: "admit_fresh_status_readback",
      head_sha: input.current_head_sha,
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.previous_readback_head_sha} to ${input.current_head_sha}`] : []),
        ...checks.map((run) => `current-head check ${run.id}: ${run.conclusion}`),
      ],
      blockers: [],
      next_route: "release a current-head status verdict, then choose only a non-repeated embodiment or concrete failure repair",
    };
  }

  if (headMoved) {
    return {
      ok: false,
      action: "emit_moved_head_status_blocker",
      head_sha: input.current_head_sha,
      decisive_evidence: [`head moved from ${input.previous_readback_head_sha} to ${input.current_head_sha}`],
      blockers: [
        `MOVED_HEAD_STATUS_SURFACE_UNAVAILABLE: current PR head ${input.current_head_sha} has no attached status/check surface in this run`,
      ],
      next_route: "obtain status or check evidence for the moved head before making a pass/fail claim",
    };
  }

  return {
    ok: false,
    action: "block_duplicate_readback",
    head_sha: input.current_head_sha,
    decisive_evidence: [],
    blockers: ["fresh status readback requires a moved PR head or new current-head check run evidence"],
    next_route: "choose a non-repeated executable embodiment increment or provide new current-head check evidence",
  };
}

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const movedHead = "b19d3edbd6beee9ff106457c53fdc0233d7685cb";

function input(overrides: Partial<MovedHeadStatusBoundaryInput> = {}): MovedHeadStatusBoundaryInput {
  return {
    branch,
    active_branch: branch,
    current_head_sha: movedHead,
    previous_repaired_head_sha: repairedHead,
    previous_readback_head_sha: repairedHead,
    status_surface_available: false,
    current_head_check_runs: [],
    ...overrides,
  };
}

test("emits a moved-head status blocker instead of reusing the repaired-head boundary", () => {
  const verdict = routeMovedHeadStatusBoundary(input());

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_moved_head_status_blocker");
  assert.equal(verdict.head_sha, movedHead);
  assert.match(verdict.blockers[0], /MOVED_HEAD_STATUS_SURFACE_UNAVAILABLE/);
  assert.match(verdict.blockers[0], new RegExp(movedHead));
  assert.doesNotMatch(verdict.blockers[0], new RegExp(repairedHead));
});

test("admits fresh readback only when the status surface is bound to the moved head", () => {
  const verdict = routeMovedHeadStatusBoundary(
    input({
      status_surface_available: true,
      status_surface_head_sha: movedHead,
      current_head_check_runs: [{ id: "27000000000", head_sha: movedHead, conclusion: "success" }],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.some((line) => line.includes(movedHead)));
});

test("blocks stale status surfaces from older heads", () => {
  const verdict = routeMovedHeadStatusBoundary(
    input({ status_surface_available: true, status_surface_head_sha: repairedHead }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_surface");
  assert.deepEqual(verdict.blockers, [`status surface belongs to ${repairedHead}, not current head ${movedHead}`]);
});

test("blocks duplicate readback when neither the head nor current-head checks changed", () => {
  const verdict = routeMovedHeadStatusBoundary(
    input({
      current_head_sha: repairedHead,
      previous_readback_head_sha: repairedHead,
      status_surface_available: false,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_duplicate_readback");
});
