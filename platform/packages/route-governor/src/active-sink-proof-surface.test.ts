import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileActiveSinkProofSurface,
  type ActiveSinkProofSurfaceInput,
} from "./active-sink-proof-surface.js";

const head = "0f3319adaedb76d2a25f5028028bfec29f3b338f";
const branch = "monday-platform-genesis-01";

function input(overrides: Partial<ActiveSinkProofSurfaceInput> = {}): ActiveSinkProofSurfaceInput {
  return {
    live_head_sha: head,
    candidate_base_head_sha: head,
    branch,
    spent_plan_ids: [],
    module: {
      module_id: "active-sink-write-plan",
      source_path: "platform/packages/route-governor/src/active-sink-write-plan.ts",
      test_path: "platform/packages/route-governor/src/active-sink-write-plan.test.ts",
      executable_artifact: "compileActiveSinkWritePlan",
      routing_artifact: "active sink writes must bind to the live PR head before connector execution",
    },
    ...overrides,
  };
}

test("routes source-and-test active sink modules toward proof surface attachment", () => {
  const verdict = compileActiveSinkProofSurface(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "attach_proof_surface");
  assert.equal(verdict.head_sha, head);
  assert.equal(verdict.mutation?.plan_id, "active-sink-write-plan-proof-surface");
  assert.equal(verdict.mutation?.path, "platform/packages/route-governor/src/active-sink-write-plan-proof.ts");
  assert.equal(verdict.mutation?.proof_script_entry, "node dist/active-sink-write-plan-proof.js");
  assert.deepEqual(verdict.blockers, []);
});

test("accepts active sink modules only after source, test, proof path, and proof script are all present", () => {
  const verdict = compileActiveSinkProofSurface(
    input({
      module: {
        module_id: "active-sink-write-plan",
        source_path: "platform/packages/route-governor/src/active-sink-write-plan.ts",
        test_path: "platform/packages/route-governor/src/active-sink-write-plan.test.ts",
        proof_path: "platform/packages/route-governor/src/active-sink-write-plan-proof.ts",
        proof_script_entry: "node dist/active-sink-write-plan-proof.js",
        executable_artifact: "compileActiveSinkWritePlan",
        routing_artifact: "active sink writes must bind to the live PR head before connector execution",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "proof_surface_ready");
  assert.equal(verdict.mutation, null);
  assert(verdict.decisive_evidence.includes("node dist/active-sink-write-plan-proof.js"));
});

test("blocks stale-head proof surface candidates", () => {
  const stale = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
  const verdict = compileActiveSinkProofSurface(input({ candidate_base_head_sha: stale }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_head");
  assert.deepEqual(verdict.blockers, [`proof surface candidate base ${stale} is not live head ${head}`]);
});

test("blocks spent proof-surface plans and incomplete module evidence", () => {
  const spent = compileActiveSinkProofSurface(input({ spent_plan_ids: ["active-sink-write-plan-proof-surface"] }));
  assert.equal(spent.ok, false);
  assert.equal(spent.action, "block_repeated_plan");

  const missingSource = compileActiveSinkProofSurface(
    input({
      module: {
        module_id: "active-sink-write-plan",
        source_path: "",
        test_path: "platform/packages/route-governor/src/active-sink-write-plan.test.ts",
        executable_artifact: "compileActiveSinkWritePlan",
        routing_artifact: "active sink writes must bind to the live PR head before connector execution",
      },
    }),
  );
  assert.equal(missingSource.ok, false);
  assert.equal(missingSource.action, "block_missing_source");

  const missingTest = compileActiveSinkProofSurface(
    input({
      module: {
        module_id: "active-sink-write-plan",
        source_path: "platform/packages/route-governor/src/active-sink-write-plan.ts",
        test_path: "",
        executable_artifact: "compileActiveSinkWritePlan",
        routing_artifact: "active sink writes must bind to the live PR head before connector execution",
      },
    }),
  );
  assert.equal(missingTest.ok, false);
  assert.equal(missingTest.action, "block_missing_test");
});
