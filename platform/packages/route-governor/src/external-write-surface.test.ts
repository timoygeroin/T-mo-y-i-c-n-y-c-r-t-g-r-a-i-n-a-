import test from "node:test";
import assert from "node:assert/strict";

import { routeExternalWriteSurface, type ExternalWriteSurfaceInput } from "./external-write-surface.js";

const liveHead = "5912fbaedc5e2a0b4d668c1404ce937c7b3a16e5";

function base(overrides: Partial<ExternalWriteSurfaceInput> = {}): ExternalWriteSurfaceInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    available_surfaces: ["pr_metadata", "github_contents_create_file", "github_contents_update_file"],
    changed_files: ["platform/packages/route-governor/src/external-write-surface.ts"],
    executable_artifacts: ["routeExternalWriteSurface"],
    routing_artifacts: ["external write surface route"],
    prohibited_blockers: [
      "old repaired-head status-readback blocker",
      "no writable external branch surface is available",
    ],
    ...overrides,
  };
}

test("routes to contents API embodiment when local checkout and CLI are absent", () => {
  const verdict = routeExternalWriteSurface(base());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "commit_via_external_write_surface");
  assert.ok(verdict.decisive_evidence.includes("write surface github_contents_create_file"));
  assert.ok(verdict.decisive_evidence.includes("routeExternalWriteSurface"));
  assert.deepEqual(verdict.blockers, []);
});

test("blocks a false no-write blocker while a contents write surface exists", () => {
  const verdict = routeExternalWriteSurface(
    base({ attempted_blocker: "no writable external branch surface is available" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_false_external_blocker");
  assert.ok(verdict.blockers[0].includes("prohibited or spent blocker"));
  assert.ok(verdict.decisive_evidence.includes("github_contents_create_file"));
});

test("emits an exact blocker only when no external write surface exists", () => {
  const verdict = routeExternalWriteSurface(
    base({
      available_surfaces: ["pr_metadata", "commit_diff", "public_rest_status"],
      attempted_blocker: "no GitHub contents, branch-ref, or git-push write surface is available",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.decisive_evidence, []);
  assert.deepEqual(verdict.blockers, ["no GitHub contents, branch-ref, or git-push write surface is available"]);
});

test("requires executable platform behavior before using the write surface", () => {
  const verdict = routeExternalWriteSurface(
    base({ changed_files: ["platform/README.md"], executable_artifacts: [], routing_artifacts: [] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["external write surface exists, but no executable platform increment is supplied"]);
});

test("rejects writes bound to the wrong branch", () => {
  const verdict = routeExternalWriteSurface(base({ branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.ok(verdict.blockers[0].includes("does not match active branch"));
});
