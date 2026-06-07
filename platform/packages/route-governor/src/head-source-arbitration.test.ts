import test from "node:test";
import assert from "node:assert/strict";

import { arbitrateHeadSources, type HeadSourceArbitrationInput } from "./head-source-arbitration.js";

const branch = "monday-platform-genesis-01";
const liveHead = "ca93bbd5d0698cbffeae5457a1922d779cf471e2";
const stalePromptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const stalePrBodyHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function input(overrides: Partial<HeadSourceArbitrationInput> = {}): HeadSourceArbitrationInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    prohibited_heads: [],
    prohibited_blockers: ["repaired-head status-readback blocker for b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    sources: [
      {
        source_id: "prompt-head",
        kind: "prompt",
        head_sha: stalePromptHead,
        status_verdict: "passing_with_warnings",
        evidence: ["prompt carried repaired-head success"],
      },
      {
        source_id: "pr-body-readback",
        kind: "pr_body_readback",
        head_sha: stalePrBodyHead,
        status_verdict: "failing",
        evidence: ["PR body says df3a403 failed Run proof examples"],
      },
      {
        source_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        head_sha: liveHead,
        evidence: ["GitHub PR metadata reports live head ca93bbd"],
      },
    ],
    ...overrides,
  };
}

test("routes stale prompt and PR-body heads into live-head status readback", () => {
  const verdict = arbitrateHeadSources(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_live_head_status");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.accepted_source_id, "live-pr-metadata");
  assert.ok(verdict.decisive_evidence.some((item) => item.includes(stalePromptHead)));
  assert.ok(verdict.decisive_evidence.some((item) => item.includes(stalePrBodyHead)));
});

test("blocks prohibited stale blocker even when the prompt carried it", () => {
  const verdict = arbitrateHeadSources(
    input({ attempted_blocker: "repaired-head status-readback blocker for b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_source");
  assert.ok(verdict.blockers[0].includes("prohibited blocker"));
});

test("accepts only status evidence bound to the live PR head", () => {
  const verdict = arbitrateHeadSources(
    input({
      sources: [
        {
          source_id: "prompt-head",
          kind: "prompt",
          head_sha: stalePromptHead,
          status_verdict: "passing_with_warnings",
          evidence: ["prompt carried repaired-head success"],
        },
        {
          source_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          head_sha: liveHead,
          evidence: ["GitHub PR metadata reports live head ca93bbd"],
        },
        {
          source_id: "actions-readback",
          kind: "actions_readback",
          head_sha: liveHead,
          status_verdict: "passing_with_warnings",
          evidence: [
            "Route Governor Proof / proof examples: success",
            "Node.js 20 Actions deprecation notice",
          ],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_live_status");
  assert.equal(verdict.accepted_source_id, "actions-readback");
  assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
});

test("routes live-head failure into repair instead of stale repaired-head success", () => {
  const verdict = arbitrateHeadSources(
    input({
      sources: [
        {
          source_id: "prompt-head",
          kind: "prompt",
          head_sha: stalePromptHead,
          status_verdict: "passing",
          evidence: ["old repaired head passed"],
        },
        {
          source_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          head_sha: liveHead,
          evidence: ["GitHub PR metadata reports live head ca93bbd"],
        },
        {
          source_id: "live-failing-readback",
          kind: "actions_readback",
          head_sha: liveHead,
          status_verdict: "failing",
          evidence: ["Run proof examples failed on live head"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_live_failure");
  assert.deepEqual(verdict.blockers, ["Run proof examples failed on live head"]);
});

test("requires live PR metadata before reconciling lower-tier head claims", () => {
  const verdict = arbitrateHeadSources(
    input({
      sources: [
        {
          source_id: "prompt-head",
          kind: "prompt",
          head_sha: stalePromptHead,
          status_verdict: "passing",
          evidence: ["old repaired head passed"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.ok(verdict.blockers[0].includes("no live PR metadata source"));
});
