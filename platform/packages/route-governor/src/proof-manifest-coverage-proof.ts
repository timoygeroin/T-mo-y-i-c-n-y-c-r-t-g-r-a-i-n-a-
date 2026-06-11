import assert from "node:assert/strict";

import { compileProofManifestCoverage, type ProofManifestCoverageInput } from "./proof-manifest-coverage.js";

const branch = "monday-platform-genesis-01";
const distCommand = "node dist/proof-manifest-coverage-proof.js";

const input: ProofManifestCoverageInput = {
  branch,
  active_branch: branch,
  proof_command: `tsc -p tsconfig.json && node dist/proof-examples.js && ${distCommand}`,
  spent_proof_ids: [],
  manifest: [
    {
      proof_id: "proof-manifest-coverage",
      source_path: "platform/packages/route-governor/src/proof-manifest-coverage.ts",
      proof_path: "platform/packages/route-governor/src/proof-manifest-coverage-proof.ts",
      dist_command: distCommand,
    },
  ],
};

const accepted = compileProofManifestCoverage(input);
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_proof_manifest_coverage");
assert.match(accepted.next_route, /future proof files/);

const missingCommand = compileProofManifestCoverage({
  ...input,
  proof_command: "tsc -p tsconfig.json && node dist/proof-examples.js",
});
assert.equal(missingCommand.ok, false);
assert.equal(missingCommand.action, "repair_proof_manifest_coverage");
assert.deepEqual(missingCommand.blockers, [`proof command does not execute ${distCommand}`]);

const empty = compileProofManifestCoverage({ ...input, manifest: [] });
assert.equal(empty.ok, false);
assert.equal(empty.action, "block_empty_manifest");

console.log("proof manifest coverage proof passed");
