import { enforceStatusEvidenceSufficiency } from "./status-evidence-sufficiency.js";

export const statusEvidenceSufficiencyReceipt = enforceStatusEvidenceSufficiency({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "8f618b7b1eb0eebcd90877be6f379fe2ee646d52",
  previous_status_head_sha: "a238cc9567cca63ddb22701ffcd3cb3f17732d5b",
  candidate: {
    candidate_id: "status-evidence-sufficiency-gate",
    progress_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    base_head_sha: "8f618b7b1eb0eebcd90877be6f379fe2ee646d52",
    changed_files: [
      "platform/packages/route-governor/src/status-evidence-sufficiency.ts",
      "platform/packages/route-governor/src/status-evidence-sufficiency.test.ts",
      "platform/packages/route-governor/src/status-evidence-sufficiency-proof.ts",
      "platform/packages/route-governor/src/status-evidence-sufficiency-receipt.ts",
    ],
    executable_artifacts: ["enforceStatusEvidenceSufficiency", "selectStatusEvidenceSufficientProgress"],
    routing_artifacts: ["status evidence sufficiency gate"],
    status_surfaces: [],
  },
});

if (!statusEvidenceSufficiencyReceipt.ok || statusEvidenceSufficiencyReceipt.action !== "admit_external_embodiment") {
  throw new Error(statusEvidenceSufficiencyReceipt.blockers.join("; "));
}
