import {
  routeFinalizationReleaseMux,
  type FinalizationReleaseMuxInput,
} from "./finalization-release-mux.js";

const branch = "monday-platform-genesis-01";
const liveHead = "115d0241e1efd3c72e2b0a716f4e840a182c5339";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function scenario(overrides: Partial<FinalizationReleaseMuxInput> = {}): FinalizationReleaseMuxInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: repairedHead,
    resolved_historical_heads: [repairedHead],
    prohibited_release_classes: [
      "pr_metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_resolved_blocker",
    ],
    spent_release_ids: [],
    candidate: {
      release_id: "finalization-release-mux-proof",
      release_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      resulting_head_sha: "next-head-after-release-mux",
      side_effects: ["branch_commit"],
      changed_files: ["platform/packages/route-governor/src/finalization-release-mux.ts"],
      executable_artifacts: ["routeFinalizationReleaseMux"],
      routing_artifacts: ["one terminal release operation for the live head"],
      proof_artifacts: ["platform/packages/route-governor/src/finalization-release-mux-proof.ts"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runFinalizationReleaseMuxProof(): void {
  const embodiment = routeFinalizationReleaseMux(scenario());
  expect(embodiment.ok, `embodiment should pass: ${embodiment.blockers.join("; ")}`);
  expect(embodiment.action === "release_external_embodiment", `unexpected action ${embodiment.action}`);
  expect(
    embodiment.quarantined_head_shas.includes(repairedHead),
    "resolved repaired head must be quarantined as historical context",
  );

  const bundled = routeFinalizationReleaseMux(
    scenario({
      candidate: {
        ...scenario().candidate,
        release_id: "bundled-comment-memory",
        side_effects: ["branch_commit", "pr_comment", "memory_update"],
      },
    }),
  );
  expect(!bundled.ok, "bundled side effects must not pass");
  expect(bundled.action === "block_bundled_release", `unexpected bundled action ${bundled.action}`);

  const staleStatus = routeFinalizationReleaseMux(
    scenario({
      candidate: {
        ...scenario().candidate,
        release_id: "stale-repaired-head-status",
        release_class: "fresh_status_readback",
        side_effects: ["status_claim"],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        status_head_sha: repairedHead,
      },
    }),
  );
  expect(!staleStatus.ok, "repaired-head status must not pass as live status");
  expect(staleStatus.action === "block_stale_status_authority", `unexpected stale status action ${staleStatus.action}`);

  const exactBlocker = routeFinalizationReleaseMux(
    scenario({
      candidate: {
        release_id: "exact-write-surface-blocker",
        release_class: "exact_external_blocker",
        branch,
        base_head_sha: liveHead,
        side_effects: [],
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "no writable external branch surface is available",
      },
    }),
  );
  expect(exactBlocker.ok, `exact blocker should pass: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "release_exact_external_blocker", `unexpected blocker action ${exactBlocker.action}`);
}

runFinalizationReleaseMuxProof();
