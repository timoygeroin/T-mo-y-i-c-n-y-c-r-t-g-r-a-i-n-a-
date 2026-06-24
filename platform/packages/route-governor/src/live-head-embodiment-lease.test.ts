import test from "node:test";
import assert from "node:assert/strict";

import {
  admitLiveHeadEmbodimentLease,
  type LiveHeadEmbodimentLeaseInput,
} from "./live-head-embodiment-lease.js";

const liveHead = "341d606f2803a45cc52b7317d46ac5586ad21a8d";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function baseInput(overrides: Partial<LiveHeadEmbodimentLeaseInput> = {}): LiveHeadEmbodimentLeaseInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    repaired_historical_heads: [repairedHead],
    spent_lease_ids: [],
    spent_write_signatures: [],
    status_lease: {
      lease_id: "live-head-341-status-lease",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      status: "passing_with_warnings",
      evidence: ["Route Governor Proof succeeded", "Node.js 20 warning is non-blocking"],
    },
    write_plan: {
      plan_id: "live-head-embodiment-lease",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/live-head-embodiment-lease.ts"],
      behavior_exports: ["admitLiveHeadEmbodimentLease"],
      routing_effects: ["forces post-write status escrow after a live-head-authorized write"],
      write_signature: "live-head-status-lease-to-write-admission",
    },
    ...overrides,
  };
}

test("admits a live-head-bound executable embodiment write after current status lease", () => {
  const verdict = admitLiveHeadEmbodimentLease(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_live_head_embodiment_lease");
  assert.equal(verdict.head_sha, liveHead);
  assert.equal(verdict.lease_id, "live-head-341-status-lease");
  assert.equal(verdict.admitted_write_signature, "live-head-status-lease-to-write-admission");
  assert.ok(verdict.decisive_evidence.includes("admitLiveHeadEmbodimentLease"));
  assert.match(verdict.next_route, /post-write status escrow/);
});

test("blocks a write plan based on the resolved repaired head", () => {
  const verdict = admitLiveHeadEmbodimentLease(
    baseInput({
      write_plan: {
        ...baseInput().write_plan,
        base_head_sha: repairedHead,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes(repairedHead)));
});

test("blocks stale status authority even when the write plan is live-head based", () => {
  const verdict = admitLiveHeadEmbodimentLease(
    baseInput({
      status_lease: {
        lease_id: "stale-repaired-head-lease",
        branch: "monday-platform-genesis-01",
        head_sha: repairedHead,
        status: "passing",
        evidence: ["seven repaired-head checks succeeded"],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_lease");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not 341d606")));
});

test("blocks pending or failing status leases before another embodiment write", () => {
  for (const status of ["pending", "failing"] as const) {
    const verdict = admitLiveHeadEmbodimentLease(
      baseInput({
        status_lease: {
          lease_id: `live-head-${status}-lease`,
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          status,
          evidence: [`live head status is ${status}`],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_unready_status_lease");
    assert.ok(verdict.next_route.includes("live-head status surface"));
  }
});

test("blocks non-executable write plans and replayed write signatures", () => {
  const nonExecutable = admitLiveHeadEmbodimentLease(
    baseInput({
      write_plan: {
        ...baseInput().write_plan,
        changed_files: ["platform/packages/route-governor/src/live-head-embodiment-lease.test.ts"],
        behavior_exports: [],
      },
    }),
  );

  assert.equal(nonExecutable.ok, false);
  assert.equal(nonExecutable.action, "block_non_executable_write");

  const replayed = admitLiveHeadEmbodimentLease(
    baseInput({
      spent_write_signatures: ["live-head-status-lease-to-write-admission"],
    }),
  );

  assert.equal(replayed.ok, false);
  assert.equal(replayed.action, "block_spent_write_signature");
});
