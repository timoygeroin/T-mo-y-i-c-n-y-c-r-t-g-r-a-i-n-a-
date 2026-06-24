import assert from "node:assert/strict";

import { selectPostEscrowContinuation } from "./post-escrow-continuation-selector.js";
import type { PostWriteStatusEscrowVerdict } from "./post-write-status-escrow.js";
import type { StatusReadbackTransportVerdict } from "./status-readback-transport.js";

const branch = "monday-platform-genesis-01";
const liveHead = "1f34695bb561cea516249b6d9057cb2a8d7347b0";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const openEscrow: PostWriteStatusEscrowVerdict = {
  ok: true,
  action: "open_post_write_status_escrow",
  branch,
  base_head_sha: repairedHead,
  required_status_head_sha: liveHead,
  escrow_id: "post-escrow-continuation-selector-proof",
  decisive_evidence: ["escrow post-escrow-continuation-selector-proof", `required status head ${liveHead}`],
  blockers: [],
  next_route: "read fresh status for the moved post-write head before later routes consume it",
};

const transportFallback: StatusReadbackTransportVerdict = {
  ok: true,
  action: "route_to_executable_embodiment",
  branch,
  required_head_sha: liveHead,
  selected_surface: null,
  decisive_evidence: [
    `head moved since previous readback: ${repairedHead} -> ${liveHead}`,
    "github_cli missing: gh command is unavailable in the runtime",
    "checks_api blocked: no connector endpoint exposed check-run data",
    "workflow_published_readback stale for repaired head",
    "post-escrow-continuation-selector",
  ],
  blocker: null,
  next_route: "skip status-claim release; commit the complete executable embodiment fallback, then read status only for the moved head",
};

const selected = selectPostEscrowContinuation({
  active_branch: branch,
  live_head_sha: liveHead,
  escrow: openEscrow,
  transport: transportFallback,
  spent_artifact_classes: ["post_write_status_escrow", "finalization_release_mux"],
  prohibited_blockers: [`CURRENT_HEAD_STATUS_READBACK_BLOCKED:${repairedHead}`],
  candidate: {
    candidate_id: "post-escrow-continuation-selector",
    artifact_class: "post_escrow_continuation_selector",
    changed_files: ["platform/packages/route-governor/src/post-escrow-continuation-selector.ts"],
    executable_artifacts: ["selectPostEscrowContinuation"],
    routing_artifacts: ["post-write escrow plus status-transport continuation selector"],
    proof_artifacts: ["platform/packages/route-governor/src/post-escrow-continuation-selector-proof.ts"],
  },
});

assert.equal(selected.ok, true);
assert.equal(selected.action, "select_statusless_embodiment");
assert.equal(selected.branch, branch);
assert.equal(selected.head_sha, liveHead);
assert(selected.decisive_evidence.includes("no current-head status claim is released"));
assert(selected.decisive_evidence.includes("selectPostEscrowContinuation"));
assert.match(selected.next_route, /new post-write status escrow/);

const staleTransport = selectPostEscrowContinuation({
  active_branch: branch,
  live_head_sha: liveHead,
  escrow: openEscrow,
  transport: { ...transportFallback, required_head_sha: repairedHead },
  spent_artifact_classes: [],
  prohibited_blockers: [],
  candidate: {
    candidate_id: "stale-proof",
    artifact_class: "stale_post_escrow_selector",
    changed_files: ["platform/packages/route-governor/src/post-escrow-continuation-selector.ts"],
    executable_artifacts: ["selectPostEscrowContinuation"],
    routing_artifacts: ["stale status transport rejection"],
    proof_artifacts: ["platform/packages/route-governor/src/post-escrow-continuation-selector-proof.ts"],
  },
});

assert.equal(staleTransport.ok, false);
assert.equal(staleTransport.action, "block_premature_or_repeated_continuation");
assert.match(staleTransport.blockers.join("\n"), /not live head/);

console.log("post-escrow continuation selector proof passed");
