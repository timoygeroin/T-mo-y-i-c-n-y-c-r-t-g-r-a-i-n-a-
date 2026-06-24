import assert from "node:assert/strict";
import { test } from "node:test";

import { compileVisibleRelease, type VisibleReleaseCompilerInput } from "./visible-release-compiler.js";

const liveHead = "b7a47ad48c3bc8edef21bc0798b230c63245f6c9";
const movedHead = "35f305f6b073d2527ca2da96e528ee975e221322";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<VisibleReleaseCompilerInput> = {}): VisibleReleaseCompilerInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    release_kind: "external_platform_embodiment",
    release_id: "visible-release-compiler-001",
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
      routing_artifacts: ["visible release rejects stale repaired-head blocker language"],
      proof_artifacts: ["runVisibleReleaseCompilerProof"],
    },
    ...overrides,
  };
}

test("compiles a visible release only for a moved executable embodiment", () => {
  const verdict = compileVisibleRelease(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_visible_external_embodiment_release");
  assert.equal(verdict.head_sha, movedHead);
  assert(verdict.visible_lines.some((line) => line.includes(movedHead)));
  assert.deepEqual(verdict.blockers, []);
});

test("blocks stale repaired-head blocker language from the visible release", () => {
  const verdict = compileVisibleRelease(
    input({ forbidden_classes: ["repaired_head_status_blocker", "duplicate_ci_summary"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_visible_release");
  assert(verdict.blockers.some((blocker) => blocker.includes("repaired_head_status_blocker")));
  assert(verdict.blockers.some((blocker) => blocker.includes("duplicate_ci_summary")));
});

test("blocks proof-only embodiment releases", () => {
  const verdict = compileVisibleRelease(
    input({
      evidence: {
        previous_head_sha: liveHead,
        resulting_head_sha: movedHead,
        changed_files: ["platform/packages/route-governor/src/visible-release-compiler-proof.ts"],
        behavior_artifacts: ["compileVisibleRelease"],
        routing_artifacts: ["visible release proof-only blocker"],
        proof_artifacts: ["runVisibleReleaseCompilerProof"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert(verdict.blockers.includes("visible embodiment release has no behavior-bearing platform file"));
});

test("blocks visible status readback for stale repaired heads", () => {
  const verdict = compileVisibleRelease(
    input({
      release_kind: "fresh_status_readback",
      evidence: {
        previous_head_sha: liveHead,
        status_head_sha: repairedHead,
        changed_files: [],
        behavior_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.quarantined_heads, [repairedHead]);
  assert(verdict.blockers.some((blocker) => blocker.includes("is not live head")));
});

test("emits one exact visible blocker when supplied", () => {
  const blocker = "GitHub merge endpoint rejected the guarded live-head merge command";
  const verdict = compileVisibleRelease(
    input({
      release_kind: "exact_external_blocker",
      evidence: {
        previous_head_sha: liveHead,
        changed_files: [],
        behavior_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker,
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_visible_exact_blocker_release");
  assert.deepEqual(verdict.visible_lines, [blocker]);
});
