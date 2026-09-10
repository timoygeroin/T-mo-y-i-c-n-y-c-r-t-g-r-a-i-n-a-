import assert from "node:assert/strict";
import {
  createComputeRouter,
  createMemoryWorkJournal,
  createWorklessRuntimeV2,
} from "./workless-runtime-v2.mjs";

function fakeWork(result) {
  return {
    async runUntilBlocker(task) {
      return typeof result === "function" ? result(task) : result;
    },
  };
}

async function quotaReroutesWithoutKillingTask() {
  const journal = createMemoryWorkJournal();
  const router = createComputeRouter([
    { id: "astra", kind: "model", priority: 1, capabilities: ["reason"] },
    { id: "sol", kind: "model", priority: 2, capabilities: ["reason"] },
  ]);
  const seen = [];
  const runtime = createWorklessRuntimeV2({
    computeRouter: router,
    journal,
    policy: { requiredCapabilities: ["reason"] },
    workFactory: {
      async create({ provider, jobId }) {
        seen.push({ provider: provider.id, jobId });
        if (provider.id === "astra") {
          return fakeWork({ status: "blocked", blocker: "quota", final: { status: "quota" } });
        }
        return fakeWork((task) => ({
          status: "complete",
          final: { status: "verified", task, execution: { provider: provider.id } },
        }));
      },
    },
  });

  const task = { instruction: "finish the same job" };
  const result = await runtime.run(task);
  assert.equal(result.status, "complete");
  assert.equal(result.providerId, "sol");
  assert.deepEqual(seen.map((item) => item.provider), ["astra", "sol"]);
  assert.equal(seen[0].jobId, seen[1].jobId);
  assert.equal(result.final.task, task);
  assert.equal(runtime.readJob(result.jobId).status, "complete");
}

async function canFallThroughToOssCompute() {
  const router = createComputeRouter([
    { id: "astra", kind: "model", priority: 1 },
    { id: "sol", kind: "model", priority: 2 },
    { id: "oss", kind: "oss", priority: 3 },
  ], { preferKinds: ["model", "oss"] });

  const runtime = createWorklessRuntimeV2({
    computeRouter: router,
    workFactory: {
      async create({ provider }) {
        if (provider.id === "astra") {
          return fakeWork({ status: "blocked", blocker: "quota", final: { status: "quota" } });
        }
        if (provider.id === "sol") {
          return fakeWork({ status: "blocked", blocker: "provider_unavailable", final: { status: "provider_unavailable" } });
        }
        return fakeWork({ status: "complete", final: { status: "verified", execution: { provider: "oss" } } });
      },
    },
  });

  const result = await runtime.run("continue independently of ChatGPT Work credits");
  assert.equal(result.status, "complete");
  assert.equal(result.providerId, "oss");
  assert.deepEqual(result.routeAttempts.map((attempt) => attempt.providerId), ["astra", "sol", "oss"]);
}

async function semanticFailureDoesNotProviderHop() {
  const created = [];
  const router = createComputeRouter([
    { id: "astra", priority: 1 },
    { id: "sol", priority: 2 },
  ]);
  const runtime = createWorklessRuntimeV2({
    computeRouter: router,
    workFactory: {
      async create({ provider }) {
        created.push(provider.id);
        return fakeWork({
          status: "blocked",
          blocker: "verification_failed",
          final: { status: "verification_failed", verification: { accepted: false } },
        });
      },
    },
  });

  const result = await runtime.run("do not hide a semantic failure by changing models");
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "verification_failed");
  assert.deepEqual(created, ["astra"]);
}

async function steeringSurvivesReroute() {
  const journal = createMemoryWorkJournal();
  const router = createComputeRouter([
    { id: "astra", priority: 1 },
    { id: "sol", priority: 2 },
  ]);
  let firstJobId = null;
  const observedTasks = [];

  const runtime = createWorklessRuntimeV2({
    computeRouter: router,
    journal,
    workFactory: {
      async create({ provider, jobId }) {
        if (!firstJobId) firstJobId = jobId;
        if (provider.id === "astra") {
          return fakeWork(() => {
            runtime.steer(jobId, { addConstraint: "preserve the repository lineage" });
            return { status: "blocked", blocker: "quota", final: { status: "quota" } };
          });
        }
        return fakeWork((task) => {
          observedTasks.push(task);
          return { status: "complete", final: { status: "verified", task } };
        });
      },
    },
  });

  const result = await runtime.run({ instruction: "continue" });
  assert.equal(result.status, "complete");
  assert.equal(result.jobId, firstJobId);
  assert.equal(observedTasks.length, 1);
  assert.deepEqual(observedTasks[0].steering, [{ addConstraint: "preserve the repository lineage" }]);
}

await quotaReroutesWithoutKillingTask();
await canFallThroughToOssCompute();
await semanticFailureDoesNotProviderHop();
await steeringSurvivesReroute();

console.log("WORKLESS_RUNTIME_V2_PROOF_PASS 4/4");
