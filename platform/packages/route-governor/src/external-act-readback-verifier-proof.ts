import { verifyExternalActReadback, type ExternalActReadbackInput } from "./external-act-readback-verifier.js";

const baseHead = "89fed15a2a4e44e74dfc548532407aa1235e6936";
const movedHead = "external-act-readback-verifier-head";

function baseInput(overrides: Partial<ExternalActReadbackInput> = {}): ExternalActReadbackInput {
  return {
    active_branch: "monday-platform-genesis-01",
    base_head_sha: baseHead,
    moved_head_sha: movedHead,
    act_id: "external-act-file-readback-verifier",
    spent_act_ids: [],
    required_readbacks: [
      {
        path: "platform/packages/route-governor/src/external-act-readback-verifier.ts",
        kind: "behavior",
        required_symbols: ["verifyExternalActReadback"],
      },
      {
        path: "platform/packages/route-governor/src/index.ts",
        kind: "routing",
        required_symbols: ["external-act-readback-verifier"],
      },
      {
        path: "platform/packages/route-governor/src/external-act-readback-verifier-proof.ts",
        kind: "proof",
        required_symbols: ["runExternalActReadbackVerifierProof"],
      },
    ],
    readbacks: [
      {
        path: "platform/packages/route-governor/src/external-act-readback-verifier.ts",
        kind: "behavior",
        source_kind: "github_file",
        branch: "monday-platform-genesis-01",
        head_sha: movedHead,
        content_sha: "behavior-content-sha",
        symbols: ["verifyExternalActReadback"],
        evidence: ["behavior file read from GitHub contents API"],
      },
      {
        path: "platform/packages/route-governor/src/index.ts",
        kind: "routing",
        source_kind: "github_file",
        branch: "monday-platform-genesis-01",
        head_sha: movedHead,
        content_sha: "index-content-sha",
        symbols: ["external-act-readback-verifier"],
        evidence: ["root export read from GitHub contents API"],
      },
      {
        path: "platform/packages/route-governor/src/external-act-readback-verifier-proof.ts",
        kind: "proof",
        source_kind: "github_file",
        branch: "monday-platform-genesis-01",
        head_sha: movedHead,
        content_sha: "proof-content-sha",
        symbols: ["runExternalActReadbackVerifierProof"],
        evidence: ["proof file read from GitHub contents API"],
      },
    ],
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runExternalActReadbackVerifierProof(): void {
  const admitted = verifyExternalActReadback(baseInput());
  expectOk("external act readback", admitted.ok, admitted.blockers);
  if (admitted.action !== "admit_external_act_readback") {
    throw new Error(`unexpected readback action: ${admitted.action}`);
  }

  const missingBehavior = verifyExternalActReadback(
    baseInput({
      readbacks: baseInput().readbacks.filter(
        (readback) => readback.path !== "platform/packages/route-governor/src/external-act-readback-verifier.ts",
      ),
    }),
  );
  expectBlock("missing behavior readback", missingBehavior.ok, missingBehavior.blockers, "external-act-readback-verifier.ts");

  const staleReadback = verifyExternalActReadback(
    baseInput({
      readbacks: baseInput().readbacks.map((readback) =>
        readback.kind === "behavior" ? { ...readback, head_sha: baseHead } : readback,
      ),
    }),
  );
  expectBlock("stale behavior readback", staleReadback.ok, staleReadback.blockers, "not moved head");

  const weakSource = verifyExternalActReadback(
    baseInput({
      readbacks: baseInput().readbacks.map((readback) =>
        readback.kind === "routing"
          ? { ...readback, source_kind: "commit_metadata" as const, content_sha: undefined }
          : readback,
      ),
    }),
  );
  expectBlock("weak readback source", weakSource.ok, weakSource.blockers, "without GitHub content SHA authority");
}

runExternalActReadbackVerifierProof();
