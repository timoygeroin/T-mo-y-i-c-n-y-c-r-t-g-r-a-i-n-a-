import test from "node:test";
import assert from "node:assert/strict";

import {
  routeEmbodimentClass,
  type EmbodimentClassCandidate,
  type EmbodimentClassRouterInput,
  type PriorEmbodimentClassReceipt,
} from "./embodiment-class-router.js";

const branch = "monday-platform-genesis-01";
const priorReceipts: PriorEmbodimentClassReceipt[] = [
  {
    receipt_id: "post-commit-status-boundary",
    head_sha: "c1648db4977ddb0fd660c380222328a8a62eb77c",
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
    route_gain: "selects a new executable embodiment class before another branch mutation is counted as progress",
    ...overrides,
  };
}

function input(overrides: Partial<EmbodimentClassRouterInput> = {}): EmbodimentClassRouterInput {
  return {
    branch,
    active_branch: branch,
    current_head_sha: "next-head",
    spent_artifact_classes: ["status_surface_classifier", "manifestation_release_compiler"],
    prior_receipts: priorReceipts,
    candidates: [candidate()],
    ...overrides,
  };
}

test("selects a new executable embodiment class", () => {
  const verdict = routeEmbodimentClass(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_embodiment_class");
  assert.equal(verdict.selected_candidate_id, "embodiment-class-router");
  assert.equal(verdict.artifact_class, "embodiment_class_router");
  assert.ok(verdict.decisive_evidence.includes("routeEmbodimentClass"));
  assert.ok(verdict.decisive_evidence.includes("embodiment-class-router-proof"));
});

test("blocks an artifact class that is explicitly spent", () => {
  const verdict = routeEmbodimentClass(
    input({
      candidates: [candidate({ artifact_class: "manifestation_release_compiler" })],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.ok(verdict.rejected[0]?.reasons.some((reason) => reason.includes("already spent")));
});

test("blocks a class repeated from prior receipts", () => {
  const verdict = routeEmbodimentClass(
    input({
      candidates: [
        candidate({
          artifact_class: "merge_readiness_compiler",
          proof_surfaces: ["new-merge-proof"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.rejected[0]?.reasons.some((reason) => reason.includes("repeats receipt merge-readiness")));
});

test("blocks reuse of a prior proof surface even under a new class name", () => {
  const verdict = routeEmbodimentClass(
    input({
      candidates: [
        candidate({
          artifact_class: "renamed_boundary_wrapper",
          proof_surfaces: ["post-commit-status-boundary-proof"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.rejected[0]?.reasons.some((reason) => reason.includes("proof surface already used")));
});

test("selects the strongest surviving class after rejecting repeats", () => {
  const verdict = routeEmbodimentClass(
    input({
      candidates: [
        candidate({
          candidate_id: "repeat-proof",
          artifact_class: "new-name-old-proof",
          proof_surfaces: ["merge-readiness-proof"],
        }),
        candidate({
          candidate_id: "new-class",
          changed_files: [
            "platform/packages/route-governor/src/embodiment-class-router.ts",
            "platform/packages/route-governor/src/embodiment-class-router-proof.ts",
          ],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected_candidate_id, "new-class");
  assert.equal(verdict.rejected.length, 1);
});

test("emits the exact blocker only after no class survives", () => {
  const verdict = routeEmbodimentClass(
    input({
      candidates: [
        candidate({
          candidate_id: "metadata-only",
          changed_files: ["platform/docs/status.md"],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_surfaces: [],
          route_gain: "",
        }),
      ],
      exact_blocker: "no non-repeated executable embodiment class is available from the current branch surface",
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_blocker");
  assert.deepEqual(verdict.blockers, ["no non-repeated executable embodiment class is available from the current branch surface"]);
});

test("blocks branch mismatch before selecting a class", () => {
  const verdict = routeEmbodimentClass(input({ branch: "other-branch" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_release");
  assert.ok(verdict.blockers[0]?.includes("does not match active branch"));
});
