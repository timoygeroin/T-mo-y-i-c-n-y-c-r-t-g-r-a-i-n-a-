import assert from "node:assert/strict";
import { test } from "node:test";

import { auditProofSurfaceWiring } from "./proof-surface-wiring.js";

const proofScript = [
  "tsc -p tsconfig.json",
  "node dist/proof-examples.js",
  "node dist/post-repair-embodiment-admission-proof.js",
  "node dist/proof-chain-proof.js",
].join(" && ");

const postSuccessProof = "platform/packages/route-governor/src/post-success-embodiment-dispatch-proof.ts";
const postRepairProof = "platform/packages/route-governor/src/post-repair-embodiment-admission-proof.ts";

test("blocks changed proof surfaces that are not wired into proof examples", () => {
  const verdict = auditProofSurfaceWiring({
    proof_script: proofScript,
    required_proof_files: [],
    changed_proof_files: [postSuccessProof],
  });

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.missing_proofs, [postSuccessProof]);
  assert.equal(
    verdict.blockers[0],
    "proof surface platform/packages/route-governor/src/post-success-embodiment-dispatch-proof.ts is not wired into proof:examples as node dist/post-success-embodiment-dispatch-proof.js",
  );
  assert.match(verdict.next_route, /wire every changed proof surface/);
});

test("admits proof surfaces when the package proof command executes them", () => {
  const verdict = auditProofSurfaceWiring({
    proof_script: `${proofScript} && node dist/post-success-embodiment-dispatch-proof.js`,
    required_proof_files: [postRepairProof],
    changed_proof_files: [postSuccessProof],
  });

  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.missing_proofs, []);
  assert.deepEqual(verdict.wired_proofs, [postRepairProof, postSuccessProof]);
  assert.match(verdict.next_route, /current-head status readback/);
});

test("ignores non-proof files instead of counting them as wired proof surfaces", () => {
  const verdict = auditProofSurfaceWiring({
    proof_script: proofScript,
    required_proof_files: ["platform/packages/route-governor/src/post-success-embodiment-dispatch.ts"],
    changed_proof_files: [],
  });

  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ignored_files, ["platform/packages/route-governor/src/post-success-embodiment-dispatch.ts"]);
  assert.deepEqual(verdict.wired_proofs, []);
});
