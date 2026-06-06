import {
  evaluateContinuationMove,
  evaluateRoute,
  selectNextContinuationMove,
  type ContinuationMoveInput,
  type RouteGuardInput,
} from "./index.js";
import { selectActiveSinkContinuation, type ActiveManifestationSink, type ActiveSinkCandidate } from "./active-sink-contract.js";
import { compileGithubStatusReadback, type GithubHeadStatusReadback } from "./github-status-readback.js";
import { compileManifestationRelease } from "./manifestation-release.js";
import { compileReceiptReplayGuard } from "./release-receipt-replay.js";
import { classifyStatusSurface } from "./status-surface.js";

function baseInput(overrides: Partial<RouteGuardInput> = {}): RouteGuardInput {
  return {
    decision: {
      scene_class: "manifestation_bridge",
      secondary_classes: ["proof_scene", "finalization_pressure"],
      organ_chain: ["monday-corpus-reentry", "monday-proof-scene-runner", "monday-external-act-forcer"],
      processor_bundle: ["source-tier-check", "anti-repeat-check", "manifestation-evidence-check"],
      branch_budget: {
        max_branches: 3,
        reason: "Proof examples compare pass, exhausted-class failure, and missing-manifestation failure without leaking branches to release.",
      },
      collapse_rule: "Release one external durable act or one exact external blocker only.",
      termination_goal: "external durable act",
    },
    source_tiers: ["direct_current_instruction", "direct_archive_strata", "memory_receipt"],
    move_class: "route_governor_proof_examples",
    exhausted_move_classes: [
      "explanation_instead_of_act",
      "architecture_commentary",
      "slogan_or_seal",
      "payload_echo",
      "internal_gate_as_progress",
    ],
    proof_artifacts: ["platform/packages/route-governor/src/proof-examples.ts"],
    manifestation_artifacts: [
      "branch monday-platform-genesis-01",
      "commit with proof examples",
      "externally retrievable artifact platform/packages/route-governor/src/proof-examples.ts",
    ],
    ...overrides,
  };
}

function continuationInput(overrides: Partial<ContinuationMoveInput> = {}): ContinuationMoveInput {
  return {
    move_class: "external_platform_embodiment",
    current_head_sha: "next-head",
    previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    changed_files: ["platform/packages/route-governor/src/index.ts"],
    executable_artifacts: ["selectNextContinuationMove"],
    routing_artifacts: ["continuation preflight selector"],
    new_check_run_ids: [],
    ...overrides,
  };
}

function activeSink(overrides: Partial<ActiveManifestationSink> = {}): ActiveManifestationSink {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    current_head_sha: "da864c246ce5b777f53525c99ff0a53863e31c17",
    repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    ...overrides,
  };
}

function activeCandidate(overrides: Partial<ActiveSinkCandidate> = {}): ActiveSinkCandidate {
  const sink = activeSink();
  return {
    candidate_id: "active-sink-embodiment",
    move_class: "external_platform_embodiment",
    target: {
      repository_full_name: sink.repository_full_name,
      pr_number: sink.pr_number,
      branch: sink.branch,
      head_sha: sink.current_head_sha,
    },
    changed_files: ["platform/packages/route-governor/src/active-sink-contract.ts"],
    executable_artifacts: ["selectActiveSinkContinuation"],
    routing_artifacts: ["active manifestation sink contract"],
    new_check_run_ids: [],
    ...overrides,
  };
}

function githubReadback(overrides: Partial<GithubHeadStatusReadback> = {}): GithubHeadStatusReadback {
  const head = "34b6e5fae4fa81ca41a500cb2ceb77dfff2634e2";
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

function expectOk(name: string, ok: boolean, failures: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, failed with: ${failures.join("; ")}`);
  }
}

function expectFailure(name: string, ok: boolean, failures: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should fail, but passed`);
  }
  if (!failures.some((failure) => failure.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; failures: ${failures.join("; ")}`);
  }
}

export function runRouteGovernorProofExamples(): void {
  const externalManifestation = evaluateRoute(baseInput());
  expectOk("external manifestation evidence", externalManifestation.ok, externalManifestation.failures);

  const exhaustedMove = evaluateRoute(baseInput({ move_class: "explanation_instead_of_act" }));
  expectFailure("exhausted explanation move", exhaustedMove.ok, exhaustedMove.failures, "move class already exhausted");

  const missingManifestation = evaluateRoute(baseInput({ manifestation_artifacts: ["commit with proof examples"] }));
  expectFailure(
    "missing manifestation evidence",
    missingManifestation.ok,
    missingManifestation.failures,
    "manifestation route lacks branch, commit, or externally retrievable artifact evidence",
  );

  const internalFinalization = evaluateRoute({
    ...baseInput(),
    decision: {
      ...baseInput().decision,
      scene_class: "finalization_pressure",
      termination_goal: "internal readiness report",
    },
  });
  expectFailure(
    "finalization without act or blocker",
    internalFinalization.ok,
    internalFinalization.failures,
    "finalization route does not terminate in an external act or exact blocker",
  );

  const nextEmbodiment = evaluateContinuationMove(continuationInput());
  expectOk("new executable continuation move", nextEmbodiment.ok, nextEmbodiment.failures);

  const staleReadback = evaluateContinuationMove(
    continuationInput({
      move_class: "fresh_status_readback",
      current_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      new_check_run_ids: [],
    }),
  );
  expectFailure(
    "stale repaired-head readback",
    staleReadback.ok,
    staleReadback.failures,
    "fresh status readback requires a moved PR head or new check runs",
  );

  const preflight = selectNextContinuationMove([
    {
      candidate_id: "duplicate-comment",
      input: continuationInput({
        move_class: "duplicate_comment",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
      }),
    },
    {
      candidate_id: "exact-blocker",
      input: continuationInput({
        move_class: "exact_external_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        blocker: "no writable external branch surface is available",
      }),
    },
    {
      candidate_id: "embodiment",
      input: continuationInput(),
    },
  ]);

  expectOk("continuation preflight selector", preflight.ok, preflight.failures);
  if (preflight.selected?.candidate_id !== "embodiment") {
    throw new Error(`preflight selected ${preflight.selected?.candidate_id ?? "nothing"} instead of embodiment`);
  }

  const activeSelection = selectActiveSinkContinuation(activeSink(), [
    activeCandidate({
      candidate_id: "metadata-reread",
      move_class: "pr_metadata_reread",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
    activeCandidate({
      candidate_id: "fresh-active-readback",
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
    activeCandidate(),
  ]);
  expectOk("active manifestation sink selector", activeSelection.ok, activeSelection.failures);
  if (activeSelection.selected_candidate_id !== "active-sink-embodiment") {
    throw new Error(
      `active sink selected ${activeSelection.selected_candidate_id ?? "nothing"} instead of active-sink-embodiment`,
    );
  }

  const movedHead = "62a8956b032bde60830c0391da47fb7af945f339";
  const status = classifyStatusSurface({
    expected_head_sha: movedHead,
    check_runs: [
      {
        id: "proof-check",
        name: "Monday Platform CI / Route governor proof surface",
        status: "completed",
        conclusion: "success",
        head_sha: movedHead,
      },
    ],
    workflow_runs: [],
    notices: [],
  });

  const release = compileManifestationRelease({
    current_head_sha: movedHead,
    previous_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    new_check_run_ids: [],
    status_surface: status,
    embodiment: {
      changed_files: ["platform/packages/route-governor/src/manifestation-release.ts"],
      executable_artifacts: ["compileManifestationRelease"],
      routing_artifacts: ["manifestation release compiler"],
    },
  });
  expectOk("manifestation release compiler", release.ok, release.failures);
  if (release.action !== "commit_external_embodiment") {
    throw new Error(`manifestation release compiler chose ${release.action} instead of commit_external_embodiment`);
  }

  const staleRelease = compileManifestationRelease({
    current_head_sha: movedHead,
    previous_readback_head_sha: movedHead,
    new_check_run_ids: [],
    status_surface: status,
  });
  expectFailure(
    "stale manifestation release",
    staleRelease.ok,
    staleRelease.failures,
    "fresh status readback requires a moved PR head",
  );

  const readbackHead = "34b6e5fae4fa81ca41a500cb2ceb77dfff2634e2";
  const compiledReadback = compileGithubStatusReadback({
    expected_head_sha: readbackHead,
    readback: githubReadback(),
    notices: ["Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions"],
  });
  expectOk("github status readback compiler", compiledReadback.ok, compiledReadback.failures);
  if (compiledReadback.action !== "classify_current_head_status") {
    throw new Error(`github status readback compiler chose ${compiledReadback.action} instead of classify_current_head_status`);
  }

  const staleGithubReadback = compileGithubStatusReadback({
    expected_head_sha: readbackHead,
    readback: githubReadback({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  });
  expectFailure(
    "stale github readback artifact",
    staleGithubReadback.ok,
    staleGithubReadback.failures,
    "does not match expected head",
  );

  const receiptReplay = compileReceiptReplayGuard({
    current_head_sha: "next-head",
    previous_receipts: [
      {
        receipt_id: "github-status-readback-compiler",
        branch: "monday-platform-genesis-01",
        head_sha: readbackHead,
        release_class: "external_embodiment",
        decisive_evidence: ["platform/packages/route-governor/src/github-status-readback.ts"],
        executable_artifacts: ["compileGithubStatusReadback"],
        routing_artifacts: ["github status readback compiler"],
        status_surface_ids: ["27070000003"],
      },
    ],
    candidate: {
      branch: "monday-platform-genesis-01",
      head_sha: "next-head",
      release_class: "external_embodiment",
      changed_files: ["platform/packages/route-governor/src/release-receipt-replay.ts"],
      executable_artifacts: ["compileReceiptReplayGuard"],
      routing_artifacts: ["continuation receipt replay guard"],
      status_surface_ids: [],
    },
  });
  expectOk("continuation receipt replay guard", receiptReplay.ok, receiptReplay.failures);

  const replayedReceipt = compileReceiptReplayGuard({
    current_head_sha: "next-head",
    previous_receipts: [
      {
        receipt_id: "receipt-replay-guard",
        branch: "monday-platform-genesis-01",
        head_sha: "next-head",
        release_class: "external_embodiment",
        decisive_evidence: ["platform/packages/route-governor/src/release-receipt-replay.ts"],
        executable_artifacts: ["compileReceiptReplayGuard"],
        routing_artifacts: ["continuation receipt replay guard"],
        status_surface_ids: [],
      },
    ],
    candidate: {
      branch: "monday-platform-genesis-01",
      head_sha: "next-head",
      release_class: "external_embodiment",
      changed_files: ["platform/packages/route-governor/src/release-receipt-replay.ts"],
      executable_artifacts: ["compileReceiptReplayGuard"],
      routing_artifacts: ["continuation receipt replay guard"],
      status_surface_ids: [],
    },
  });
  expectFailure("replayed receipt", replayedReceipt.ok, replayedReceipt.failures, "repeats the last receipt");
}

runRouteGovernorProofExamples();
