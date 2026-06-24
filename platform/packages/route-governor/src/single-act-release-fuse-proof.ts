import { fuseSingleActRelease, type SingleActReleaseFuseInput } from "./single-act-release-fuse.js";

const liveHead = "de59b32df9c15c9773544aba33b1bef542f42e46";

function input(overrides: Partial<SingleActReleaseFuseInput> = {}): SingleActReleaseFuseInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    release_id: "single-act-release-fuse-proof",
    spent_release_ids: [],
    claims: [
      {
        claim_id: "single-act-fuse-embodiment",
        progress_class: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        head_sha: liveHead,
        evidence: ["commit e3aa28e70fe71ed472c53d70f8a145f253201789"],
        changed_files: ["platform/packages/route-governor/src/single-act-release-fuse.ts"],
        behavior_artifacts: ["fuseSingleActRelease"],
        routing_artifacts: ["finalization release admits exactly one external progress claim"],
      },
    ],
    ...overrides,
  };
}

function expectAction(name: string, action: string, expected: string): void {
  if (action !== expected) throw new Error(`${name} used ${action}, expected ${expected}`);
}

export function runSingleActReleaseFuseProof(): void {
  const admitted = fuseSingleActRelease(input());
  if (!admitted.ok) throw new Error(`single embodiment should pass: ${admitted.blockers.join("; ")}`);
  expectAction("single embodiment", admitted.action, "admit_single_external_progress_act");
  if (admitted.admitted_progress_class !== "external_platform_embodiment") {
    throw new Error("single embodiment did not preserve progress class");
  }

  const bundled = fuseSingleActRelease(
    input({
      claims: [
        ...input().claims,
        {
          claim_id: "status-summary-bundled-with-embodiment",
          progress_class: "fresh_status_readback",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["current-head status summary"],
          status_surface_ids: ["checks-surface-1"],
        },
      ],
    }),
  );
  if (bundled.ok) throw new Error("bundled progress claims should block");
  expectAction("bundled progress", bundled.action, "block_multiple_progress_claims");

  const duplicateComment = fuseSingleActRelease(
    input({
      claims: [
        {
          claim_id: "duplicate-comment",
          progress_class: "duplicate_comment",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["another PR comment"],
        },
      ],
    }),
  );
  if (duplicateComment.ok) throw new Error("duplicate comment should block");
  expectAction("duplicate comment", duplicateComment.action, "block_non_progress_claim");

  const staleHead = fuseSingleActRelease(
    input({ claims: [{ ...input().claims[0]!, head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }] }),
  );
  if (staleHead.ok) throw new Error("stale head claim should block");
  expectAction("stale head", staleHead.action, "block_head_mismatch");

  const exactBlocker = fuseSingleActRelease(
    input({
      release_id: "single-act-exact-blocker-proof",
      claims: [
        {
          claim_id: "next-step-blocker",
          progress_class: "exact_external_blocker",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["external writer unavailable"],
          exact_blocker: "external writer unavailable for the next embodiment step",
        },
      ],
    }),
  );
  if (!exactBlocker.ok) throw new Error(`exact blocker should pass: ${exactBlocker.blockers.join("; ")}`);
  expectAction("exact blocker", exactBlocker.action, "emit_single_exact_external_blocker");

  const missingStatusSurface = fuseSingleActRelease(
    input({
      claims: [
        {
          claim_id: "missing-status-surface",
          progress_class: "fresh_status_readback",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          evidence: ["status words without surface id"],
        },
      ],
    }),
  );
  if (missingStatusSurface.ok) throw new Error("status claim without surface id should block");
  expectAction("missing status surface", missingStatusSurface.action, "block_incomplete_status_claim");
}

runSingleActReleaseFuseProof();
