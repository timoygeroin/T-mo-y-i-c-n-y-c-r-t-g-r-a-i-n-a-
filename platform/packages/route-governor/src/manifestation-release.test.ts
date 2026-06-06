import test from "node:test";
import assert from "node:assert/strict";

import { compileManifestationRelease, type ManifestationReleaseInput } from "./manifestation-release.js";
import { classifyStatusSurface, type StatusSurfaceInput } from "./status-surface.js";

const previousHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const movedHead = "62a8956b032bde60830c0391da47fb7af945f339";

function statusSurface(overrides: Partial<StatusSurfaceInput> = {}) {
  return classifyStatusSurface({
    expected_head_sha: movedHead,
    check_runs: [
      {
        id: "27070000001",
        name: "Monday Platform CI / Route governor proof surface",
        status: "completed",
        conclusion: "success",
        head_sha: movedHead,
      },
    ],
    workflow_runs: [
      {
        id: "27070000002",
        name: "PR Head Status Readback / Read PR head status",
        status: "completed",
        conclusion: "success",
        head_sha: movedHead,
      },
    ],
    notices: ["Node.js 20 Actions deprecation notice for checkout/setup/upload-artifact actions"],
    ...overrides,
  });
}

function releaseInput(overrides: Partial<ManifestationReleaseInput> = {}): ManifestationReleaseInput {
  return {
    current_head_sha: movedHead,
    previous_readback_head_sha: previousHead,
    new_check_run_ids: [],
    status_surface: statusSurface(),
    ...overrides,
  };
}

test("publishes a fresh moved-head status readback when no executable embodiment is present", () => {
  const verdict = compileManifestationRelease(releaseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "publish_fresh_status_readback");
  assert.equal(verdict.selected_candidate_id, "fresh-status-readback");
  assert.deepEqual(verdict.decisive_evidence, [`head moved from ${previousHead} to ${movedHead}`]);
});

test("selects executable embodiment over lower-class status readback", () => {
  const verdict = compileManifestationRelease(
    releaseInput({
      embodiment: {
        changed_files: ["platform/packages/route-governor/src/manifestation-release.ts"],
        executable_artifacts: ["compileManifestationRelease"],
        routing_artifacts: ["manifestation release compiler"],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "commit_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "external-embodiment");
  assert.ok(verdict.decisive_evidence.includes("compileManifestationRelease"));
});

test("holds stale passing status when neither head nor checks moved", () => {
  const verdict = compileManifestationRelease(
    releaseInput({
      current_head_sha: movedHead,
      previous_readback_head_sha: movedHead,
      new_check_run_ids: [],
      status_surface: statusSurface(),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "hold_release");
  assert.equal(verdict.selected_candidate_id, null);
  assert.ok(verdict.failures.some((failure) => failure.includes("fresh status readback requires a moved PR head")));
});

test("emits a concrete blocker from failing current-head status", () => {
  const failingStatus = statusSurface({
    check_runs: [
      {
        id: "failed-check",
        name: "Route Governor Proof / Typecheck route governor",
        status: "completed",
        conclusion: "failure",
        head_sha: movedHead,
      },
    ],
    workflow_runs: [],
    notices: [],
  });

  const verdict = compileManifestationRelease(releaseInput({ status_surface: failingStatus }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_blocker");
  assert.equal(verdict.selected_candidate_id, "status-surface-blocker");
  assert.deepEqual(verdict.decisive_evidence, ["Route Governor Proof / Typecheck route governor (failed-check): failure"]);
});
