import assert from "node:assert/strict";
import { test } from "node:test";

import { compileProofManifestCoverage, type ProofManifestCoverageInput } from "./proof-manifest-coverage.js";

const branch = "monday-platform-genesis-01";
const sourcePath = "platform/packages/route-governor/src/proof-manifest-coverage.ts";
const proofPath = "platform/packages/route-governor/src/proof-manifest-coverage-proof.ts";
const distCommand = "node dist/proof-manifest-coverage-proof.js";

function input(overrides: Partial<ProofManifestCoverageInput> = {}): ProofManifestCoverageInput {
  return {
    branch,
    active_branch: branch,
    proof_command: `tsc -p tsconfig.json && ${distCommand}`,
    spent_proof_ids: [],
    manifest: [
      {
        proof_id: "proof-manifest-coverage",
        source_path: sourcePath,
        proof_path: proofPath,
        dist_command: distCommand,
      },
    ],
    ...overrides,
  };
}

test("accepts a manifest proof wired into the package proof command", () => {
  const verdict = compileProofManifestCoverage(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_proof_manifest_coverage");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes(distCommand));
});

test("blocks a proof entry that is not executed by the proof command", () => {
  const verdict = compileProofManifestCoverage(input({ proof_command: "tsc -p tsconfig.json" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "repair_proof_manifest_coverage");
  assert.deepEqual(verdict.blockers, [`proof command does not execute ${distCommand}`]);
});

test("blocks mismatched proof path and dist command", () => {
  const verdict = compileProofManifestCoverage(
    input({
      manifest: [
        {
          proof_id: "proof-manifest-coverage",
          source_path: sourcePath,
          proof_path: proofPath,
          dist_command: "node dist/other-proof.js",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("proof manifest entry proof-manifest-coverage dist command does not match proof path"));
});

test("blocks duplicated or already spent proof ids", () => {
  const verdict = compileProofManifestCoverage(
    input({
      spent_proof_ids: ["proof-manifest-coverage"],
      manifest: [
        {
          proof_id: "proof-manifest-coverage",
          source_path: sourcePath,
          proof_path: proofPath,
          dist_command: distCommand,
        },
        {
          proof_id: "proof-manifest-coverage",
          source_path: sourcePath,
          proof_path: proofPath,
          dist_command: distCommand,
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.blockers.includes("proof manifest id is duplicated: proof-manifest-coverage"));
  assert.ok(verdict.blockers.includes("proof manifest id already spent: proof-manifest-coverage"));
});

test("blocks branch mismatch before trusting the manifest", () => {
  const verdict = compileProofManifestCoverage(input({ branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
  assert.deepEqual(verdict.blockers, [`proof manifest branch main does not match active branch ${branch}`]);
});
