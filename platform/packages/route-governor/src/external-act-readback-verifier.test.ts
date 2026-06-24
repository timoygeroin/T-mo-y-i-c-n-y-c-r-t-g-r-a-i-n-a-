import { describe, it } from "node:test";
import assert from "node:assert/strict";

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

describe("verifyExternalActReadback", () => {
  it("admits an external act only after moved-head GitHub file readback covers behavior, routing, and proof", () => {
    const verdict = verifyExternalActReadback(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_external_act_readback");
    assert.equal(verdict.moved_head_sha, movedHead);
    assert.ok(verdict.decisive_evidence.includes("behavior-content-sha"));
    assert.match(verdict.next_route, /status authority remains a separate current-head surface/);
  });

  it("blocks commit metadata when GitHub file readback is missing", () => {
    const verdict = verifyExternalActReadback(
      baseInput({
        readbacks: baseInput().readbacks.filter(
          (readback) => readback.path !== "platform/packages/route-governor/src/external-act-readback-verifier.ts",
        ),
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_required_readback");
    assert.match(verdict.blockers.join("; "), /external-act-readback-verifier\.ts/);
  });

  it("blocks stale file readback from the prior head", () => {
    const stale = baseInput().readbacks.map((readback) =>
      readback.kind === "behavior" ? { ...readback, head_sha: baseHead } : readback,
    );
    const verdict = verifyExternalActReadback(baseInput({ readbacks: stale }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_readback");
    assert.match(verdict.blockers.join("; "), /not moved head/);
  });

  it("blocks weak PR diff or memory receipt sources without content SHA authority", () => {
    const weak = baseInput().readbacks.map((readback) =>
      readback.kind === "routing"
        ? { ...readback, source_kind: "pr_diff" as const, content_sha: undefined }
        : readback,
    );
    const verdict = verifyExternalActReadback(baseInput({ readbacks: weak }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_weak_readback_source");
    assert.match(verdict.blockers.join("; "), /without GitHub content SHA authority/);
  });

  it("blocks readback that does not expose the required behavior symbol", () => {
    const missingSymbol = baseInput().readbacks.map((readback) =>
      readback.kind === "proof" ? { ...readback, symbols: [] } : readback,
    );
    const verdict = verifyExternalActReadback(baseInput({ readbacks: missingSymbol }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_symbol");
    assert.match(verdict.blockers.join("; "), /runExternalActReadbackVerifierProof/);
  });

  it("blocks a receipt that did not move the branch head", () => {
    const verdict = verifyExternalActReadback(baseInput({ moved_head_sha: baseHead }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_unmoved_head");
  });
});
