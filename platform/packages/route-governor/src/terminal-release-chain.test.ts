import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileTerminalReleaseChain,
  type AcceptedTerminalReleaseLink,
  type TerminalReleaseChainInput,
} from "./terminal-release-chain.js";

const branch = "monday-platform-genesis-01";
const liveHead = "a238cc9567cca63ddb22701ffcd3cb3f17732d5b";
const previousRelease: AcceptedTerminalReleaseLink = {
  release_id: "finalization-release-mux-embodiment",
  release_class: "external_platform_embodiment",
  branch,
  base_head_sha: "115d0241e1efd3c72e2b0a716f4e840a182c5339",
  resulting_head_sha: liveHead,
  evidence_fingerprint: "finalization-release-mux:routeFinalizationReleaseMux",
};

function input(overrides: Partial<TerminalReleaseChainInput> = {}): TerminalReleaseChainInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_release: previousRelease,
    spent_release_ids: [previousRelease.release_id],
    candidate: {
      release_id: "terminal-release-chain-embodiment",
      release_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      resulting_head_sha: "next-head-after-terminal-chain",
      evidence_fingerprint: "terminal-release-chain:compileTerminalReleaseChain",
      changed_files: [
        "platform/packages/route-governor/src/terminal-release-chain.ts",
        "platform/packages/route-governor/src/terminal-release-chain.test.ts",
      ],
      executable_artifacts: ["compileTerminalReleaseChain"],
      routing_artifacts: ["terminal release chain cursor"],
      status_surface_ids: [],
    },
    ...overrides,
  };
}

test("accepts a new external embodiment that extends the previous terminal release head", () => {
  const verdict = compileTerminalReleaseChain(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_terminal_chain_link");
  assert.equal(verdict.accepted_release_id, "terminal-release-chain-embodiment");
  assert.equal(verdict.resulting_head_sha, "next-head-after-terminal-chain");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes(previousRelease.release_id));
});

test("blocks when the previous release does not end at the live head", () => {
  const verdict = compileTerminalReleaseChain(
    input({
      previous_release: {
        ...previousRelease,
        resulting_head_sha: "older-head",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_broken_previous_link");
  assert.deepEqual(verdict.blockers, [
    `previous release ${previousRelease.release_id} ends at older-head, not live head ${liveHead}`,
  ]);
});

test("blocks candidates based on anything other than the live head", () => {
  const verdict = compileTerminalReleaseChain(
    input({
      candidate: {
        ...input().candidate,
        base_head_sha: "stale-head",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_base");
  assert.deepEqual(verdict.blockers, [`candidate base stale-head is not live head ${liveHead}`]);
});

test("blocks replayed release ids and evidence fingerprints", () => {
  const verdict = compileTerminalReleaseChain(
    input({
      candidate: {
        ...input().candidate,
        release_id: previousRelease.release_id,
        evidence_fingerprint: previousRelease.evidence_fingerprint,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_release");
  assert.ok(verdict.blockers.includes(`terminal release id already spent: ${previousRelease.release_id}`));
  assert.ok(verdict.blockers.includes(`candidate repeats previous release id: ${previousRelease.release_id}`));
  assert.ok(verdict.blockers.includes("candidate repeats previous terminal release evidence fingerprint"));
});

test("blocks proof-only embodiment links", () => {
  const verdict = compileTerminalReleaseChain(
    input({
      candidate: {
        ...input().candidate,
        changed_files: ["platform/packages/route-governor/src/terminal-release-chain.test.ts"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_chain_link");
  assert.ok(verdict.blockers.includes("external embodiment has no behavior-bearing platform file change"));
});

test("blocks status readback links that pretend to move the branch", () => {
  const verdict = compileTerminalReleaseChain(
    input({
      candidate: {
        release_id: "terminal-status-readback",
        release_class: "fresh_status_readback",
        branch,
        base_head_sha: liveHead,
        resulting_head_sha: "pretend-new-head",
        evidence_fingerprint: "status:current-head-checks",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        status_surface_ids: ["check-run:27049651467"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_chain_link");
  assert.deepEqual(verdict.blockers, ["fresh status readback cannot claim a branch head movement"]);
});

test("accepts an exact blocker only when it remains on the current head", () => {
  const verdict = compileTerminalReleaseChain(
    input({
      candidate: {
        release_id: "terminal-external-blocker",
        release_class: "exact_external_blocker",
        branch,
        base_head_sha: liveHead,
        evidence_fingerprint: "blocker:no-writable-branch",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        status_surface_ids: [],
        blocker: "no writable external branch surface is available",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_terminal_chain_link");
  assert.equal(verdict.resulting_head_sha, liveHead);
  assert.deepEqual(verdict.blockers, []);
});
