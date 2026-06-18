import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { enforceLiveEmbodimentCovenant, type LiveEmbodimentCovenantInput } from "./live-embodiment-covenant.js";

const liveHead = "6155b019f02f424cca677fa34fd342d5d94a167c";
const movedHead = "post-write-head-sha";

function baseInput(overrides: Partial<LiveEmbodimentCovenantInput> = {}): LiveEmbodimentCovenantInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_covenant_ids: [],
    package_exports: ["./live-embodiment-covenant"],
    index_exports: ['export * from "./live-embodiment-covenant.js";'],
    proof_command: "tsc -p tsconfig.json && node dist/live-embodiment-covenant-proof.js",
    candidate: {
      covenant_id: "live-embodiment-covenant-public-surface",
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: [
        "platform/packages/route-governor/src/live-embodiment-covenant.ts",
        "platform/packages/route-governor/src/live-embodiment-covenant-proof.ts",
        "platform/packages/route-governor/src/index.ts",
        "platform/packages/route-governor/package.json",
      ],
      behavior_artifacts: ["enforceLiveEmbodimentCovenant"],
      routing_artifacts: ["live head base", "public export", "next status head binding"],
      proof_artifacts: ["runLiveEmbodimentCovenantProof"],
      package_export: "./live-embodiment-covenant",
      index_export: 'export * from "./live-embodiment-covenant.js";',
      proof_module: "dist/live-embodiment-covenant-proof.js",
      next_status_expected_head: movedHead,
    },
    ...overrides,
  };
}

describe("enforceLiveEmbodimentCovenant", () => {
  it("admits a live-head behavior-bearing public embodiment with next status binding", () => {
    const verdict = enforceLiveEmbodimentCovenant(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_live_embodiment_covenant");
    assert.equal(verdict.head_sha, liveHead);
    assert.equal(verdict.covenant_id, "live-embodiment-covenant-public-surface");
    assert.ok(verdict.decisive_evidence.includes(`next status head ${movedHead}`));
  });

  it("blocks a candidate based on the repaired historical head", () => {
    const verdict = enforceLiveEmbodimentCovenant(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_or_resolved_head_base");
    assert.match(verdict.blockers.join("; "), /not live PR head/);
  });

  it("blocks status summaries and warning maintenance as covenant substitutes", () => {
    const verdict = enforceLiveEmbodimentCovenant(
      baseInput({ candidate: { ...baseInput().candidate, move_class: "duplicate_ci_summary" } }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_embodiment_move");
  });

  it("blocks proof-only or manifest-only changes without behavior", () => {
    const verdict = enforceLiveEmbodimentCovenant(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          changed_files: [
            "platform/packages/route-governor/src/live-embodiment-covenant-proof.ts",
            "platform/packages/route-governor/src/index.ts",
            "platform/packages/route-governor/package.json",
          ],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_behavior_delta");
  });

  it("blocks candidates that are not publicly exported and proof-executed", () => {
    const verdict = enforceLiveEmbodimentCovenant(
      baseInput({
        package_exports: [],
        proof_command: "tsc -p tsconfig.json",
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_public_surface");
    assert.match(verdict.blockers.join("; "), /missing package export/);
  });

  it("blocks a covenant that does not bind the next status to a moved head", () => {
    const verdict = enforceLiveEmbodimentCovenant(
      baseInput({ candidate: { ...baseInput().candidate, next_status_expected_head: liveHead } }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_next_status_binding");
  });
});
