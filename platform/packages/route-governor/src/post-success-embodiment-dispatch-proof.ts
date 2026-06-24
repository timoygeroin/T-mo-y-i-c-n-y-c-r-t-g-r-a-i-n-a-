import {
  dispatchPostSuccessEmbodiment,
  type PostSuccessEmbodimentDispatchInput,
} from "./post-success-embodiment-dispatch.js";

const BRANCH = "monday-platform-genesis-01";
const HEAD = "2b26f7d4ed69932a47c8edc2cb6a7bbf42049961";

function scenario(overrides: Partial<PostSuccessEmbodimentDispatchInput> = {}): PostSuccessEmbodimentDispatchInput {
  return {
    branch: BRANCH,
    target_branch: BRANCH,
    current_head_sha: HEAD,
    accepted_status_head_sha: HEAD,
    accepted_status_run_ids: ["27049651467", "27049651469"],
    resolved_blocker_ids: ["issue-1-closed-completed", "blocked:ci-status-readback-removed"],
    spent_move_classes: ["duplicate_summary", "metadata_reread", "local_memory_guard"],
    candidates: [
      {
        candidate_id: "warning-maintenance",
        move_class: "warning_maintenance",
        base_head_sha: HEAD,
        changed_files: [".github/workflows/ci.yml"],
        executable_artifacts: ["Node.js 20 warning note"],
        routing_artifacts: [],
        proof_artifacts: [],
      },
      {
        candidate_id: "post-success-dispatch",
        move_class: "executable_routing_increment",
        base_head_sha: HEAD,
        changed_files: [
          "platform/packages/route-governor/src/post-success-embodiment-dispatch.ts",
          "platform/packages/route-governor/src/post-success-embodiment-dispatch-proof.ts",
        ],
        executable_artifacts: ["dispatchPostSuccessEmbodiment"],
        routing_artifacts: ["green current-head status dispatches only behavior-bearing embodiment"],
        proof_artifacts: ["post-success-embodiment-dispatch-proof"],
      },
    ],
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostSuccessEmbodimentDispatchProof(): void {
  const dispatched = dispatchPostSuccessEmbodiment(scenario());
  expect(dispatched.ok, `expected post-success dispatch: ${dispatched.blockers.join("; ")}`);
  expect(dispatched.action === "dispatch_executable_embodiment", `unexpected action ${dispatched.action}`);
  expect(dispatched.selected_candidate_id === "post-success-dispatch", "dispatcher must select executable embodiment");
  expect(
    dispatched.rejected.some((candidate) => candidate.candidate_id === "warning-maintenance"),
    "warning maintenance must be rejected below executable embodiment",
  );
  expect(
    dispatched.decisive_evidence.some((entry) => entry.includes("27049651467")),
    "dispatch evidence must keep accepted current-head status run id",
  );

  const missingGreen = dispatchPostSuccessEmbodiment(
    scenario({ accepted_status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841", accepted_status_run_ids: [] }),
  );
  expect(!missingGreen.ok, "dispatch must wait for current-head green readback");
  expect(missingGreen.action === "block_until_green_readback", `unexpected missing-green action ${missingGreen.action}`);

  const staleCandidate = dispatchPostSuccessEmbodiment(
    scenario({
      candidates: [
        {
          candidate_id: "stale-candidate",
          move_class: "executable_routing_increment",
          base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          changed_files: ["platform/packages/route-governor/src/post-success-embodiment-dispatch.ts"],
          executable_artifacts: ["dispatchPostSuccessEmbodiment"],
          routing_artifacts: ["stale candidate"],
          proof_artifacts: ["post-success-embodiment-dispatch-proof"],
        },
      ],
    }),
  );
  expect(!staleCandidate.ok, "stale candidate base must be rejected");
  expect(staleCandidate.rejected[0]?.reasons.some((reason) => reason.includes("is not current head")), "stale reason missing");

  const proofOnly = dispatchPostSuccessEmbodiment(
    scenario({
      candidates: [
        {
          candidate_id: "proof-only",
          move_class: "executable_routing_increment",
          base_head_sha: HEAD,
          changed_files: ["platform/packages/route-governor/src/post-success-embodiment-dispatch-proof.ts"],
          executable_artifacts: ["dispatchPostSuccessEmbodiment"],
          routing_artifacts: ["proof-only candidate"],
          proof_artifacts: ["post-success-embodiment-dispatch-proof"],
        },
      ],
    }),
  );
  expect(!proofOnly.ok, "proof-only dispatch must be rejected as incomplete");
  expect(proofOnly.rejected[0]?.reasons.includes("candidate is proof-only and has no behavior file"), "proof-only reason missing");

  const spentClass = dispatchPostSuccessEmbodiment(
    scenario({
      spent_move_classes: ["executable_routing_increment"],
      candidates: [
        {
          candidate_id: "spent-executable",
          move_class: "executable_routing_increment",
          base_head_sha: HEAD,
          changed_files: ["platform/packages/route-governor/src/post-success-embodiment-dispatch.ts"],
          executable_artifacts: ["dispatchPostSuccessEmbodiment"],
          routing_artifacts: ["spent executable class"],
          proof_artifacts: ["post-success-embodiment-dispatch-proof"],
        },
      ],
    }),
  );
  expect(!spentClass.ok, "spent executable move class must be blocked");
  expect(spentClass.rejected[0]?.reasons.includes("move class is already spent: executable_routing_increment"), "spent reason missing");

  const exactBlocker = dispatchPostSuccessEmbodiment(
    scenario({
      candidates: [
        {
          candidate_id: "exact-blocker",
          move_class: "exact_external_blocker",
          base_head_sha: HEAD,
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          blocker: "no writable post-success platform target remains",
        },
      ],
    }),
  );
  expect(exactBlocker.ok, `exact blocker should dispatch: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "dispatch_exact_external_blocker", `unexpected blocker action ${exactBlocker.action}`);

  const branchMismatch = dispatchPostSuccessEmbodiment(scenario({ branch: "main" }));
  expect(!branchMismatch.ok, "wrong branch must be blocked");
  expect(branchMismatch.action === "block_branch_mismatch", `unexpected branch action ${branchMismatch.action}`);
}

runPostSuccessEmbodimentDispatchProof();
