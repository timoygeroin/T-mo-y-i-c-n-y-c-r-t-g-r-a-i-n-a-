import test from "node:test";
import assert from "node:assert/strict";
import {
  gateCurrentTurnManifestation,
  type CurrentTurnManifestationGateInput,
} from "./current-turn-manifestation-gate.js";

const liveHead = "738bdc3737aaedc567468b2317088a9b4a499945";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<CurrentTurnManifestationGateInput> = {}): CurrentTurnManifestationGateInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    last_status_readback_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    resolved_historical_heads: [promptHead],
    observations: [
      {
        surface_id: "pr-2-live-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: liveHead,
        evidence: [`PR #2 live head ${liveHead}`, "PR #2 open and ready for review"],
      },
      {
        surface_id: "prompt-repaired-head-summary",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: promptHead,
        status_verdict: "passing",
        evidence: [`repaired historical head ${promptHead} passed earlier checks`],
      },
    ],
    prohibited_move_classes: ["duplicate_ci_summary", "duplicate_comment", "local_memory_guard"],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/current-turn-manifestation-gate.ts"],
      executable_artifacts: ["gateCurrentTurnManifestation"],
      routing_artifacts: ["current turn manifestation gate"],
      proof_artifacts: ["platform/packages/route-governor/src/current-turn-manifestation-gate.test.ts"],
    },
    ...overrides,
  };
}

test("admits behavior-bearing current-turn embodiment on the live PR head", () => {
  const verdict = gateCurrentTurnManifestation(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_embodiment");
  assert.equal(verdict.head_sha, liveHead);
  assert.ok(verdict.accepted_surface_ids.includes("pr-2-live-metadata"));
  assert.ok(verdict.quarantined_head_shas.includes(promptHead));
  assert.ok(verdict.decisive_evidence.includes("gateCurrentTurnManifestation"));
});

test("blocks PR metadata reread as non-progress even when metadata is live", () => {
  const verdict = gateCurrentTurnManifestation(
    input({
      candidate: {
        ...input().candidate,
        move_class: "pr_metadata_reread",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
  assert.match(verdict.blockers.join("; "), /pr_metadata_reread/);
});

test("blocks candidates based on the prompt repaired head instead of the live head", () => {
  const verdict = gateCurrentTurnManifestation(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: promptHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_prompt_head");
  assert.match(verdict.blockers.join("; "), new RegExp(promptHead));
});

test("blocks status readback when only PR-body or memory summaries carry status", () => {
  const verdict = gateCurrentTurnManifestation(
    input({
      candidate: {
        ...input().candidate,
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_summary_only");
  assert.ok(verdict.summary_surface_ids.includes("prompt-repaired-head-summary"));
});

test("admits fresh status readback only with a direct live-head status surface", () => {
  const verdict = gateCurrentTurnManifestation(
    input({
      observations: [
        ...input().observations,
        {
          surface_id: "checks-live-head-738bdc",
          kind: "direct_status_surface",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          status_verdict: "passing_with_warnings",
          evidence: ["Route Governor Proof succeeded", "Node.js 20 notice is warning-only"],
        },
      ],
      candidate: {
        ...input().candidate,
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_fresh_status_readback");
  assert.ok(verdict.decisive_evidence.includes("checks-live-head-738bdc"));
});

test("blocks proof-only embodiment from counting as current-turn manifestation", () => {
  const verdict = gateCurrentTurnManifestation(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/route-governor/src/current-turn-manifestation-gate-proof.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_embodiment");
  assert.match(verdict.blockers.join("; "), /proof-only/);
});
