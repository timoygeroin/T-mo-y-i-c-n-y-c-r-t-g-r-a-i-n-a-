import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HostUnavailableError, createFileCheckpointStore, createPortableRuntime } from "./portable-runtime.mjs";

const directory = await mkdtemp(join(tmpdir(), "mondayid-portable-"));
const checkpointPath = join(directory, "state", "checkpoint.json");
const capabilities = [
  { id: "github.read", platform: "github", provides: ["read_source"] },
  { id: "runtime.verify", platform: "mondayid", provides: ["verify_result"] },
];

try {
  const firstRuntime = createPortableRuntime({
    checkpointStore: createFileCheckpointStore(checkpointPath),
    capabilities,
    hosts: [{
      id: "gpt-primary",
      priority: 1,
      async compute({ signal }) { return { result: `started:${signal}`, continuation: "step-2" }; },
    }],
  });
  const first = await firstRuntime.run("build portable MondayID");
  assert.equal(first.status, "continued");
  assert.equal(first.checkpoint.revision, 1);
  assert.equal(first.checkpoint.continuation, "step-2");

  const replacementRuntime = createPortableRuntime({
    checkpointStore: createFileCheckpointStore(checkpointPath),
    capabilities,
    hosts: [
      {
        id: "gpt-primary",
        priority: 1,
        async compute() { throw new HostUnavailableError("quota exhausted", { code: "quota_exhausted" }); },
      },
      {
        id: "fallback-model",
        priority: 2,
        async compute({ state, capabilities: restored }) {
          assert.equal(state.revision, 1);
          assert.equal(state.continuation, "step-2");
          assert.deepEqual(restored, firstRuntime.capabilityManifest);
          return { result: "completed after host replacement", continuation: null };
        },
      },
    ],
  });
  const second = await replacementRuntime.run("continue active task");
  assert.equal(second.status, "continued");
  assert.equal(second.hostId, "fallback-model");
  assert.deepEqual(second.failedHosts.map((attempt) => attempt.code), ["quota_exhausted"]);
  assert.equal(second.checkpoint.revision, 2);
  assert.equal(second.checkpoint.previousFingerprint, first.checkpoint.fingerprint);
  assert.equal(second.checkpoint.lastResult, "completed after host replacement");
  assert.deepEqual(second.checkpoint.capabilityManifest, first.checkpoint.capabilityManifest);
  assert.deepEqual(second.checkpoint.lineage.map((entry) => entry.hostId), ["gpt-primary", "fallback-model"]);

  const stale = await createFileCheckpointStore(checkpointPath).write({ activeTask: "stale overwrite" }, 1);
  assert.equal(stale.status, "stale_state");

  console.log(JSON.stringify({
    RESULT: "PASS",
    PROOF: "portable state and capability context survive process/model replacement",
    RECEIPTS: [first.receipt, second.receipt],
    FAILOVER: { from: "gpt-primary", reason: "quota_exhausted", to: "fallback-model" },
    CHECKS: {
      external_checkpoint: "PASS",
      fresh_process_recovery: "PASS",
      model_quota_failover: "PASS",
      capability_manifest_recovery: "PASS",
      lineage_preserved: "PASS",
      stale_write_rejected: "PASS",
    },
  }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
