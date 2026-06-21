import test from "node:test";
import assert from "node:assert/strict";

import {
  routeLiveHeadStalePromptEmbodiment,
  type LiveHeadStalePromptEmbodimentInput,
} from "./live-head-stale-prompt-embodiment-router.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "43473981f181a943ed58b9a9c4e021cfd3d4784c";

function baseInput(overrides: Partial<LiveHeadStalePromptEmbodimentInput> = {}): LiveHeadStalePromptEmbodimentInput {
  return {
    active_branch: "monday-platform-genesis-01",
    instruction_branch: "monday-platform-genesis-01",
    instruction_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    prohibited_blockers: ["repaired-head status-readback missing"],
    spent_lease_ids: [],
    spent_write_signatures: [],
    status_lease: {
      lease_id: "live-head-434-status-lease",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      status: "passing_with_warnings",
      evidence: ["live-head checks succeeded", "Node.js 20 warning is non-blocking"],
    },
    write_plan: {
      plan_id: "stale-prompt-live-head-embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/live-head-stale-prompt-embodiment-router.ts"],
      behavior_exports: ["routeLiveHeadStalePromptEmbodiment"],
      routing_effects: ["stale prompt head is preserved as history while live-head write proceeds"],
      write_signature: "stale-prompt-to-live-head-embodiment",
    },
    ...overrides,
  };
}

test("admits a live-head embodiment when the prompt carries a resolved stale repaired head", () => {
  const verdict = routeLiveHeadStalePromptEmbodiment(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_live_head_embodiment_after_stale_prompt");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.stale_prompt_head_sha, repairedHead);
  assert.equal(verdict.lease_id, "live-head-434-status-lease");
  assert.equal(verdict.admitted_write_signature, "stale-prompt-to-live-head-embodiment");
  assert.ok(verdict.decisive_evidence.includes(`resolved repaired head preserved as history ${repairedHead}`));
});

test("blocks a write that tries to use the prompt repaired head as the base", () => {
  const verdict = routeLiveHeadStalePromptEmbodiment(
    baseInput({
      write_plan: {
        ...baseInput().write_plan,
        base_head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_prompt_embodiment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes(liveHead)));
});

test("routes to live-head status readback when no current status lease exists", () => {
  const verdict = routeLiveHeadStalePromptEmbodiment(
    baseInput({
      status_lease: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_prompt_embodiment");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("no status lease")));
});
