import assert from "node:assert/strict";
import test from "node:test";

import {
  admitRootExportSurface,
  type RootExportSurfaceAdmissionInput,
} from "./root-export-surface-admission.js";

function input(overrides: Partial<RootExportSurfaceAdmissionInput> = {}): RootExportSurfaceAdmissionInput {
  return {
    candidate_id: "root-export-surface-admission",
    behavior_exports: ["admitRootExportSurface"],
    root_exports: ["admitRootExportSurface"],
    changed_files: ["platform/packages/route-governor/src/root-export-surface-admission.ts"],
    routing_effects: ["downstream routes can consume the behavior from the package root"],
    ...overrides,
  };
}

test("admits behavior that is executable and exposed through the root surface", () => {
  const verdict = admitRootExportSurface(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_root_consumable_behavior");
  assert.deepEqual(verdict.admitted_exports, ["admitRootExportSurface"]);
  assert.ok(verdict.decisive_evidence.includes("admitRootExportSurface"));
});

test("blocks hidden behavior that is not exported from the root surface", () => {
  const verdict = admitRootExportSurface(input({ root_exports: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_root_export");
  assert.match(verdict.blockers.join("\n"), /no root export surface/);
});

test("blocks named behavior missing from the root export list", () => {
  const verdict = admitRootExportSurface(input({ root_exports: ["otherExport"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_hidden_behavior");
  assert.match(verdict.blockers.join("\n"), /admitRootExportSurface/);
});

test("blocks candidates that change no executable source", () => {
  const verdict = admitRootExportSurface(input({ changed_files: ["platform/docs/note.md"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_behavior");
});

test("blocks root exposure without a future routing effect", () => {
  const verdict = admitRootExportSurface(input({ routing_effects: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_routing_effect");
});
