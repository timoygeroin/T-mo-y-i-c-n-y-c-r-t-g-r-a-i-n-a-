import assert from "node:assert/strict";
import { createTaskCandidateCausalController } from "./causal-task-controller.mjs";
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

async function semanticFailureDoesNotProviderHopWithoutCausalRoute() {
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

async function semanticFailureInvalidatesCausalLineThenReplans() {
  const journal = createMemoryWorkJournal();
  const router = createComputeRouter([
    { id: "astra", priority: 1, capabilities: ["reason"] },
    { id: "sol", priority: 2, capabilities: ["reason"] },
  ]);
  const providers = [];
  const attemptedCausalKeys = [];

  const runtime = createWorklessRuntimeV2({
    journal,
    computeRouter: router,
    causalController: createTaskCandidateCausalController(),
    policy: { requiredCapabilities: ["reason"] },
    workFactory: {
      async create({ provider }) {
        providers.push(provider.id);
        return fakeWork((task) => {
          attemptedCausalKeys.push(task.causalKey);
          if (task.causalKey === "route-a") {
            return {
              status: "blocked",
              blocker: "verification_failed",
              final: {
                status: "verification_failed",
                verification: {
                  accepted: false,
                  causalKey: "route-a",
                  hypothesis: "route A should satisfy the target",
                  predicted: "target satisfied",
                  observed: "target not satisfied",
                  provenance: "held-out-proof",
                },
              },
            };
          }
          return {
            status: "complete",
            final: { status: "verified", task, execution: { provider: provider.id } },
          };
        });
      },
    },
  });

  const task = {
    instruction: "try route A",
    causalKey: "route-a",
    causalCandidates: [
      { causalKey: "route-a", instruction: "try route A" },
      { causalKey: "route-b", instruction: "try fundamentally different route B" },
    ],
  };
  const result = await runtime.run(task);

  assert.equal(result.status, "complete");
  assert.equal(result.providerId, "astra");
  assert.deepEqual(providers, ["astra", "astra"]);
  assert.deepEqual(attemptedCausalKeys, ["route-a", "route-b"]);
  assert.deepEqual(result.invalidatedCausalKeys, ["route-a"]);

  const job = runtime.readJob(result.jobId);
  assert.equal(job.events.some((event) => event.phase === "causal_invalidation" && event.causalKey === "route-a"), true);
  assert.equal(job.events.some((event) => event.phase === "causal_replan" && event.toCausalKey === "route-b"), true);
}

async function exhaustedCausalCandidatesFailClosed() {
  const router = createComputeRouter([{ id: "astra", priority: 1 }]);
  const runtime = createWorklessRuntimeV2({
    computeRouter: router,
    causalController: createTaskCandidateCausalController(),
    workFactory: {
      async create() {
        return fakeWork((task) => ({
          status: "blocked",
          blocker: "verification_failed",
          final: {
            status: "verification_failed",
            verification: { accepted: false, causalKey: task.causalKey },
          },
        }));
      },
    },
  });

  const result = await runtime.run({
    instruction: "only bad route",
    causalKey: "bad-route",
    causalCandidates: [{ causalKey: "bad-route", instruction: "same bad route" }],
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "no_viable_causal_route");
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
await semanticFailureDoesNotProviderHopWithoutCausalRoute();
await semanticFailureInvalidatesCausalLineThenReplans();
await exhaustedCausalCandidatesFailClosed();
await steeringSurvivesReroute();

console.log("WORKLESS_RUNTIME_V2_PROOF_PASS 6/6");
