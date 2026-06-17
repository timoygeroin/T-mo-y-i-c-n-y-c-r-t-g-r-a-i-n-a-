import { routeFinalizationReleaseMux, type FinalizationReleaseMuxInput } from "./finalization-release-mux.js";
import { compileTerminalReleaseEnvelope } from "./terminal-release-envelope.js";

const liveHead = "8a8f0b987a47c85eeb4d39d8180e24f01b207a51";

function releaseInput(overrides: Partial<FinalizationReleaseMuxInput> = {}): FinalizationReleaseMuxInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    previous_status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    prohibited_release_classes: [
      "pr_metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_resolved_blocker",
    ],
    spent_release_ids: ["finalization-release-mux"],
    candidate: {
      release_id: "terminal-release-envelope",
      release_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      resulting_head_sha: "next-head",
      side_effects: ["branch_commit"],
      changed_files: [
        "platform/packages/route-governor/src/terminal-release-envelope.ts",
        "platform/packages/route-governor/src/terminal-release-envelope-proof.ts",
      ],
      executable_artifacts: ["compileTerminalReleaseEnvelope"],
      routing_artifacts: ["terminal release executor envelope"],
      proof_artifacts: ["platform/packages/route-governor/src/terminal-release-envelope-proof.ts"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectFailure(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should fail, but passed`);
  }
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runTerminalReleaseEnvelopeProof(): void {
  const admitted = routeFinalizationReleaseMux(releaseInput());
  expectOk("release mux admits terminal envelope embodiment", admitted.ok, admitted.blockers);

  const compiled = compileTerminalReleaseEnvelope({
    release: admitted,
    live_head_sha: liveHead,
    active_branch: "monday-platform-genesis-01",
    execution_boundary: "github_branch_commit",
    expected_result_head_sha: "next-head",
  });
  expectOk("branch commit envelope", compiled.ok, compiled.blockers);
  if (compiled.envelope?.operation !== "commit_external_embodiment") {
    throw new Error(`expected commit_external_embodiment, got ${compiled.envelope?.operation ?? "nothing"}`);
  }

  const wrongBoundary = compileTerminalReleaseEnvelope({
    release: admitted,
    live_head_sha: liveHead,
    active_branch: "monday-platform-genesis-01",
    execution_boundary: "pr_comment",
    expected_result_head_sha: "next-head",
  });
  expectFailure("comment boundary", wrongBoundary.ok, wrongBoundary.blockers, "terminal release cannot execute through pr_comment");

  const sameHead = compileTerminalReleaseEnvelope({
    release: admitted,
    live_head_sha: liveHead,
    active_branch: "monday-platform-genesis-01",
    execution_boundary: "github_branch_commit",
    expected_result_head_sha: liveHead,
  });
  expectFailure("same-head embodiment envelope", sameHead.ok, sameHead.blockers, "future result head distinct from the live head");

  const statusRelease = routeFinalizationReleaseMux(
    releaseInput({
      candidate: {
        ...releaseInput().candidate,
        release_id: "fresh-live-status-envelope",
        release_class: "fresh_status_readback",
        side_effects: ["status_claim"],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_head_sha: liveHead,
      },
    }),
  );
  expectOk("status release admission", statusRelease.ok, statusRelease.blockers);

  const statusEnvelope = compileTerminalReleaseEnvelope({
    release: statusRelease,
    live_head_sha: liveHead,
    active_branch: "monday-platform-genesis-01",
    execution_boundary: "github_status_readback",
  });
  expectOk("status readback envelope", statusEnvelope.ok, statusEnvelope.blockers);
  if (statusEnvelope.envelope?.operation !== "read_fresh_status") {
    throw new Error(`expected read_fresh_status, got ${statusEnvelope.envelope?.operation ?? "nothing"}`);
  }

  const blockerRelease = routeFinalizationReleaseMux(
    releaseInput({
      candidate: {
        ...releaseInput().candidate,
        release_id: "exact-blocker-envelope",
        release_class: "exact_external_blocker",
        side_effects: [],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "no writable GitHub branch boundary is available",
      },
    }),
  );
  expectOk("exact blocker release admission", blockerRelease.ok, blockerRelease.blockers);

  const blockerEnvelope = compileTerminalReleaseEnvelope({
    release: blockerRelease,
    live_head_sha: liveHead,
    active_branch: "monday-platform-genesis-01",
    execution_boundary: "external_blocker_report",
  });
  expectOk("exact blocker envelope", blockerEnvelope.ok, blockerEnvelope.blockers);
  if (blockerEnvelope.envelope?.operation !== "emit_exact_blocker") {
    throw new Error(`expected emit_exact_blocker, got ${blockerEnvelope.envelope?.operation ?? "nothing"}`);
  }
}

runTerminalReleaseEnvelopeProof();
