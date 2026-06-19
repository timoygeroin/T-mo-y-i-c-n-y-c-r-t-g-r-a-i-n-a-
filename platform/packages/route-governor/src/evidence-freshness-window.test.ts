import test from "node:test";
import assert from "node:assert/strict";
import {
  compileEvidenceFreshnessWindow,
  type EvidenceFreshnessClaim,
  type EvidenceFreshnessWindowInput,
} from "./evidence-freshness-window.js";

const LIVE_HEAD = "73a7755768570fef79307171e0bc7468b90e921d";

function claim(overrides: Partial<EvidenceFreshnessClaim> = {}): EvidenceFreshnessClaim {
  return {
    claim_id: "current-check-run",
    source: "github_check_run",
    purpose: "status_authority",
    bound_head_sha: LIVE_HEAD,
    observed_at: "2026-06-19T10:12:00Z",
    evidence: ["Route Governor Proof succeeded for live head"],
    ...overrides,
  };
}

function input(overrides: Partial<EvidenceFreshnessWindowInput> = {}): EvidenceFreshnessWindowInput {
  return {
    branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    live_head_observed_at: "2026-06-19T10:10:49Z",
    claims: [claim()],
    require_status_authority: true,
    ...overrides,
  };
}

test("accepts status authority bound to the live head and observed after live-head readback", () => {
  const verdict = compileEvidenceFreshnessWindow(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_current_status_authority");
  assert.deepEqual(verdict.accepted_claim_ids, ["current-check-run"]);
  assert.deepEqual(verdict.rejected_claim_ids, []);
});

test("blocks the prompt-carried repaired head as stale authority", () => {
  const verdict = compileEvidenceFreshnessWindow(
    input({
      claims: [
        claim({
          claim_id: "prompt-repaired-head-success",
          source: "prompt_text",
          bound_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          observed_at: "2026-06-19T10:12:00Z",
          evidence: ["seven repaired-head checks succeeded"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_head");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks PR body summaries from becoming status authority", () => {
  const verdict = compileEvidenceFreshnessWindow(
    input({
      claims: [
        claim({
          claim_id: "pr-body-current-head-summary",
          source: "pr_body_text",
          bound_head_sha: LIVE_HEAD,
          observed_at: "2026-06-19T10:12:00Z",
          evidence: ["PR body says public checks looked green"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_summary_as_status_authority");
  assert.match(verdict.blockers.join("\n"), /cannot carry status/);
});

test("blocks same-head evidence observed before the live-head readback", () => {
  const verdict = compileEvidenceFreshnessWindow(
    input({
      claims: [
        claim({
          claim_id: "old-same-head-check",
          observed_at: "2026-06-19T10:00:00Z",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_observation");
  assert.match(verdict.blockers.join("\n"), /observed before/);
});

test("accepts a current-head write receipt as routing evidence without pretending it is status", () => {
  const verdict = compileEvidenceFreshnessWindow(
    input({
      require_status_authority: false,
      claims: [
        claim({
          claim_id: "branch-write-receipt",
          source: "branch_write_receipt",
          purpose: "external_write_receipt",
          evidence: ["platform/packages/route-governor/src/evidence-freshness-window.ts"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_current_write_receipt");
  assert.match(verdict.next_route, /fresh status authority/);
});
