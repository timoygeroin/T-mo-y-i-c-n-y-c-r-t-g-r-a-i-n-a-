import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileWorkJournal } from "./file-work-journal.mjs";
import {
  createComputeRouter,
  createWorklessRuntimeV2,
} from "./workless-runtime-v2.mjs";

async function withJournalPath(run) {
  const directory = await mkdtemp(join(tmpdir(), "mondayid-workless-"));
  try {
    await run(join(directory, "journal.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function freshJournalRecoversSameJob() {
  await withJournalPath(async (path) => {
    const first = createFileWorkJournal(path);
    const task = { instruction: "preserve this exact job across process replacement" };
    const jobId = await first.open(task);
    await first.append(jobId, { phase: "observation", value: "alpha" });
    await first.steer(jobId, { constraint: "do not restart" });

    const second = createFileWorkJournal(path);
    const recovered = await second.read(jobId);
    assert.equal(recovered.jobId, jobId);
    assert.deepEqual(recovered.originalTask, task);
    assert.equal(recovered.status, "running");
    assert.equal(recovered.events[0].value, "alpha");
    assert.deepEqual(recovered.steering[0].update, { constraint: "do not restart" });

    const steering = await second.consumeSteering(jobId);
    assert.deepEqual(steering.map((item) => item.update), [{ constraint: "do not restart" }]);

    const third = createFileWorkJournal(path);
    const afterConsume = await third.read(jobId);
    assert.deepEqual(afterConsume.steering, []);
    assert.equal(afterConsume.events.some((event) => event.phase === "steer"), true);

    await third.close(jobId, "complete", { proof: "persisted" });
    const fourth = createFileWorkJournal(path);
    const closed = await fourth.read(jobId);
    assert.equal(closed.status, "complete");
    assert.deepEqual(closed.result, { proof: "persisted" });
  });
}

async function quotaFailoverPersistsToFreshReader() {
  await withJournalPath(async (path) => {
    const journal = createFileWorkJournal(path);
    const router = createComputeRouter([
      { id: "astra", kind: "model", priority: 1, capabilities: ["reason"] },
      { id: "sol", kind: "model", priority: 2, capabilities: ["reason"] },
    ]);

    const runtime = createWorklessRuntimeV2({
      journal,
      computeRouter: router,
      policy: { requiredCapabilities: ["reason"] },
      workFactory: {
        async create({ provider }) {
          return {
            async runUntilBlocker(task) {
              if (provider.id === "astra") {
                return { status: "blocked", blocker: "quota", final: { status: "quota" } };
              }
              return {
                status: "complete",
                final: { status: "verified", task, execution: { provider: provider.id } },
              };
            },
          };
        },
      },
    });

    const result = await runtime.run({ instruction: "finish even when Astra quota ends" });
    assert.equal(result.status, "complete");
    assert.equal(result.providerId, "sol");

    const freshReader = createFileWorkJournal(path);
    const recovered = await freshReader.read(result.jobId);
    assert.equal(recovered.status, "complete");
    assert.equal(recovered.events.some((event) => event.phase === "compute_reroute" && event.fromProviderId === "astra"), true);
    assert.equal(recovered.events.some((event) => event.phase === "compute_route" && event.providerId === "sol"), true);
  });
}

await freshJournalRecoversSameJob();
await quotaFailoverPersistsToFreshReader();

console.log("WORKLESS_FILE_JOURNAL_PROOF_PASS 2/2");
