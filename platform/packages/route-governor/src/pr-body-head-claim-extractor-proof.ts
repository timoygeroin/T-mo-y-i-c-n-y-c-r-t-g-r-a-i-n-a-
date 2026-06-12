import assert from "node:assert/strict";

import { extractPrBodyHeadClaims } from "./pr-body-head-claim-extractor.js";
import { compilePrBodyHeadDriftBoundary } from "./pr-body-head-drift-boundary.js";

const branch = "monday-platform-genesis-01";
const liveHead = "b1bee1721432d8adab97b728fec568268fd67553";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const staleFailureHead = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

const body = `
Repaired-head status readback obtained on 2026-06-06: the public GitHub Actions/Checks surface for ${repairedHead} shows all repaired-head checks succeeded.
Current moved-head status readback obtained on 2026-06-07: PR #2 has moved to head ${staleFailureHead}. The public GitHub Checks surface for this current head shows 7 check groups and a new current-head failure.
Current-head blocker: Monday Platform CI failed on ${staleFailureHead}.
`;

const extracted = extractPrBodyHeadClaims({ body });
assert.equal(extracted.ok, true);
assert.equal(extracted.claims.length, 3);
assert.equal(extracted.claims.some((claim) => claim.kind === "repaired_head" && claim.head_sha === repairedHead), true);
assert.equal(extracted.claims.some((claim) => claim.kind === "status_readback_head" && claim.head_sha === staleFailureHead), true);
assert.equal(extracted.claims.some((claim) => claim.kind === "blocker_head" && claim.head_sha === staleFailureHead), true);

const drift = compilePrBodyHeadDriftBoundary({
  active_branch: branch,
  live_pr_branch: branch,
  live_pr_head_sha: liveHead,
  resolved_repaired_head_sha: repairedHead,
  repaired_head_status_resolved: true,
  blocker_issue_closed: true,
  blocker_label_present: false,
  pr_body_claims: extracted.claims,
});

assert.equal(drift.ok, true);
assert.equal(drift.action, "quarantine_pr_body_head_summary");
assert.equal(drift.historical_claim_ids.length, 1);
assert.equal(drift.quarantined_claim_ids.length, 2);
assert.match(drift.next_route, /live PR head/);

const empty = extractPrBodyHeadClaims({ body: "No status prose here." });
assert.equal(empty.ok, true);
assert.deepEqual(empty.claims, []);
assert.match(empty.next_route, /non-status prose/);

const invalidLimit = extractPrBodyHeadClaims({ body, max_claims: 0 });
assert.equal(invalidLimit.ok, false);
assert.match(invalidLimit.blockers.join("\n"), /positive integer/);

console.log("pr body head claim extractor proof passed");
