import { lockScheduledTerminalOperation } from "./scheduled-terminal-operation-lock.js";

const liveHead = "83f4dec1aaa09c543f5477c40d5b7fa5416799d0";

const verdict = lockScheduledTerminalOperation({
  invocation_id: "scheduled-2026-06-21T06-04-idt",
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  previous_status_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
  previous_invocation_ids: [],
  spent_operation_ids: [],
  repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
  operations: [
    {
      operation_id: "scheduled-terminal-operation-lock",
      operation_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-terminal-operation-lock.ts"],
      behavior_artifacts: ["lockScheduledTerminalOperation"],
      routing_artifacts: ["next_required_authority"],
      proof_artifacts: ["scheduled-terminal-operation-lock-proof"],
      status_surface_ids: [],
      expected_result_head_sha: "<post-write-head>",
    },
  ],
});

if (!verdict.ok || verdict.action !== "admit_single_external_embodiment") {
  throw new Error(`scheduled terminal operation proof failed: ${verdict.blockers.join("; ")}`);
}

if (verdict.next_required_authority.kind !== "moved_head_status") {
  throw new Error("scheduled terminal operation proof failed to bind moved-head status authority");
}

console.log("scheduled terminal operation lock proof ok");
