import assert from "node:assert/strict";

import {
  compilePublicRouteCompleteness,
  type PublicRouteCompletenessInput,
  type PublicRouteCompletenessSurface,
} from "./public-route-completeness.js";

const branch = "monday-platform-genesis-01";
const surfaces: PublicRouteCompletenessSurface[] = [
  {
    surface_id: "finalization-delivery-gate",
    package_subpath: "./finalization-delivery-gate",
    index_export: "./finalization-delivery-gate.js",
    proof_script: "node dist/finalization-delivery-gate-proof.js",
  },
  {
    surface_id: "manifestation-source-arbitration",
    package_subpath: "./manifestation-source-arbitration",
    index_export: "./manifestation-source-arbitration.js",
    proof_script: "node dist/manifestation-source-arbitration-proof.js",
  },
  {
    surface_id: "public-route-completeness",
    package_subpath: "./public-route-completeness",
    index_export: "./public-route-completeness.js",
    proof_script: "node dist/public-route-completeness-proof.js",
  },
];

function input(overrides: Partial<PublicRouteCompletenessInput> = {}): PublicRouteCompletenessInput {
  return {
    branch,
    active_branch: branch,
    package_exports: [
      ".",
      "./finalization-delivery-gate",
      "./manifestation-source-arbitration",
      "./public-route-completeness",
    ],
    index_exports: [
      "./finalization-delivery-gate.js",
      "./manifestation-source-arbitration.js",
      "./public-route-completeness.js",
    ],
    proof_command:
      "node dist/finalization-delivery-gate-proof.js && node dist/manifestation-source-arbitration-proof.js && node dist/public-route-completeness-proof.js",
    required_surfaces: surfaces,
    ...overrides,
  };
}

const accepted = compilePublicRouteCompleteness(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_public_route_completeness");
assert.deepEqual(accepted.blockers, []);
assert.match(accepted.decisive_evidence.join("\n"), /manifestation-source-arbitration/);

const missingRootExport = compilePublicRouteCompleteness(
  input({ index_exports: ["./finalization-delivery-gate.js", "./public-route-completeness.js"] }),
);
assert.equal(missingRootExport.ok, false);
assert.equal(missingRootExport.action, "repair_public_route_completeness");
assert(
  missingRootExport.blockers.includes(
    "package-public route surface is missing root index export: manifestation-source-arbitration:./manifestation-source-arbitration -> ./manifestation-source-arbitration.js",
  ),
);

const missingPackageExport = compilePublicRouteCompleteness(
  input({ package_exports: [".", "./manifestation-source-arbitration", "./public-route-completeness"] }),
);
assert.equal(missingPackageExport.ok, false);
assert(
  missingPackageExport.blockers.includes(
    "package-public route surface is missing package export: finalization-delivery-gate:./finalization-delivery-gate",
  ),
);

const missingProofScript = compilePublicRouteCompleteness(
  input({ proof_command: "node dist/finalization-delivery-gate-proof.js && node dist/public-route-completeness-proof.js" }),
);
assert.equal(missingProofScript.ok, false);
assert(
  missingProofScript.blockers.includes(
    "package-public route surface is missing proof command: manifestation-source-arbitration:./manifestation-source-arbitration -> node dist/manifestation-source-arbitration-proof.js",
  ),
);

const wrongBranch = compilePublicRouteCompleteness(input({ branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_public_route_completeness");

console.log("public route completeness proof passed");
