import assert from "node:assert/strict";

import { filterScheduledRouteExhaustion, type ScheduledRouteCandidate } from "./scheduled-route-exhaustion-filter.js";

const branch = "monday-platform-genesis-01";
const head = "0e04049501203b0e0b92298871849ee7d1a5e954";

const embodiment: ScheduledRouteCandidate = {
  candidate_id: "scheduled-route-exhaustion-filter-public-surface",
  kind: "external_embodiment",
  move_class: "scheduled_route_exhaustion_filter",
  artifact_class: "route-exhaustion-filter",
  proof_module: "scheduled-route-exhaustion-filter-proof",
  changed_files: [
    "platform/packages/route-governor/src/scheduled-route-exhaustion-filter.ts",
    "platform/packages/route-governor/src/scheduled-route-exhaustion-filter-proof.ts",
  ],
  routing_evidence: ["filters spent move classes before scheduled-finalization-decision-router"],
};

const freshReadback: ScheduledRouteCandidate = {
  candidate_id: "fresh-live-head-readback",
  kind: "fresh_status_readback",
  move_class: "fresh_status_readback",
  artifact_class: "status-readback",
  proof_module: "live-status-authority-proof",
  changed_files: [],
  routing_evidence: ["head moved since prompt-carried repaired-head boundary"],
};

const exactBlocker: ScheduledRouteCandidate = {
  candidate_id: "review-approval-blocker",
  kind: "exact_blocker",
  move_class: "exact_external_blocker",
  artifact_class: "external-review-blocker",
  proof_module: "review-response-intake-proof",
  changed_files: [],
  routing_evidence: ["review response surface has no approval"],
  blocker: "required live-head review approval has not surfaced",
};

const admitted = filterScheduledRouteExhaustion({
  active_branch: branch,
  live_head_sha: head,
  spent_move_classes: ["fresh_status_readback"],
  spent_artifact_classes: ["status-readback"],
  spent_proof_modules: ["live-status-authority-proof"],
  candidates: [freshReadback, exactBlocker, embodiment],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_unspent_scheduled_route");
assert.equal(admitted.selected?.candidate_id, "scheduled-route-exhaustion-filter-public-surface");
assert.deepEqual(admitted.blockers, []);
assert.ok(admitted.decisive_evidence.includes("scheduled_route_exhaustion_filter"));
assert.ok(admitted.rejected.some((entry) => entry.candidate_id === "fresh-live-head-readback"));

const allSpent = filterScheduledRouteExhaustion({
  active_branch: branch,
  live_head_sha: head,
  spent_move_classes: ["fresh_status_readback", "exact_external_blocker", "scheduled_route_exhaustion_filter"],
  spent_artifact_classes: ["status-readback", "external-review-blocker", "route-exhaustion-filter"],
  spent_proof_modules: [
    "live-status-authority-proof",
    "review-response-intake-proof",
    "scheduled-route-exhaustion-filter-proof",
  ],
  candidates: [freshReadback, exactBlocker, embodiment],
});

assert.equal(allSpent.ok, false);
assert.equal(allSpent.action, "block_all_scheduled_routes_spent");
assert.deepEqual(allSpent.blockers, ["all scheduled route candidates are missing evidence or repeat spent route classes"]);

const missingEmbodimentEvidence = filterScheduledRouteExhaustion({
  active_branch: branch,
  live_head_sha: head,
  spent_move_classes: [],
  spent_artifact_classes: [],
  spent_proof_modules: [],
  candidates: [{ ...embodiment, changed_files: [], routing_evidence: [] }],
});

assert.equal(missingEmbodimentEvidence.ok, false);
assert.equal(missingEmbodimentEvidence.action, "block_all_scheduled_routes_spent");
assert.ok(
  missingEmbodimentEvidence.rejected[0]?.reasons.includes(
    "scheduled-route-exhaustion-filter-public-surface changes no executable platform file",
  ),
);

const missingCandidateList = filterScheduledRouteExhaustion({
  active_branch: branch,
  live_head_sha: head,
  spent_move_classes: [],
  spent_artifact_classes: [],
  spent_proof_modules: [],
  candidates: [],
});

assert.equal(missingCandidateList.ok, false);
assert.equal(missingCandidateList.action, "block_missing_route_evidence");
