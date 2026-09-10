import assert from "node:assert/strict";

import { ProviderUnavailableError } from "../runtime/mondayid-agent.mjs";
import { createMondayIDAgentWorkFactory, normalizeProviderFailure } from "./mondayid-agent-work-adapter.mjs";
import {
  createComputeRouter,
  createMemoryWorkJournal,
  createWorklessRuntimeV2,
} from "./workless-runtime-v2.mjs";

const astraAdapter = {
  id: "astra",
  async complete() {
    throw new ProviderUnavailableError("synthetic Astra quota exhaustion", {
      providerId: "astra",
      code: "quota_or_rate_limit",
      retryable: true,
    });
  },
};

const solAdapter = {
  id: "sol",
  async complete() {
    return { role: "assistant", content: "sol completed the same WorkUp job" };
  },
};

const journal = createMemoryWorkJournal();
const computeRouter = createComputeRouter([
  { id: "astra", kind: "model", priority: 1, capabilities: ["reason"] },
  { id: "sol", kind: "model", priority: 2, capabilities: ["reason"] },
]);
const workFactory = createMondayIDAgentWorkFactory({
  providerAdapters: new Map([
    ["astra", astraAdapter],
    ["sol", solAdapter],
  ]),
  maxTurns: 2,
});
const runtime = createWorklessRuntimeV2({
  workFactory,
  computeRouter,
  journal,
  policy: { requiredCapabilities: ["reason"] },
});

const task = { instruction: "continue even after the strongest provider quota ends" };
const result = await runtime.run(task);

assert.equal(result.status, "complete");
assert.equal(result.providerId, "sol");
assert.equal(result.final.providerId, "sol");
assert.equal(result.final.result, "sol completed the same WorkUp job");
assert.deepEqual(result.routeAttempts.map((attempt) => attempt.providerId), ["astra", "sol"]);
assert.equal(result.routeAttempts[0].result.blocker, "rate_limit");

const persisted = runtime.readJob(result.jobId);
assert.equal(persisted.status, "complete");
assert.equal(
  persisted.events.some((event) =>
    event.phase === "compute_reroute" &&
    event.fromProviderId === "astra" &&
    event.reason === "rate_limit"),
  true,
);
assert.equal(
  persisted.events.some((event) => event.phase === "compute_route" && event.providerId === "sol"),
  true,
);

assert.equal(normalizeProviderFailure({ code: "quota_or_rate_limit" }), "rate_limit");
assert.equal(normalizeProviderFailure({ code: "network_error" }), "provider_unavailable");
assert.equal(normalizeProviderFailure({ code: "http_503" }), "provider_unavailable");
assert.equal(normalizeProviderFailure({ code: "timeout" }), "provider_timeout");

console.log("WORKUP_PROVIDER_ADAPTER_PROOF_PASS 12/12");
