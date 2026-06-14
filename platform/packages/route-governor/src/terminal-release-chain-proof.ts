import { compileTerminalReleaseChain, type TerminalReleaseChainInput } from "./terminal-release-chain.js";

const branch = "monday-platform-genesis-01";
const liveHead = "a238cc9567cca63ddb22701ffcd3cb3f17732d5b";

function input(overrides: Partial<TerminalReleaseChainInput> = {}): TerminalReleaseChainInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_release: {
      release_id: "finalization-release-mux-embodiment",
      release_class: "external_platform_embodiment",
      branch,
      base_head_sha: "115d0241e1efd3c72e2b0a716f4e840a182c5339",
      resulting_head_sha: liveHead,
      evidence_fingerprint: "finalization-release-mux:routeFinalizationReleaseMux",
    },
    spent_release_ids: ["finalization-release-mux-embodiment"],
    candidate: {
      release_id: "terminal-release-chain-embodiment",
      release_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      resulting_head_sha: "next-head-after-terminal-chain",
      evidence_fingerprint: "terminal-release-chain:compileTerminalReleaseChain",
      changed_files: ["platform/packages/route-governor/src/terminal-release-chain.ts"],
      executable_artifacts: ["compileTerminalReleaseChain"],
      routing_artifacts: ["terminal release chain cursor"],
      status_surface_ids: [],
    },
    ...overrides,
  };
}

function expectProof(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runTerminalReleaseChainProof(): void {
  const accepted = compileTerminalReleaseChain(input());
  expectProof("terminal release chain embodiment", accepted.ok, accepted.blockers);

  const staleBase = compileTerminalReleaseChain(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );
  expectBlock("stale candidate base", staleBase.ok, staleBase.blockers, "candidate base");

  const replay = compileTerminalReleaseChain(
    input({
      candidate: {
        ...input().candidate,
        release_id: "finalization-release-mux-embodiment",
        evidence_fingerprint: "finalization-release-mux:routeFinalizationReleaseMux",
      },
    }),
  );
  expectBlock("replayed terminal release", replay.ok, replay.blockers, "already spent");

  const proofOnly = compileTerminalReleaseChain(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/route-governor/src/terminal-release-chain-proof.ts"],
      },
    }),
  );
  expectBlock("proof-only terminal release", proofOnly.ok, proofOnly.blockers, "behavior-bearing");
}

runTerminalReleaseChainProof();
