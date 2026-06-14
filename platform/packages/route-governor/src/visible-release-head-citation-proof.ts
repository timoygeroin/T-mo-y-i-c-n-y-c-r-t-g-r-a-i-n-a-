import {
  compileVisibleReleaseHeadCitation,
  type VisibleReleaseHeadCitationInput,
} from "./visible-release-head-citation.js";

const oldPromptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHeadBefore = "a56b89a064dcaa5272dd16b60984c39587876c3f";
const resultingHead = "next-visible-release-head";

function input(overrides: Partial<VisibleReleaseHeadCitationInput> = {}): VisibleReleaseHeadCitationInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_before: liveHeadBefore,
    resulting_head_sha: resultingHead,
    prompt_head_sha: oldPromptHead,
    resolved_historical_heads: [oldPromptHead],
    progress_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/visible-release-head-citation.ts"],
    executable_artifacts: ["compileVisibleReleaseHeadCitation"],
    routing_artifacts: ["visible release current-head citation guard"],
    proof_artifacts: ["platform/packages/route-governor/src/visible-release-head-citation-proof.ts"],
    head_claims: [
      {
        surface_id: "release-current-head",
        role: "current",
        head_sha: resultingHead,
        evidence: ["GitHub contents update returned the final commit SHA"],
      },
      {
        surface_id: "prompt-carried-repaired-head",
        role: "historical",
        head_sha: oldPromptHead,
        evidence: ["resolved repaired-head status remains historical only"],
      },
    ],
    status_claim: "none",
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

export function runVisibleReleaseHeadCitationProof(): void {
  const accepted = compileVisibleReleaseHeadCitation(input());
  expectOk("visible release citation", accepted.ok, accepted.blockers);
  if (!accepted.historical_head_shas.includes(oldPromptHead)) {
    throw new Error("resolved repaired head should remain historical, not current");
  }

  const staleCurrentHead = compileVisibleReleaseHeadCitation(
    input({
      head_claims: [
        {
          surface_id: "stale-current-claim",
          role: "current",
          head_sha: oldPromptHead,
          evidence: ["prompt carried this head, but it is no longer current"],
        },
      ],
    }),
  );
  expectBlock("stale current head", staleCurrentHead.ok, staleCurrentHead.blockers, "stale head current");

  const missingCurrentHead = compileVisibleReleaseHeadCitation(input({ head_claims: [] }));
  expectBlock(
    "missing current head citation",
    missingCurrentHead.ok,
    missingCurrentHead.blockers,
    "does not cite resulting head",
  );

  const unboundStatus = compileVisibleReleaseHeadCitation(
    input({
      status_claim: "passing",
      status_readback_head_sha: liveHeadBefore,
    }),
  );
  expectBlock("unbound status claim", unboundStatus.ok, unboundStatus.blockers, "not resulting head");

  const unmovedEmbodiment = compileVisibleReleaseHeadCitation(
    input({
      live_head_before: resultingHead,
    }),
  );
  expectBlock("unmoved embodiment", unmovedEmbodiment.ok, unmovedEmbodiment.blockers, "head did not move");
}

runVisibleReleaseHeadCitationProof();
