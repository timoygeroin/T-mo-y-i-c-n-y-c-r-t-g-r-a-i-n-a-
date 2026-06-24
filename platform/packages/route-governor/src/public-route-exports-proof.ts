import {
  compilePublicRouteExports,
  type PublicRouteExportInput,
  type PublicRouteSurface,
} from "./public-route-exports.js";

const branch = "monday-platform-genesis-01";
const surface: PublicRouteSurface = {
  surface_id: "public-route-exports",
  package_subpath: "./public-route-exports",
  index_export: "./public-route-exports.js",
  source_path: "platform/packages/route-governor/src/public-route-exports.ts",
};

function input(overrides: Partial<PublicRouteExportInput> = {}): PublicRouteExportInput {
  return {
    branch,
    active_branch: branch,
    package_exports: [".", "./post-readback-embodiment-planner", "./public-route-exports"],
    index_exports: ["./post-readback-embodiment-planner.js", "./public-route-exports.js"],
    changed_files: [
      "platform/packages/route-governor/src/public-route-exports.ts",
      "platform/packages/route-governor/src/public-route-exports-proof.ts",
      "platform/packages/route-governor/package.json",
      "platform/packages/route-governor/src/index.ts",
      "platform/packages/route-governor/src/proof-chain-proof.ts",
    ],
    required_surfaces: [surface],
    spent_surface_ids: [],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPublicRouteExportsProof(): void {
  const ready = compilePublicRouteExports(input());
  assert(ready.ok, `public route export boundary should be accepted: ${ready.blockers.join("; ")}`);
  assert(ready.action === "accept_public_exports", `expected accept_public_exports, got ${ready.action}`);

  const missingPackageExport = compilePublicRouteExports(
    input({ package_exports: [".", "./post-readback-embodiment-planner"] }),
  );
  assert(!missingPackageExport.ok, "missing package export must block a public route surface");
  assert(
    missingPackageExport.blockers.includes("package export is missing: ./public-route-exports"),
    "missing package export blocker should be explicit",
  );

  const missingIndexExport = compilePublicRouteExports(
    input({ index_exports: ["./post-readback-embodiment-planner.js"] }),
  );
  assert(!missingIndexExport.ok, "missing index export must block a public route surface");
  assert(
    missingIndexExport.blockers.includes("index export is missing: ./public-route-exports.js"),
    "missing index export blocker should be explicit",
  );

  const orphanProof = compilePublicRouteExports(
    input({ changed_files: ["platform/packages/route-governor/src/public-route-exports.ts"] }),
  );
  assert(!orphanProof.ok, "public route surface must include its proof source in the changed files");
  assert(
    orphanProof.blockers.includes(
      "public route proof was not changed: platform/packages/route-governor/src/public-route-exports-proof.ts",
    ),
    "missing proof-source blocker should be explicit",
  );

  const spent = compilePublicRouteExports(input({ spent_surface_ids: ["public-route-exports"] }));
  assert(!spent.ok, "spent public route surface must not count as a new embodiment increment");
  assert(
    spent.blockers.includes("public route surface is already spent: public-route-exports"),
    "spent public route blocker should be explicit",
  );
}

runPublicRouteExportsProof();
