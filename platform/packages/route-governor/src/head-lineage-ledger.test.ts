import assert from "node:assert/strict";
import { test } from "node:test";

import { compileHeadLineageLedger, type HeadLineageLedgerInput } from "./head-lineage-ledger.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "b4fefe54b67bfaa69cbf1bd837831f6d145e59c6";
const writeHead = "74a6207699ae6b21bd87ed52652577da5fbd3c4d";

function input(overrides: Partial<HeadLineageLedgerInput> = {}): HeadLineageLedgerInput {
  return {
    active_branch: branch,
    instruction_head_sha: promptHead,
    live_head_sha: liveHead,
    previous_status_head_sha: promptHead,
    status_claim: "none",
    surfaces: [
      {
        surface_id: "live-pr-metadata",
        kind: "pr_metadata",
        branch,
        head_sha: liveHead,
        evidence: [`PR #2 head is ${liveHead}`],
      },
      {
        surface_id: "prompt-carried-repaired-head",
        kind: "user_instruction",
        branch,
        head_sha: promptHead,
        evidence: [`prompt named repaired head ${promptHead}`],
      },
    ],
    ...overrides,
  };
}

test("records live head lineage while quarantining the prompt-carried repaired head", () => {
  const verdict = compileHeadLineageLedger(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "record_live_head_lineage");
  assert.equal(verdict.current_head_sha, liveHead);
  assert.deepEqual(verdict.retired_head_shas, [promptHead]);
  assert.deepEqual(verdict.accepted_surface_ids, ["live-pr-metadata"]);
  assert.deepEqual(verdict.quarantined_surface_ids, ["prompt-carried-repaired-head"]);
  assert.match(verdict.next_route, new RegExp(liveHead));
});

test("records post-write lineage and requires the resulting head as the next status target", () => {
  const verdict = compileHeadLineageLedger(
    input({
      pre_write_head_sha: liveHead,
      resulting_head_sha: writeHead,
      surfaces: [
        {
          surface_id: "contents-write-result",
          kind: "contents_write_result",
          branch,
          head_sha: writeHead,
          evidence: ["head-lineage-ledger.ts created by GitHub contents API"],
        },
        {
          surface_id: "pre-write-pr-metadata",
          kind: "pr_metadata",
          branch,
          head_sha: liveHead,
          evidence: [`pre-write head was ${liveHead}`],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "record_post_write_lineage");
  assert.equal(verdict.current_head_sha, writeHead);
  assert.equal(verdict.required_status_head_sha, writeHead);
  assert.deepEqual(verdict.accepted_surface_ids, ["contents-write-result"]);
  assert.ok(verdict.retired_head_shas.includes(promptHead));
  assert.ok(verdict.retired_head_shas.includes(liveHead));
});

test("blocks stale status claims from pre-write or prompt heads", () => {
  const verdict = compileHeadLineageLedger(
    input({
      pre_write_head_sha: liveHead,
      resulting_head_sha: writeHead,
      status_claim: "passing",
      status_claim_head_sha: liveHead,
      surfaces: [
        {
          surface_id: "contents-write-result",
          kind: "contents_write_result",
          branch,
          head_sha: writeHead,
          evidence: ["post-write head exists"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_claim");
  assert.deepEqual(verdict.blockers, [`status claim passing belongs to ${liveHead}, not current head ${writeHead}`]);
});

test("blocks write receipts that do not move the branch head", () => {
  const verdict = compileHeadLineageLedger(
    input({
      pre_write_head_sha: liveHead,
      resulting_head_sha: liveHead,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_write_head");
});

test("requires at least one surface bound to the current head", () => {
  const verdict = compileHeadLineageLedger(input({ surfaces: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_lineage_surface");
});
