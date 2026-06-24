import {
  admitPostRepairEmbodiment,
  type PostRepairAdmissionInput,
} from "./post-repair-embodiment-admission.js";

const BRANCH = "monday-platform-genesis-01";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const MOVED_HEAD = "b690a66a5cf896e98cc564af2c45bf0f0389dbb2";

function scenario(overrides: Partial<PostRepairAdmissionInput> = {}): PostRepairAdmissionInput {
  return {
    active_branch: BRANCH,
    live_head_sha: MOVED_HEAD,
    repaired_head_sha: REPAIRED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    resolved_blocker_ids: ["blocked:ci-status-readback", "issue-1-closed-completed"],
    live_status_verdict: "passing_with_warnings",
    candidate: {
      candidate_id: "post-repair-embodiment-admission",
      move_class: "external_platform_embodiment",
      branch: BRANCH,
      base_head_sha: MOVED_HEAD,
      changed_files: [
        "platform/packages/route-governor/src/post-repair-embodiment-admission.ts",
        "platform/packages/route-governor/src/post-repair-embodiment-admission-proof.ts",
      ],
      executable_artifacts: ["admitPostRepairEmbodiment"],
      routing_artifacts: ["post-repair repaired-head retirement gate"],
      proof_artifacts: ["post-repair-embodiment-admission-proof"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostRepairEmbodimentAdmissionProof(): void {
  const admitted = admitPostRepairEmbodiment(scenario());
  expect(admitted.ok, `expected post-repair embodiment admission: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_post_repair_embodiment", `unexpected action ${admitted.action}`);
  expect(admitted.retired_head_shas.includes(REPAIRED_HEAD), "repaired head must be retired as prior evidence");
  expect(
    admitted.decisive_evidence.some((evidence) => evidence.includes("post-repair-embodiment-admission.ts")),
    "admission evidence must include the behavior-bearing executable file",
  );

  const duplicateReadback = admitPostRepairEmbodiment(
    scenario({
      live_head_sha: REPAIRED_HEAD,
      last_status_readback_head_sha: REPAIRED_HEAD,
      candidate: {
        candidate_id: "duplicate-repaired-head-readback",
        move_class: "fresh_status_readback",
        branch: BRANCH,
        base_head_sha: REPAIRED_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expect(!duplicateReadback.ok, "same-head repaired status readback must not be admitted again");
  expect(duplicateReadback.action === "block_repaired_head_replay", `unexpected readback action ${duplicateReadback.action}`);

  const staleEmbodiment = admitPostRepairEmbodiment(
    scenario({
      candidate: {
        candidate_id: "stale-repaired-head-embodiment",
        move_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: REPAIRED_HEAD,
        changed_files: ["platform/packages/route-governor/src/post-repair-embodiment-admission.ts"],
        executable_artifacts: ["admitPostRepairEmbodiment"],
        routing_artifacts: ["post-repair repaired-head retirement gate"],
        proof_artifacts: ["post-repair-embodiment-admission-proof"],
      },
    }),
  );
  expect(!staleEmbodiment.ok, "embodiment based on the repaired head must be blocked after the head moves");
  expect(staleEmbodiment.action === "block_repaired_head_replay", `unexpected stale action ${staleEmbodiment.action}`);

  const proofOnly = admitPostRepairEmbodiment(
    scenario({
      candidate: {
        candidate_id: "proof-only-post-repair",
        move_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: MOVED_HEAD,
        changed_files: ["platform/packages/route-governor/src/post-repair-embodiment-admission-proof.ts"],
        executable_artifacts: ["admitPostRepairEmbodiment"],
        routing_artifacts: ["post-repair repaired-head retirement gate"],
        proof_artifacts: ["post-repair-embodiment-admission-proof"],
      },
    }),
  );
  expect(!proofOnly.ok, "proof-only embodiment must not pass as behavior progress");
  expect(proofOnly.action === "block_incomplete_embodiment", `unexpected proof-only action ${proofOnly.action}`);

  const exactBlocker = admitPostRepairEmbodiment(
    scenario({
      candidate: {
        candidate_id: "exact-blocker",
        move_class: "exact_external_blocker",
        branch: BRANCH,
        base_head_sha: MOVED_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "live-head Checks API unavailable for moved branch head",
      },
    }),
  );
  expect(exactBlocker.ok, `exact blocker should pass: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "emit_exact_external_blocker", `unexpected blocker action ${exactBlocker.action}`);
}

runPostRepairEmbodimentAdmissionProof();
