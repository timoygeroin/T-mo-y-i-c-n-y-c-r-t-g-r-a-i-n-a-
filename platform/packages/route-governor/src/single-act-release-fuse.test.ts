import test from "node:test";
import assert from "node:assert/strict";

import { fuseSingleActRelease, type SingleActReleaseFuseInput } from "./single-act-release-fuse.js";

const liveHead = "de59b32df9c15c9773544aba33b1bef542f42e46";

function input(overrides: Partial<SingleActReleaseFuseInput> = {}): SingleActReleaseFuseInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    release_id: "single-act-release-fuse-test",
    spent_release_ids: [],
    claims: [
      {
        claim_id: "single-act-fuse-embodiment",
        progress_class: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        head_sha: liveHead,
        evidence: ["commit e3aa28e70fe71ed472c53d70f8a145f253201789"],
        changed_files: ["platform/packages/route-governor/src/single-act-release-fuse.ts"],
        behavior_artifacts: ["fuseSingleActRelease"],
        routing_artifacts: ["finalization release admits exactly one external progress claim"],
      },
    ],
    ...overrides,
  };
}

test("admits one executable platform embodiment claim", () => {
  const verdict = fuseSingleActRelease(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_single_external_progress_act");
  assert.equal(verdict.admitted_progress_class, "external_platform_embodiment");
});

test("blocks bundled progress claims", () => {
  const verdict = fuseSingleActRelease(
    input({
      claims: [
        ...input().claims,
        {
          claim_id: "status-summary-bundled-with-embodiment",
          progress_class: "fresh_status_readback",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["current-head status summary"],
          status_surface_ids: ["checks-surface-1"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_multiple_progress_claims");
});

test("blocks non-progress claims before release", () => {
  const verdict = fuseSingleActRelease(
    input({
      claims: [
        {
          claim_id: "metadata-reread",
          progress_class: "metadata_reread",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["PR metadata was read again"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_claim");
});

test("blocks stale-head claims", () => {
  const verdict = fuseSingleActRelease(
    input({ claims: [{ ...input().claims[0]!, head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
});

test("admits one exact external blocker claim", () => {
  const verdict = fuseSingleActRelease(
    input({
      release_id: "single-act-exact-blocker-test",
      claims: [
        {
          claim_id: "next-step-blocker",
          progress_class: "exact_external_blocker",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["external writer unavailable"],
          exact_blocker: "external writer unavailable for the next embodiment step",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_single_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["external writer unavailable for the next embodiment step"]);
});
