import { compileVisibleRelease, type VisibleReleaseCompilerInput } from "./visible-release-compiler.js";

const liveHead = "b7a47ad48c3bc8edef21bc0798b230c63245f6c9";
const movedHead = "35f305f6b073d2527ca2da96e528ee975e221322";

function baseInput(overrides: Partial<VisibleReleaseCompilerInput> = {}): VisibleReleaseCompilerInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    release_kind: "external_platform_embodiment",
    release_id: "visible-release-compiler-proof-001",
    spent_release_ids: [],
    forbidden_classes: [],
    evidence: {
      previous_head_sha: liveHead,
      resulting_head_sha: movedHead,
      changed_files: [
        "platform/packages/route-governor/src/visible-release-compiler.ts",
        "platform/packages/route-governor/src/visible-release-compiler-proof.ts",
      ],
      behavior_artifacts: ["compileVisibleRelease"],
      routing_artifacts: ["visible release blocks stale repaired-head blocker language before final output"],
      proof_artifacts: ["runVisibleReleaseCompilerProof"],
    },
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

export function runVisibleReleaseCompilerProof(): void {
  const admitted = compileVisibleRelease(baseInput());
  expectOk("visible moved-head embodiment release", admitted.ok, admitted.blockers);
  if (!admitted.visible_lines.some((line) => line.includes(movedHead))) {
    throw new Error("visible release did not cite the moved head");
  }

  const staleBlocker = compileVisibleRelease(
    baseInput({ forbidden_classes: ["repaired_head_status_blocker", "metadata_reread"] }),
  );
  expectBlock("stale repaired-head visible release", staleBlocker.ok, staleBlocker.blockers, "repaired_head_status_blocker");

  const sameHead = compileVisibleRelease(
    baseInput({ evidence: { ...baseInput().evidence, resulting_head_sha: liveHead } }),
  );
  expectBlock("same-head visible embodiment release", sameHead.ok, sameHead.blockers, "does not move beyond live head");

  const exactBlocker = compileVisibleRelease(
    baseInput({
      release_kind: "exact_external_blocker",
      evidence: {
        previous_head_sha: liveHead,
        changed_files: [],
        behavior_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "GitHub rejected the guarded live-head merge command",
      },
    }),
  );
  expectOk("visible exact blocker release", exactBlocker.ok, exactBlocker.blockers);
}

runVisibleReleaseCompilerProof();
