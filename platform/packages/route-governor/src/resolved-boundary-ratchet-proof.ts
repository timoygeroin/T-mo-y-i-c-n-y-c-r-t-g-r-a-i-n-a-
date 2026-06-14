import { routeResolvedBoundaryRatchet } from "./resolved-boundary-ratchet.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "f4e4213938ebd7baef0230920ecbc6e5b6f098ea";

const verdict = routeResolvedBoundaryRatchet(
  {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    issue_closed: true,
    blocker_label_removed: true,
    pr_ready_for_review: true,
    repaired_head_checks: [
      { id: "27049650678", head_sha: repairedHead, conclusion: "success" },
      { id: "27049650677", head_sha: repairedHead, conclusion: "success" },
      { id: "27049650682", head_sha: repairedHead, conclusion: "success" },
      { id: "27049651469", head_sha: repairedHead, conclusion: "success" },
      { id: "27049651460", head_sha: repairedHead, conclusion: "success" },
      { id: "27049651459", head_sha: repairedHead, conclusion: "success" },
      { id: "27049651467", head_sha: repairedHead, conclusion: "success" },
    ],
  },
  {
    move_id: "resolved-boundary-ratchet-proof",
    move_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/resolved-boundary-ratchet.ts"],
    executable_artifacts: ["routeResolvedBoundaryRatchet"],
    routing_artifacts: ["resolved repaired-head boundary cannot be replayed as a blocker"],
  },
);

if (!verdict.ok || verdict.action !== "advance_to_external_embodiment") {
  throw new Error(`resolved boundary ratchet proof failed: ${verdict.blockers.join("; ")}`);
}

console.log(JSON.stringify(verdict, null, 2));
