import assert from "node:assert/strict";
import test from "node:test";

import {
  selectPostResolutionPlatformModule,
  type PostResolutionPlatformCandidate,
  type PostResolutionPlatformModuleSelectorInput,
} from "./post-resolution-platform-module-selector.js";

const branch = "monday-platform-genesis-01";
const liveHead = "703474bd5797ddf873afc2cfc2fb52eb8e06940e";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<PostResolutionPlatformCandidate> = {}): PostResolutionPlatformCandidate {
  return {
    candidate_id: "processor-fabric-boundary",
    module_id: "processor_fabric",
    progress_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/processor-fabric/src/index.ts"],
    executable_artifacts: ["createProcessorFabricWorkQueue"],
    routing_artifacts: ["post-resolution module selector routes beyond status readback into processor-fabric"],
    proof_artifacts: ["platform/packages/route-governor/src/post-resolution-platform-module-selector-proof.ts"],
    produces_new_package_boundary: true,
    ...overrides,
  };
}

function input(overrides: Partial<PostResolutionPlatformModuleSelectorInput> = {}): PostResolutionPlatformModuleSelectorInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    resolved_boundary_ids: ["issue-1-ci-status-readback"],
    existing_package_boundaries: ["route_governor"],
    prohibited_progress_classes: ["metadata_reread", "duplicate_ci_summary", "reclose_resolved_blocker"],
    spent_candidate_ids: [],
    candidates: [candidate()],
    ...overrides,
  };
}

test("selects processor-fabric as the first post-resolution package embodiment", () => {
  const verdict = selectPostResolutionPlatformModule(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_platform_module_embodiment");
  assert.equal(verdict.selected?.candidate_id, "processor-fabric-boundary");
  assert.equal(verdict.selected?.module_id, "processor_fabric");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.quarantined_head_shas.includes(repairedHead));
});

test("prefers processor-fabric over later platform packages", () => {
  const verdict = selectPostResolutionPlatformModule(
    input({
      candidates: [
        candidate({
          candidate_id: "manifestation-engine-boundary",
          module_id: "manifestation_engine",
          changed_files: ["platform/packages/manifestation-engine/src/index.ts"],
          executable_artifacts: ["createManifestationEngine"],
          routing_artifacts: ["manifestation engine waits for earlier platform package boundaries"],
        }),
        candidate(),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.selected?.module_id, "processor_fabric");
});

test("rejects repaired-head status repetition and metadata rereads after resolution", () => {
  const verdict = selectPostResolutionPlatformModule(
    input({
      candidates: [
        candidate({
          candidate_id: "stale-status-readback",
          progress_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          produces_new_package_boundary: false,
        }),
        candidate({
          candidate_id: "metadata-reread",
          progress_class: "metadata_reread",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          produces_new_package_boundary: false,
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_selectable_platform_module");
  assert.ok(verdict.rejected.some((entry) => entry.reasons.some((reason) => reason.includes("fresh_status_readback"))));
  assert.ok(verdict.rejected.some((entry) => entry.reasons.some((reason) => reason.includes("metadata_reread"))));
});

test("blocks proof-only embodiments and stale bases", () => {
  const verdict = selectPostResolutionPlatformModule(
    input({
      candidates: [
        candidate({
          candidate_id: "proof-only",
          changed_files: ["platform/packages/route-governor/src/post-resolution-platform-module-selector-proof.ts"],
        }),
        candidate({
          candidate_id: "stale-base",
          base_head_sha: repairedHead,
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.ok(verdict.rejected.some((entry) => entry.reasons.includes("candidate is proof-only and has no behavior file")));
  assert.ok(verdict.rejected.some((entry) => entry.reasons.some((reason) => reason.includes("is not live head"))));
});

test("admits a single exact external blocker when no platform module can be selected", () => {
  const blocker = "GitHub contents API rejected creation of platform/packages/processor-fabric on the live PR branch";
  const verdict = selectPostResolutionPlatformModule(
    input({
      candidates: [
        candidate({
          candidate_id: "exact-blocker",
          progress_class: "exact_external_blocker",
          module_id: "route_governor",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          produces_new_package_boundary: false,
          blocker,
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_exact_external_blocker");
  assert.deepEqual(verdict.blockers, [blocker]);
});
