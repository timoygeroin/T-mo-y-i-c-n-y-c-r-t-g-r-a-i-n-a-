import assert from "node:assert/strict";
import { test } from "node:test";

import { admitLiveHeadChoice, type LiveHeadChoiceAdmissionInput } from "./live-head-choice-admission.js";
import type { LiveHeadChoiceVerdict } from "./live-head-choice-reconciliation.js";

const branch = "monday-platform-genesis-01";
const liveHead = "751e9de6193f46bd852604e3d1eda5ebd2b30d82";
const stalePrompt = "prompt-repaired-head-success";
const stalePrBody = "pr-body-older-failure";

function verdict(overrides: Partial<LiveHeadChoiceVerdict> = {}): LiveHeadChoiceVerdict {
  return {
    ok: true,
    action: "select_executable_embodiment",
    branch,
    head_sha: liveHead,
    selected_candidate_id: "live-head-choice-admission",
    stale_source_ids: [stalePrompt, stalePrBody],
    rejected: [],
    decisive_evidence: [
      "platform/packages/route-governor/src/live-head-choice-admission.ts",
      "admitLiveHeadChoice",
      "dist/live-head-choice-admission.test.js",
    ],
    blockers: [],
    next_route: "commit the selected executable embodiment and require status readback for the moved head",
    ...overrides,
  };
}

function input(overrides: Partial<LiveHeadChoiceAdmissionInput> = {}): LiveHeadChoiceAdmissionInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    verdict: verdict(),
    required_stale_source_ids: [stalePrompt, stalePrBody],
    ...overrides,
  };
}

test("admits executable embodiment only after stale prompt and PR-body heads are retired", () => {
  const admitted = admitLiveHeadChoice(input());

  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "admit_embodiment_commit");
  assert.deepEqual(admitted.blockers, []);
  assert.ok(admitted.decisive_evidence.includes("live-head-choice-admission"));
});

test("blocks embodiment admission when the choice verdict belongs to an older head", () => {
  const admitted = admitLiveHeadChoice(
    input({
      verdict: verdict({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    }),
  );

  assert.equal(admitted.ok, false);
  assert.equal(admitted.action, "block_stale_or_nonexecutable_choice");
  assert.match(admitted.blockers.join("; "), /not live head/);
});

test("routes live-head failures into repair admission before embodiment", () => {
  const admitted = admitLiveHeadChoice(
    input({
      verdict: verdict({
        ok: false,
        action: "repair_live_head_failure",
        selected_candidate_id: null,
        decisive_evidence: ["live proof examples failed"],
        blockers: ["live proof examples failed"],
      }),
    }),
  );

  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "admit_failure_repair");
  assert.deepEqual(admitted.decisive_evidence, ["live proof examples failed"]);
});

test("requires status instead of admitting embodiment when reconciliation is waiting on live checks", () => {
  const admitted = admitLiveHeadChoice(
    input({
      verdict: verdict({
        ok: false,
        action: "read_live_head_status",
        selected_candidate_id: null,
        decisive_evidence: ["current checks are pending"],
        blockers: ["current checks are pending"],
      }),
    }),
  );

  assert.equal(admitted.ok, false);
  assert.equal(admitted.action, "require_live_status");
  assert.deepEqual(admitted.blockers, ["current checks are pending"]);
});

test("blocks when required stale source retirement is incomplete", () => {
  const admitted = admitLiveHeadChoice(
    input({
      verdict: verdict({ stale_source_ids: [stalePrompt] }),
    }),
  );

  assert.equal(admitted.ok, false);
  assert.equal(admitted.action, "block_stale_or_nonexecutable_choice");
  assert.match(admitted.blockers.join("; "), /required stale source ids/);
});
