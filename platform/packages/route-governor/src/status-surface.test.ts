import test from "node:test";
import assert from "node:assert/strict";

import { classifyStatusSurface, isNode20ActionsDeprecationNotice, type StatusSurfaceInput } from "./status-surface.js";

const head = "0ca84baf7160df7d7d836da14727619b79f714c1";

function successfulSurface(overrides: Partial<StatusSurfaceInput> = {}): StatusSurfaceInput {
  return {
    expected_head_sha: head,
    check_runs: [
      {
        id: "27049651460",
        name: "Monday Platform CI / Route governor proof surface",
        status: "completed",
        conclusion: "success",
        head_sha: head,
      },
    ],
    workflow_runs: [
      {
        id: "27049651467",
        name: "PR Head Status Readback / Read PR head status",
        status: "completed",
        conclusion: "success",
        head_sha: head,
      },
    ],
    notices: ["Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions"],
    ...overrides,
  };
}

test("classifies Node.js 20 Actions deprecation as a non-blocking warning", () => {
  assert.equal(isNode20ActionsDeprecationNotice("Node.js 20 Actions deprecation notice"), true);
  assert.equal(isNode20ActionsDeprecationNotice("TypeScript compile failed"), false);

  const classification = classifyStatusSurface(successfulSurface());

  assert.equal(classification.ok, true);
  assert.equal(classification.verdict, "passing_with_warnings");
  assert.deepEqual(classification.blocking_failures, []);
  assert.deepEqual(classification.pending_surfaces, []);
  assert.deepEqual(classification.non_blocking_warnings, [
    "Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions",
  ]);
  assert.equal(classification.decisive_successes.length, 2);
});

test("blocks failed checks even when a deprecation notice is present", () => {
  const classification = classifyStatusSurface(
    successfulSurface({
      check_runs: [
        {
          id: "failed-check",
          name: "Route Governor Proof / Typecheck route governor",
          status: "completed",
          conclusion: "failure",
          head_sha: head,
        },
      ],
    }),
  );

  assert.equal(classification.ok, false);
  assert.equal(classification.verdict, "failing");
  assert.deepEqual(classification.blocking_failures, ["Route Governor Proof / Typecheck route governor (failed-check): failure"]);
  assert.equal(classification.non_blocking_warnings.length, 1);
});

test("keeps pending moved-head status as pending instead of guessing future CI", () => {
  const classification = classifyStatusSurface(
    successfulSurface({
      workflow_runs: [
        {
          id: "pending-run",
          name: "PR Head Status Readback / Read PR head status",
          status: "in_progress",
          conclusion: null,
          head_sha: head,
        },
      ],
    }),
  );

  assert.equal(classification.ok, false);
  assert.equal(classification.verdict, "pending");
  assert.deepEqual(classification.pending_surfaces, ["PR Head Status Readback / Read PR head status (pending-run)"]);
});

test("ignores status surfaces from older heads", () => {
  const classification = classifyStatusSurface(
    successfulSurface({
      check_runs: [
        {
          id: "old-failure",
          name: "Old head failed check",
          status: "completed",
          conclusion: "failure",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      ],
    }),
  );

  assert.equal(classification.ok, true);
  assert.equal(classification.verdict, "passing_with_warnings");
  assert.deepEqual(classification.blocking_failures, []);
});

test("requires at least one status surface for a readback verdict", () => {
  const classification = classifyStatusSurface(successfulSurface({ check_runs: [], workflow_runs: [], notices: [] }));

  assert.equal(classification.ok, false);
  assert.equal(classification.verdict, "no_status_surface");
});
