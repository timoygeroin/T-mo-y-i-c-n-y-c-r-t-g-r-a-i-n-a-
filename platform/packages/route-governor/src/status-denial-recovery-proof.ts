import assert from "node:assert/strict";

import { recoverFromStatusDenial } from "./status-denial-recovery.js";

const liveHead = "b14ce943c7f19eb58a247cfc7e32fd5e98f98e7f";
const previousHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const verdict = recoverFromStatusDenial({
  branch: "monday-platform-genesis-01",
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  last_status_readback_head_sha: previousHead,
  writable_external_surface: true,
  known_live_failures: [],
  status_denials: [
    {
      receipt_id: "checks-api-403-b14ce943",
      surface_kind: "checks_api",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      reason: "http_403",
      detail: "GitHub Checks API returned 403 for the live head in this runtime",
    },
  ],
  spent_denial_receipt_ids: [],
  spent_artifact_classes: [],
  candidate: {
    candidate_id: "status-denial-recovery-router",
    artifact_class: "status-denial-recovery",
    changed_files: ["platform/packages/route-governor/src/status-denial-recovery.ts"],
    executable_artifacts: ["recoverFromStatusDenial"],
    routing_artifacts: ["status denial becomes no-status-claim embodiment routing, not a pass/fail claim"],
    proof_artifacts: ["dist/status-denial-recovery-proof.js"],
  },
});

assert.equal(verdict.ok, true);
assert.equal(verdict.action, "admit_denial_recovery_embodiment");
assert.equal(verdict.status_claim, "none");
assert.equal(verdict.admitted_candidate_id, "status-denial-recovery-router");
assert.match(verdict.next_route, /require status readback for the moved head/);

console.log("status denial recovery proof passed");
