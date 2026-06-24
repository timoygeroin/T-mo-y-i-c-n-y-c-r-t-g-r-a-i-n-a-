import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceStatusEvidenceSufficiency,
  selectStatusEvidenceSufficientProgress,
  type StatusEvidenceCandidate,
} from "./status-evidence-sufficiency.js";

const liveHead = "8f618b7b1eb0eebcd90877be6f379fe2ee646d52";
const previousStatusHead = "a238cc9567cca63ddb22701ffcd3cb3f17732d5b";

function candidate(overrides: Partial<StatusEvidenceCandidate> = {}): StatusEvidenceCandidate {
  return {
    candidate_id: "current-head-status",
    progress_class: "fresh_status_readback",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    status_surfaces: [
      {
        surface_id: "run-27100000001",
        kind: "workflow_run",
        head_sha: liveHead,
        state: "success",
        name: "Route Governor Proof / proof examples",
      },
    ],
    ...overrides,
  };
}

function input(overrides: Partial<StatusEvidenceCandidate> = {}) {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    previous_status_head_sha: previousStatusHead,
    candidate: candidate(overrides),
  };
}

test("admits a fresh readback only with current-head status evidence", () => {
  const verdict = enforceStatusEvidenceSufficiency(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_current_head_status_readback");
  assert.match(verdict.decisive_evidence[0], /workflow_run:run-27100000001@8f618/);
});

test("blocks moved-head metadata when no status surface is attached", () => {
  const verdict = enforceStatusEvidenceSufficiency(input({ status_surfaces: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_metadata_only_status_readback");
  assert.match(verdict.blockers.join("\n"), /head moved/);
  assert.match(verdict.next_route, /do not count moved-head metadata/);
});

test("blocks stale status surfaces from an older head", () => {
  const verdict = enforceStatusEvidenceSufficiency(
    input({
      status_surfaces: [
        {
          surface_id: "run-repaired-head",
          kind: "workflow_run",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          state: "success",
          name: "PR Head Status Readback / repaired head",
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_surface");
  assert.match(verdict.blockers.join("\n"), /not bound to live head/);
});

test("rejects PR metadata reread as terminal progress", () => {
  const verdict = enforceStatusEvidenceSufficiency(input({ progress_class: "pr_metadata_reread" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_class");
  assert.match(verdict.blockers.join("\n"), /cannot substitute for a status surface/);
});

test("admits executable embodiment when status evidence is unavailable", () => {
  const verdict = enforceStatusEvidenceSufficiency(
    input({
      candidate_id: "status-evidence-gate",
      progress_class: "external_platform_embodiment",
      changed_files: ["platform/packages/route-governor/src/status-evidence-sufficiency.ts"],
      executable_artifacts: ["enforceStatusEvidenceSufficiency"],
      routing_artifacts: ["status evidence sufficiency gate"],
      status_surfaces: [],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
});

test("selector prefers real status evidence, then embodiment, then blocker", () => {
  const selection = selectStatusEvidenceSufficientProgress(
    {
      active_branch: "monday-platform-genesis-01",
      live_head_sha: liveHead,
      previous_status_head_sha: previousStatusHead,
    },
    [
      candidate({ candidate_id: "metadata-only", status_surfaces: [] }),
      candidate({
        candidate_id: "embodiment",
        progress_class: "external_platform_embodiment",
        changed_files: ["platform/packages/route-governor/src/status-evidence-sufficiency.ts"],
        executable_artifacts: ["enforceStatusEvidenceSufficiency"],
        routing_artifacts: ["status evidence sufficiency gate"],
        status_surfaces: [],
      }),
      candidate({ candidate_id: "status" }),
    ],
  );

  assert.equal(selection.ok, true);
  assert.equal(selection.selected?.candidate_id, "status");
  assert.equal(selection.rejected.length, 1);
});
