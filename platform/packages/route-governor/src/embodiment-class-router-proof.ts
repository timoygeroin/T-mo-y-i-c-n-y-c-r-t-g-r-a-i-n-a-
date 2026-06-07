import {
  routeEmbodimentClass,
  type EmbodimentClassCandidate,
  type EmbodimentClassRouterInput,
  type PriorEmbodimentClassReceipt,
} from "./embodiment-class-router.js";

const branch = "monday-platform-genesis-01";
const currentHead = "c1648db4977ddb0fd660c380222328a8a62eb77c";
const priorReceipts: PriorEmbodimentClassReceipt[] = [
  {
    receipt_id: "post-commit-status-boundary",
    head_sha: currentHead,
    artifact_class: "post_commit_status_boundary",
    executable_artifacts: ["compilePostCommitStatusBoundary"],
    routing_artifacts: ["post-commit status boundary"],
    proof_surfaces: ["post-commit-status-boundary-proof"],
  },
  {
    receipt_id: "merge-readiness",
    head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
    artifact_class: "merge_readiness_compiler",
    executable_artifacts: ["compileMergeReadiness"],
    routing_artifacts: ["merge readiness compiler"],
    proof_surfaces: ["merge-readiness-proof"],
  },
];

function candidate(overrides: Partial<EmbodimentClassCandidate> = {}): EmbodimentClassCandidate {
  return {
    candidate_id: "embodiment-class-router",
    artifact_class: "embodiment_class_router",
    changed_files: ["platform/packages/route-governor/src/embodiment-class-router.ts"],
    executable_artifacts: ["routeEmbodimentClass"],
    routing_artifacts: ["embodiment class router"],
    proof_surfaces: ["embodiment-class-router-proof"],
    route_gain: "prevents the next branch mutation from counting as progress unless it introduces a new executable artifact class and proof surface",
    ...overrides,
  };
}

function input(overrides: Partial<EmbodimentClassRouterInput> = {}): EmbodimentClassRouterInput {
  return {
    branch,
    active_branch: branch,
    current_head_sha: currentHead,
    spent_artifact_classes: [
      "status_surface_classifier",
      "manifestation_release_compiler",
      "github_status_readback_compiler",
      "continuation_receipt_replay_guard",
      "head_transition_lineage_guard",
      "embodiment_increment_planner",
      "merge_readiness_compiler",
      "post_commit_status_boundary",
    ],
    prior_receipts: priorReceipts,
    candidates: [candidate()],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runEmbodimentClassRouterProof(): void {
  const selected = routeEmbodimentClass(input());
  assert(selected.ok, "new embodiment class router should be selected");
  assert(selected.action === "select_embodiment_class", `expected select_embodiment_class, got ${selected.action}`);
  assert(selected.selected_candidate_id === "embodiment-class-router", "router should select the new class");

  const spent = routeEmbodimentClass(
    input({
      candidates: [candidate({ artifact_class: "merge_readiness_compiler", proof_surfaces: ["new-merge-wrapper-proof"] })],
    }),
  );
  assert(!spent.ok, "spent artifact class must not pass under a renamed proof");
  assert(spent.action === "block_release", `expected block_release for spent class, got ${spent.action}`);

  const oldProof = routeEmbodimentClass(
    input({
      candidates: [
        candidate({
          artifact_class: "new_name_old_surface",
          proof_surfaces: ["post-commit-status-boundary-proof"],
        }),
      ],
    }),
  );
  assert(!oldProof.ok, "old proof surface must not pass under a renamed class");

  const blocker = routeEmbodimentClass(
    input({
      candidates: [],
      exact_blocker: "no non-repeated executable embodiment class is available from the current branch surface",
    }),
  );
  assert(blocker.ok, "exact blocker should be emitted when no class is available");
  assert(blocker.action === "emit_exact_blocker", `expected emit_exact_blocker, got ${blocker.action}`);
}

runEmbodimentClassRouterProof();
