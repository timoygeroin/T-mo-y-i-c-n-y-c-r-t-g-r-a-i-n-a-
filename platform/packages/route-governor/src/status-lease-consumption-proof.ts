import { consumeStatusLease } from "./status-lease-consumption.js";

const verdict = consumeStatusLease({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "b77467cb93dd646a3f65f9e8d47981912712a6e7",
  status_lease_id: "live-status-lease-b77467c",
  consumption_id: "status-lease-consumption-b77467c-embodiment",
  spent_consumption_ids: [],
  status_branch: "monday-platform-genesis-01",
  status_head_sha: "b77467cb93dd646a3f65f9e8d47981912712a6e7",
  status_conclusion: "passing_with_warnings",
  non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
  target: "external_platform_embodiment",
  target_receipt: {
    changed_files: ["platform/packages/route-governor/src/status-lease-consumption.ts"],
    behavior_artifacts: ["consumeStatusLease"],
    routing_artifacts: ["single-use status lease consumption"],
    proof_artifacts: ["status-lease-consumption-proof.ts"],
  },
});

if (!verdict.ok || verdict.action !== "consume_status_lease") {
  throw new Error(`status lease consumption proof failed: ${verdict.blockers.join("; ")}`);
}

console.log("status lease consumption proof passed");
