import { routePostRepairEmbodimentQueue, type PostRepairEmbodimentQueueInput } from "./post-repair-embodiment-queue.js";

const BRANCH = "monday-platform-genesis-01";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const LIVE_HEAD = "post-repair-live-head";

function scenario(overrides: Partial<PostRepairEmbodimentQueueInput> = {}): PostRepairEmbodimentQueueInput {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    repaired_head_sha: REPAIRED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    live_status_verdict: "passing_with_warnings",
    resolved_blocker_ids: ["issue-1-closed-completed", "blocked:ci-status-readback-retired"],
    spent_artifact_classes: ["post-repair-embodiment-admission"],
    candidates: [
      {
        candidate_id: "duplicate-ci-summary",
        move_class: "duplicate_ci_summary",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        artifact_class: "ci-summary",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
      {
        candidate_id: "warning-maintenance",
        move_class: "warning_maintenance",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        artifact_class: "node20-warning-maintenance",
        changed_files: ["platform/packages/route-governor/src/warning-maintenance-router.ts"],
        executable_artifacts: ["routeWarningMaintenance"],
        routing_artifacts: ["warning maintenance router"],
        proof_artifacts: ["warning-maintenance-router-proof"],
      },
      {
        candidate_id: "post-repair-queue",
        move_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: LIVE_HEAD,
        artifact_class: "post-repair-embodiment-queue",
        changed_files: ["platform/packages/route-governor/src/post-repair-embodiment-queue.ts"],
        executable_artifacts: ["routePostRepairEmbodimentQueue"],
        routing_artifacts: ["post-repair embodiment candidate queue"],
        proof_artifacts: ["post-repair-embodiment-queue-proof"],
      },
    ],
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostRepairEmbodimentQueueProof(): void {
  const selected = routePostRepairEmbodimentQueue(scenario());
  expect(selected.ok, `expected queue selection: ${selected.blockers.join("; ")}`);
  expect(selected.action === "select_post_repair_embodiment", `unexpected action ${selected.action}`);
  expect(selected.selected_candidate_id === "post-repair-queue", `unexpected selection ${selected.selected_candidate_id}`);
  expect(selected.retired_head_shas.includes(REPAIRED_HEAD), "repaired head should be retired by queue verdict");
  expect(
    selected.rejected.some((candidate) => candidate.candidate_id === "warning-maintenance"),
    "warning maintenance must be rejected after repaired-head success",
  );

  const staleBase = routePostRepairEmbodimentQueue(
    scenario({
      candidates: [
        {
          candidate_id: "stale-repaired-base",
          move_class: "external_platform_embodiment",
          branch: BRANCH,
          base_head_sha: REPAIRED_HEAD,
          artifact_class: "post-repair-embodiment-queue",
          changed_files: ["platform/packages/route-governor/src/post-repair-embodiment-queue.ts"],
          executable_artifacts: ["routePostRepairEmbodimentQueue"],
          routing_artifacts: ["post-repair embodiment candidate queue"],
          proof_artifacts: ["post-repair-embodiment-queue-proof"],
        },
      ],
    }),
  );
  expect(!staleBase.ok, "stale repaired-head candidate must not pass queue admission");
  expect(staleBase.action === "block_no_admissible_candidate", `unexpected stale action ${staleBase.action}`);

  const pendingStatus = routePostRepairEmbodimentQueue(scenario({ live_status_verdict: "pending" }));
  expect(!pendingStatus.ok, "pending status must block post-repair queue selection");
  expect(pendingStatus.action === "block_status_not_settled", `unexpected pending action ${pendingStatus.action}`);

  const exactBlocker = routePostRepairEmbodimentQueue(
    scenario({
      candidates: [
        {
          candidate_id: "exact-blocker",
          move_class: "exact_external_blocker",
          branch: BRANCH,
          base_head_sha: LIVE_HEAD,
          artifact_class: "live-review-unavailable-blocker",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          blocker: "no writable post-repair embodiment candidate is available on the active PR branch",
        },
      ],
    }),
  );
  expect(exactBlocker.ok, `exact blocker should pass: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "select_exact_external_blocker", `unexpected blocker action ${exactBlocker.action}`);
}

runPostRepairEmbodimentQueueProof();
