import assert from "node:assert/strict";
import { test } from "node:test";

import { routeSourceIngress, type SourceIngressInput } from "./source-ingress-gate.js";

function input(overrides: Partial<SourceIngressInput> = {}): SourceIngressInput {
  return {
    scope: "manifestation_branch_continuation",
    archive_pressure_present: true,
    dima_only_ingress_complete: true,
    requires_broad_corpus_truth: false,
    available_sources: [
      {
        source_id: "docs/monday-archive-source-certification.md",
        tier: "archive_derived",
        role: "archive source law",
        present: true,
        dima_authored: false,
        canonical_raw: false,
      },
      {
        source_id: "current user instruction",
        tier: "raw",
        role: "active external sink instruction",
        present: true,
        dima_authored: true,
        canonical_raw: false,
      },
    ],
    external_refs: ["repository", "pull_request", "branch", "head_sha"],
    requested_move_class: "source_ingress_branch_admission",
    exhausted_move_classes: ["duplicate_ci_summary", "metadata_reread", "replay_resolved_blocker"],
    ...overrides,
  };
}

test("blocks broad corpus truth when canonical raw access is absent", () => {
  const verdict = routeSourceIngress(
    input({
      scope: "broad_corpus_truth",
      requires_broad_corpus_truth: true,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_raw_access");
  assert.equal(verdict.exact_blocker, "RAW_ACCESS_INSUFFICIENT");
  assert.match(verdict.next_route, /narrow the claim/);
});

test("requires Dima-only ingress before archive-pressure routing", () => {
  const verdict = routeSourceIngress(input({ dima_only_ingress_complete: false }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_dima_only_ingress");
  assert.deepEqual(verdict.blockers, ["archive pressure is present before Dima-only ingress is complete"]);
});

test("blocks summary-led routes with no stronger source support", () => {
  const verdict = routeSourceIngress(
    input({
      available_sources: [
        {
          source_id: "old model summary",
          tier: "summary_derived",
          role: "prior conclusion",
          present: true,
          dima_authored: false,
          canonical_raw: false,
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_summary_led_route");
  assert.deepEqual(verdict.blockers, ["route has no raw, direct archive, or archive-derived source support"]);
});

test("admits branch manifestation without pretending broad raw-corpus coverage", () => {
  const verdict = routeSourceIngress(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_manifestation_branch_route");
  assert.equal(verdict.admitted_scope, "manifestation_branch_continuation");
  assert.equal(verdict.exact_blocker, null);
  assert.ok(verdict.decisive_evidence.includes("external_ref:head_sha"));
  assert.match(verdict.next_route, /do not convert local branch evidence into broad corpus-truth claims/);
});

test("requires complete external refs before branch manifestation admission", () => {
  const verdict = routeSourceIngress(input({ external_refs: ["repository", "branch", "head_sha"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_external_ref");
  assert.deepEqual(verdict.blockers, ["missing external manifestation ref: pull_request"]);
});

test("blocks exhausted move classes before source admission", () => {
  const verdict = routeSourceIngress(
    input({
      requested_move_class: "metadata_reread",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_summary_led_route");
  assert.deepEqual(verdict.blockers, ["requested move class is exhausted: metadata_reread"]);
});
