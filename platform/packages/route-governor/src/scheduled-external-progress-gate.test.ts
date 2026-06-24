import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gateScheduledExternalProgress,
  type ScheduledExternalProgressGateInput,
} from "./scheduled-external-progress-gate.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "dad2b41455561b8a6b82b2bded74dc90895e45dc";

function input(overrides: Partial<ScheduledExternalProgressGateInput> = {}): ScheduledExternalProgressGateInput {
  return {
    active_branch: branch,
    expected_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_blocker_resolved: true,
    candidate: {
      intent: "external_platform_embodiment",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-external-progress-gate.ts"],
      executable_artifacts: ["gateScheduledExternalProgress"],
      routing_artifacts: ["scheduled external progress gate"],
      status_surface_ids: [],
      new_check_run_ids: [],
    },
    ...overrides,
  };
}

describe("gateScheduledExternalProgress", () => {
  it("admits a live-head behavior-bearing embodiment and quarantines the stale prompt head", () => {
    const verdict = gateScheduledExternalProgress(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_external_platform_embodiment");
    assert.equal(verdict.admitted_progress_class, "external_platform_embodiment");
    assert.equal(verdict.quarantined_prompt_head_sha, repairedHead);
    assert.equal(
      verdict.decisive_evidence.includes("platform/packages/route-governor/src/scheduled-external-progress-gate.ts"),
      true,
    );
  });

  it("blocks resolved repaired-head blocker reuse on a moved live head", () => {
    const verdict = gateScheduledExternalProgress(
      input({
        candidate: {
          intent: "repaired_head_blocker",
          base_head_sha: repairedHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surface_ids: [],
          new_check_run_ids: [],
          blocker: `old repaired-head readback missing for ${repairedHead}`,
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_repaired_head_reuse");
    assert.equal(verdict.blockers.some((blocker) => blocker.includes(repairedHead)), true);
  });

  it("blocks duplicate status readbacks when the head and checks have not changed", () => {
    const verdict = gateScheduledExternalProgress(
      input({
        prompt_head_sha: liveHead,
        previous_status_head_sha: liveHead,
        candidate: {
          intent: "fresh_status_readback",
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surface_ids: [],
          new_check_run_ids: [],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_incomplete_status_readback");
  });

  it("blocks opaque status ids that are not bound to live-head evidence", () => {
    const verdict = gateScheduledExternalProgress(
      input({
        candidate: {
          intent: "fresh_status_readback",
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surface_ids: ["checks:dad2b414:route-governor-proof"],
          new_check_run_ids: [],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_incomplete_status_readback");
    assert.equal(verdict.blockers.includes("fresh status readback supplied opaque status ids without live-head evidence"), true);
  });

  it("blocks stale scheduled status evidence even when a current prompt head moved", () => {
    const verdict = gateScheduledExternalProgress(
      input({
        candidate: {
          intent: "fresh_status_readback",
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surface_ids: [],
          new_check_run_ids: [],
          status_evidence: [
            {
              surface_id: "checks:repaired-head:route-governor-proof",
              head_sha: repairedHead,
              evidence: ["Route Governor Proof succeeded on repaired head only"],
            },
          ],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_repaired_head_reuse");
    assert.equal(verdict.decisive_evidence.includes(`resolved repaired head ${repairedHead}`), true);
  });

  it("admits a fresh status readback only when bound to moved live-head evidence", () => {
    const verdict = gateScheduledExternalProgress(
      input({
        candidate: {
          intent: "fresh_status_readback",
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surface_ids: [],
          new_check_run_ids: [],
          status_evidence: [
            {
              surface_id: "checks:live-head:route-governor-proof",
              head_sha: liveHead,
              evidence: ["Route Governor Proof succeeded on live head"],
            },
          ],
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_fresh_status_readback");
    assert.equal(verdict.admitted_progress_class, "fresh_status_readback");
    assert.equal(verdict.decisive_evidence.includes(`status head ${liveHead}`), true);
  });

  it("admits one exact live-head blocker without pretending it is embodiment", () => {
    const verdict = gateScheduledExternalProgress(
      input({
        prompt_head_sha: liveHead,
        candidate: {
          intent: "exact_external_blocker",
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          status_surface_ids: [],
          new_check_run_ids: [],
          blocker: "external reviewer approval has not surfaced on the live head",
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "emit_exact_external_blocker");
    assert.deepEqual(verdict.blockers, ["external reviewer approval has not surfaced on the live head"]);
  });
});
