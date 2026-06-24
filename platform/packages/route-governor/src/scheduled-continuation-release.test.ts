import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compileScheduledContinuationRelease,
  type ScheduledContinuationReleaseInput,
} from "./scheduled-continuation-release.js";

const branch = "monday-platform-genesis-01";
const liveHead = "92d2ea1cfe9671af4dc88acd86423919b6ad4b74";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ScheduledContinuationReleaseInput> = {}): ScheduledContinuationReleaseInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    previous_status_head_sha: repairedHead,
    prohibited_release_classes: ["metadata_reread", "duplicate_ci_summary", "duplicate_comment", "old_repaired_head_blocker"],
    prohibited_blockers: ["repaired-head status readback for b38ea247602ae8ebba80c4120ad03b41b26bd841 is missing"],
    candidate: {
      release_id: "scheduled-continuation-release-001",
      release_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-continuation-release.ts"],
      executable_artifacts: ["compileScheduledContinuationRelease"],
      routing_artifacts: ["scheduled release packet compiler"],
      proof_artifacts: ["platform/packages/route-governor/src/scheduled-continuation-release.test.ts"],
      status_surface_ids: [],
      resulting_head_sha: "post-write-head",
    },
    ...overrides,
  };
}

describe("compileScheduledContinuationRelease", () => {
  it("admits a behavior-bearing external embodiment packet against the live head", () => {
    const verdict = compileScheduledContinuationRelease(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "release_external_embodiment_packet");
    assert.equal(verdict.quarantined_prompt_head, repairedHead);
    assert.equal(verdict.next_status_expected_head, "post-write-head");
    assert.deepEqual(verdict.blockers, []);
    assert.match(verdict.release_instruction, /moved resulting head/);
  });

  it("blocks proof-only scheduled embodiments", () => {
    const verdict = compileScheduledContinuationRelease(
      input({
        candidate: {
          ...input().candidate,
          changed_files: ["platform/packages/route-governor/src/scheduled-continuation-release-proof.ts"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_incomplete_external_embodiment");
    assert(verdict.blockers.includes("scheduled release is proof-only and changes no behavior file"));
  });

  it("blocks stale-base releases when prompt or PR-body head is behind live metadata", () => {
    const verdict = compileScheduledContinuationRelease(
      input({
        candidate: {
          ...input().candidate,
          base_head_sha: repairedHead,
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_base_head");
    assert.match(verdict.blockers.join("\n"), /is not live head/);
  });

  it("admits fresh status only when the live head moved or a new status surface is attached", () => {
    const fresh = compileScheduledContinuationRelease(
      input({
        candidate: {
          ...input().candidate,
          release_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          status_surface_ids: [],
        },
      }),
    );

    assert.equal(fresh.ok, true);
    assert.equal(fresh.action, "release_fresh_status_packet");
    assert.match(fresh.decisive_evidence.join("\n"), /head moved from/);

    const stale = compileScheduledContinuationRelease(
      input({
        previous_status_head_sha: liveHead,
        prompt_head_sha: liveHead,
        candidate: {
          ...input().candidate,
          release_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          status_surface_ids: [],
        },
      }),
    );

    assert.equal(stale.ok, false);
    assert.equal(stale.action, "block_stale_status_readback");
  });

  it("blocks prohibited repaired-head blocker reuse", () => {
    const verdict = compileScheduledContinuationRelease(
      input({
        candidate: {
          ...input().candidate,
          release_class: "exact_external_blocker",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          status_surface_ids: [],
          exact_blocker: "repaired-head status readback for b38ea247602ae8ebba80c4120ad03b41b26bd841 is missing",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_prohibited_blocker");
  });
});
