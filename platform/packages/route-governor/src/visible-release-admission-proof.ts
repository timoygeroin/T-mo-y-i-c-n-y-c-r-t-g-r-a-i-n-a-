import { admitVisibleRelease, type VisibleReleaseAdmissionInput } from "./visible-release-admission.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const activeBranch = "monday-platform-genesis-01";
const liveHead = "8cbc4d91c7392dd08033948f7a161f1f03638cf5";
const movedHead = "a49af742f7e5fa6afa271c61a93053fead1075a9";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function baseInput(overrides: Partial<VisibleReleaseAdmissionInput> = {}): VisibleReleaseAdmissionInput {
  const compilerInput = {
    repository_full_name: repository,
    pr_number: 2,
    branch: activeBranch,
    active_branch: activeBranch,
    live_head_sha: liveHead,
    release_kind: "external_platform_embodiment" as const,
    release_id: "visible-release-admission-pr-2",
    spent_release_ids: [],
    forbidden_classes: [],
    evidence: {
      previous_head_sha: liveHead,
      resulting_head_sha: movedHead,
      changed_files: [
        "platform/packages/route-governor/src/visible-release-admission.ts",
        "platform/packages/route-governor/src/visible-release-admission-proof.ts",
      ],
      behavior_artifacts: ["admitVisibleRelease"],
      routing_artifacts: ["visible output must equal compiled visible release lines before finalization release"],
      proof_artifacts: ["visible-release-admission-proof"],
    },
  };

  return {
    expected_repository_full_name: repository,
    expected_pr_number: 2,
    active_branch: activeBranch,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    visible_output: [
      `External embodiment committed on ${activeBranch}: ${movedHead}.`,
      "Behavior: admitVisibleRelease.",
      `Next route: read status only for ${movedHead} before any status claim.`,
    ],
    compiler_input: compilerInput,
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should block, but passed`);
  }
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runVisibleReleaseAdmissionProof(): void {
  const admitted = admitVisibleRelease(baseInput());
  expectOk("compiled visible release admission", admitted.ok, admitted.blockers);
  if (admitted.visible_output.length !== 3) {
    throw new Error(`expected three admitted visible lines, got ${admitted.visible_output.length}`);
  }

  const looseNarrative = admitVisibleRelease(
    baseInput({
      visible_output: [
        `External embodiment committed on ${activeBranch}: ${movedHead}.`,
        "Extra status summary: checks probably passed.",
      ],
    }),
  );
  expectBlock("loose visible narrative", looseNarrative.ok, looseNarrative.blockers, "does not exactly match");

  const staleBlockerLanguage = admitVisibleRelease(
    baseInput({ visible_output: [`Do not emit repaired-head status-readback blocker for ${repairedHead}.`] }),
  );
  expectBlock(
    "stale repaired-head blocker language",
    staleBlockerLanguage.ok,
    staleBlockerLanguage.blockers,
    "old repaired-head status-readback blocker",
  );

  const wrongBranch = admitVisibleRelease(
    baseInput({ compiler_input: { ...baseInput().compiler_input, branch: "main" } }),
  );
  expectBlock("wrong branch visible release", wrongBranch.ok, wrongBranch.blockers, "active branch");

  const sameHeadEmbodiment = admitVisibleRelease(
    baseInput({
      compiler_input: {
        ...baseInput().compiler_input,
        evidence: { ...baseInput().compiler_input.evidence, resulting_head_sha: liveHead },
      },
      visible_output: [],
    }),
  );
  expectBlock("same-head visible embodiment", sameHeadEmbodiment.ok, sameHeadEmbodiment.blockers, "does not move beyond live head");

  const exactBlocker = admitVisibleRelease(
    baseInput({
      visible_output: ["GitHub rejected the guarded live-head merge command"],
      compiler_input: {
        ...baseInput().compiler_input,
        release_kind: "exact_external_blocker",
        evidence: {
          previous_head_sha: liveHead,
          changed_files: [],
          behavior_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          blocker: "GitHub rejected the guarded live-head merge command",
        },
      },
    }),
  );
  expectOk("compiled exact blocker admission", exactBlocker.ok, exactBlocker.blockers);
}

runVisibleReleaseAdmissionProof();
