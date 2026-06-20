import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  enforceExternalManifestationSinkContract,
  type ExternalManifestationSinkContractInput,
} from "./external-manifestation-sink-contract.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pullRequest = 2;
const branch = "monday-platform-genesis-01";
const liveHead = "a8fee5331966ab384f5c9ade6b7ad7c0277652ad";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function baseInput(overrides: Partial<ExternalManifestationSinkContractInput> = {}): ExternalManifestationSinkContractInput {
  return {
    target: { repository, pull_request: pullRequest, branch },
    live_surface: {
      surface_id: "live-pr-metadata",
      repository,
      pull_request: pullRequest,
      branch,
      head_sha: liveHead,
      state: "open",
      draft: false,
      blocker_label_present: false,
      blocker_issue_open: false,
      evidence: ["PR #2 open", "PR #2 non-draft", "mergeable true"],
    },
    resolved_historical_heads: [repairedHead],
    prompt_carried_head_sha: repairedHead,
    last_status_readback_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    candidate: {
      operation: "external_platform_embodiment",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/external-manifestation-sink-contract.ts"],
      executable_artifacts: ["enforceExternalManifestationSinkContract"],
      routing_artifacts: ["active sink target remains PR #2 on monday-platform-genesis-01"],
      proof_artifacts: ["external-manifestation-sink-contract-proof"],
    },
    ...overrides,
  };
}

describe("enforceExternalManifestationSinkContract", () => {
  it("admits an embodiment only when it is bound to the active PR sink live head", () => {
    const verdict = enforceExternalManifestationSinkContract(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_sink_bound_embodiment");
    assert.equal(verdict.repository, repository);
    assert.equal(verdict.pull_request, pullRequest);
    assert.equal(verdict.branch, branch);
    assert.equal(verdict.live_head_sha, liveHead);
    assert.ok(verdict.quarantined_head_shas.includes(repairedHead));
  });

  it("blocks a candidate rebased to the repaired historical head", () => {
    const verdict = enforceExternalManifestationSinkContract(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          base_head_sha: repairedHead,
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_head_authority");
    assert.match(verdict.blockers.join("; "), /not live sink head/);
  });

  it("blocks a live surface from the wrong repository, PR, or branch", () => {
    const verdict = enforceExternalManifestationSinkContract(
      baseInput({
        live_surface: {
          ...baseInput().live_surface,
          repository: "timoygeroin/other",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_sink_mismatch");
  });

  it("blocks duplicate summaries and old repaired-head blockers as non-progress", () => {
    const verdict = enforceExternalManifestationSinkContract(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          operation: "old_repaired_head_blocker",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_operation");
  });

  it("blocks review or merge while blocker surfaces remain unresolved", () => {
    const verdict = enforceExternalManifestationSinkContract(
      baseInput({
        live_surface: {
          ...baseInput().live_surface,
          blocker_issue_open: true,
        },
        candidate: {
          ...baseInput().candidate,
          operation: "merge_command",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_unresolved_blocker_surface");
  });

  it("emits an exact blocker only when the blocker is named and sink-bound", () => {
    const verdict = enforceExternalManifestationSinkContract(
      baseInput({
        candidate: {
          operation: "exact_external_blocker",
          base_head_sha: liveHead,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          blocker: "live PR metadata is unavailable for the active sink head",
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "emit_sink_bound_external_blocker");
    assert.deepEqual(verdict.blockers, ["live PR metadata is unavailable for the active sink head"]);
  });
});
