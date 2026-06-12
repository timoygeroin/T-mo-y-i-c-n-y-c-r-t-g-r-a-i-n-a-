import assert from "node:assert/strict";

import { compileFinalizationReleasePacket } from "./finalization-release-packet.js";
import type { FinalizationTerminalProgressVerdict } from "./finalization-terminal-progress-contract.js";
import type { LiveProgressReceiptVerdict } from "./live-progress-receipt.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const prNumber = 2;
const branch = "monday-platform-genesis-01";
const head = "release-head";

function terminal(overrides: Partial<FinalizationTerminalProgressVerdict> = {}): FinalizationTerminalProgressVerdict {
  return {
    ok: true,
    action: "admit_external_embodiment",
    branch,
    head_sha: head,
    decisive_evidence: [
      "platform/packages/route-governor/src/finalization-release-packet.ts",
      "compileFinalizationReleasePacket",
      "release packet compiler",
    ],
    blockers: [],
    quarantined_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    next_route: "commit the external embodiment, then read status only for the moved live head",
    ...overrides,
  };
}

function receipt(overrides: Partial<LiveProgressReceiptVerdict> = {}): LiveProgressReceiptVerdict {
  return {
    ok: true,
    action: "accept_external_progress_receipt",
    branch,
    head_sha: head,
    next_status_expected_head: head,
    decisive_evidence: [
      "release-packet-receipt",
      "base previous-head",
      "result release-head",
      "platform/packages/route-governor/src/finalization-release-packet.ts",
      "compileFinalizationReleasePacket",
      "release packet compiler",
    ],
    blockers: [],
    next_route: "read status for the resulting head before claiming checks or release readiness",
    ...overrides,
  };
}

const accepted = compileFinalizationReleasePacket({
  repository_full_name: repository,
  pr_number: prNumber,
  active_branch: branch,
  terminal: terminal(),
  receipt: receipt(),
  release_class: "external_platform_embodiment",
  status_claim: "none",
});
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "release_external_embodiment_packet");
assert.equal(accepted.next_status_expected_head, head);
assert.match(accepted.decisive_evidence.join("\n"), /no status claim made/);

const mismatchedReceipt = compileFinalizationReleasePacket({
  repository_full_name: repository,
  pr_number: prNumber,
  active_branch: branch,
  terminal: terminal(),
  receipt: receipt({ action: "accept_status_receipt" }),
  release_class: "external_platform_embodiment",
  status_claim: "none",
});
assert.equal(mismatchedReceipt.ok, false);
assert.equal(mismatchedReceipt.action, "block_receipt_mismatch");
assert.match(mismatchedReceipt.blockers.join("\n"), /does not match release class/);

const prematureStatus = compileFinalizationReleasePacket({
  repository_full_name: repository,
  pr_number: prNumber,
  active_branch: branch,
  terminal: terminal(),
  receipt: receipt(),
  release_class: "external_platform_embodiment",
  status_claim: "passing",
});
assert.equal(prematureStatus.ok, false);
assert.equal(prematureStatus.action, "block_status_claim_before_readback");
assert.match(prematureStatus.blockers.join("\n"), /has no readback bound/);

const statusPacket = compileFinalizationReleasePacket({
  repository_full_name: repository,
  pr_number: prNumber,
  active_branch: branch,
  terminal: terminal({
    action: "admit_fresh_status_readback",
    decisive_evidence: ["live-head status surface 27049651467"],
  }),
  receipt: receipt({
    action: "accept_status_receipt",
    decisive_evidence: ["live-head status surface 27049651467"],
    next_status_expected_head: null,
  }),
  release_class: "fresh_status_readback",
  status_claim: "passing",
  status_readback_head_sha: head,
});
assert.equal(statusPacket.ok, true);
assert.equal(statusPacket.action, "release_fresh_status_packet");

console.log("finalization release packet proof passed");
