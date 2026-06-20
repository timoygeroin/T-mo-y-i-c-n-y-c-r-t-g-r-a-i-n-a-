import {
  enforceExternalManifestationSinkContract,
  type ExternalManifestationSinkContractInput,
} from "./external-manifestation-sink-contract.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pullRequest = 2;
const branch = "monday-platform-genesis-01";
const liveHead = "sink-contract-live-head";
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
      evidence: ["open", "non-draft", "mergeable true"],
    },
    resolved_historical_heads: [repairedHead],
    prompt_carried_head_sha: repairedHead,
    last_status_readback_head_sha: "previous-live-head",
    candidate: {
      operation: "external_platform_embodiment",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/external-manifestation-sink-contract.ts"],
      executable_artifacts: ["enforceExternalManifestationSinkContract"],
      routing_artifacts: ["manifestation sink target lock"],
      proof_artifacts: ["external-manifestation-sink-contract-proof"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runExternalManifestationSinkContractProof(): void {
  const admitted = enforceExternalManifestationSinkContract(baseInput());
  expectOk("sink-bound embodiment", admitted.ok, admitted.blockers);
  if (admitted.action !== "admit_sink_bound_embodiment") {
    throw new Error(`unexpected sink action: ${admitted.action}`);
  }
  if (!admitted.quarantined_head_shas.includes(repairedHead)) {
    throw new Error("repaired head was not quarantined as historical context");
  }

  const staleHead = enforceExternalManifestationSinkContract(
    baseInput({ candidate: { ...baseInput().candidate, base_head_sha: repairedHead } }),
  );
  expectBlock("stale repaired head", staleHead.ok, staleHead.blockers, "not live sink head");

  const wrongSink = enforceExternalManifestationSinkContract(
    baseInput({ live_surface: { ...baseInput().live_surface, pull_request: 3 } }),
  );
  expectBlock("wrong PR sink", wrongSink.ok, wrongSink.blockers, "does not match target");

  const nonProgress = enforceExternalManifestationSinkContract(
    baseInput({ candidate: { ...baseInput().candidate, operation: "duplicate_ci_summary" } }),
  );
  expectBlock("duplicate CI summary", nonProgress.ok, nonProgress.blockers, "non-progress");

  const unresolved = enforceExternalManifestationSinkContract(
    baseInput({
      live_surface: { ...baseInput().live_surface, blocker_label_present: true },
      candidate: { ...baseInput().candidate, operation: "review_request" },
    }),
  );
  expectBlock("unresolved blocker surface", unresolved.ok, unresolved.blockers, "blocker label");

  const exactBlocker = enforceExternalManifestationSinkContract(
    baseInput({
      candidate: {
        operation: "exact_external_blocker",
        base_head_sha: liveHead,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "active sink live metadata unavailable",
      },
    }),
  );
  expectOk("sink-bound exact blocker", exactBlocker.ok, exactBlocker.blockers);
}

runExternalManifestationSinkContractProof();
