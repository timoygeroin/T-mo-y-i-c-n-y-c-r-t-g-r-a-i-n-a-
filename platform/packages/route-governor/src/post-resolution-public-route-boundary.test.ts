import test from "node:test";
import assert from "node:assert/strict";

import {
  admitPostResolutionPublicRouteBoundary,
  type PostResolutionPublicRouteBoundaryInput,
  type PostResolutionPublicRouteSurface,
} from "./post-resolution-public-route-boundary.js";

const branch = "monday-platform-genesis-01";
const liveHead = "live-head";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const sourcePath = "platform/packages/route-governor/src/post-resolution-public-route-boundary.ts";
const proofPath = "platform/packages/route-governor/src/post-resolution-public-route-boundary.test.ts";

function surface(overrides: Partial<PostResolutionPublicRouteSurface>): PostResolutionPublicRouteSurface {
  return {
    surface_id: "surface",
    kind: "source_file",
    branch,
    head_sha: liveHead,
    path: sourcePath,
    exports: [],
    evidence: ["surface evidence"],
    ...overrides,
  };
}

function base(overrides: Partial<PostResolutionPublicRouteBoundaryInput> = {}): PostResolutionPublicRouteBoundaryInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    resolved_boundary_ids: ["issue-1-ci-status-readback-resolved"],
    spent_route_ids: [],
    candidate: {
      route_id: "post-resolution-public-route-boundary",
      base_head_sha: liveHead,
      source_path: sourcePath,
      package_subpath: "./post-resolution-public-route-boundary",
      exported_symbols: ["admitPostResolutionPublicRouteBoundary"],
      changed_files: [sourcePath, proofPath],
      behavior_artifacts: ["admitPostResolutionPublicRouteBoundary"],
      routing_artifacts: ["public route boundary admission"],
      proof_artifacts: [proofPath],
    },
    surfaces: [
      surface({ surface_id: "source", kind: "source_file", path: sourcePath, evidence: [sourcePath] }),
      surface({
        surface_id: "root-export",
        kind: "root_barrel_export",
        path: "platform/packages/route-governor/src/index.ts",
        exports: ["admitPostResolutionPublicRouteBoundary"],
        evidence: ["root barrel exports admitPostResolutionPublicRouteBoundary"],
      }),
      surface({
        surface_id: "package-export",
        kind: "package_subpath_export",
        path: "./post-resolution-public-route-boundary",
        evidence: ["package exports ./post-resolution-public-route-boundary"],
      }),
      surface({ surface_id: "proof", kind: "proof_surface", path: proofPath, evidence: [proofPath] }),
    ],
    ...overrides,
  };
}

test("admits a live-head public route only when source, root export, package export, and proof surfaces exist", () => {
  const verdict = admitPostResolutionPublicRouteBoundary(base());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_public_route_boundary");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.accepted_surface_ids.includes("source"));
  assert.ok(verdict.accepted_surface_ids.includes("root-export"));
  assert.ok(verdict.accepted_surface_ids.includes("package-export"));
  assert.ok(verdict.accepted_surface_ids.includes("proof"));
});

test("rejects a route that is based on a stale or repaired historical head", () => {
  const verdict = admitPostResolutionPublicRouteBoundary(
    base({
      live_head_sha: "new-live-head",
      candidate: {
        ...base().candidate,
        base_head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not live head new-live-head")));
});

test("rejects private-only behavior that lacks a package subpath export", () => {
  const verdict = admitPostResolutionPublicRouteBoundary(
    base({
      surfaces: base().surfaces.filter((item) => item.kind !== "package_subpath_export"),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_public_surface");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("missing live package subpath export")));
});

test("rejects proof-only route candidates without behavior-bearing platform files", () => {
  const verdict = admitPostResolutionPublicRouteBoundary(
    base({
      candidate: {
        ...base().candidate,
        changed_files: [proofPath],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_route_candidate");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("no behavior-bearing platform file")));
});
