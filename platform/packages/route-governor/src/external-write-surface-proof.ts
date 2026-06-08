import assert from "node:assert/strict";

import { routeExternalWriteSurface, type ExternalWriteSurfaceInput } from "./external-write-surface.js";

const liveHead = "5912fbaedc5e2a0b4d668c1404ce937c7b3a16e5";

function input(overrides: Partial<ExternalWriteSurfaceInput> = {}): ExternalWriteSurfaceInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    available_surfaces: ["pr_metadata", "github_contents_create_file", "github_contents_update_file"],
    changed_files: [
      "platform/packages/route-governor/src/external-write-surface.ts",
      "platform/packages/route-governor/src/external-write-surface-proof.ts",
    ],
    executable_artifacts: ["routeExternalWriteSurface"],
    routing_artifacts: ["contents API embodiment route when local checkout or gh CLI are absent"],
    attempted_blocker: undefined,
    prohibited_blockers: [
      "old repaired-head status-readback blocker",
      "no writable external branch surface is available",
    ],
    ...overrides,
  };
}

const embodiment = routeExternalWriteSurface(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "commit_via_external_write_surface");
assert.ok(embodiment.decisive_evidence.includes("write surface github_contents_create_file"));
assert.ok(embodiment.next_route.includes("moved PR head"));

const falseBlocker = routeExternalWriteSurface(input({ attempted_blocker: "no writable external branch surface is available" }));
assert.equal(falseBlocker.ok, false);
assert.equal(falseBlocker.action, "block_false_external_blocker");
assert.ok(falseBlocker.blockers[0].includes("while a write surface exists"));

const realBlocker = routeExternalWriteSurface(
  input({
    available_surfaces: ["pr_metadata", "commit_diff", "public_rest_status"],
    attempted_blocker: "no GitHub contents, branch-ref, or git-push write surface is available",
  }),
);
assert.equal(realBlocker.ok, false);
assert.equal(realBlocker.action, "emit_exact_external_blocker");
assert.deepEqual(realBlocker.blockers, ["no GitHub contents, branch-ref, or git-push write surface is available"]);

console.log("external-write-surface proof passed");
