import assert from "node:assert/strict";

import { ProviderUnavailableError } from "../runtime/mondayid-agent.mjs";
import { createMondayIDAgentWorkFactory, normalizeProviderFailure } from "./mondayid-agent-work-adapter.mjs";
import {
  createComputeRouter,
  createMemoryWorkJournal,
  createWorklessRuntimeV2,
} from "./workless-runtime-v2.mjs";

function computeCatalog() {
  return [
    { id: "astra", kind: "model", priority: 1, capabilities: ["reason"] },
    { id: "sol", kind: "model", priority: 2, capabilities: ["reason"] },
  ];
}

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

async function providerFailoverRequiresIndependentVerification() {
  const journal = createMemoryWorkJournal();
  const computeRouter = createComputeRouter(computeCatalog());
  const workFactory = createMondayIDAgentWorkFactory({
    providerAdapters: new Map([
      ["astra", astraAdapter],
      ["sol", solAdapter],
    ]),
    maxTurns: 2,
    verifyCandidate({ provider, candidate }) {
      return {
        accepted: provider.id === "sol" && candidate.result === "sol completed the same WorkUp job",
        verifier: "deterministic-held-out-verifier",
        evidence: ["expected provider", "expected terminal value"],
      };
    },
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
  assert.equal(result.final.verification.accepted, true);
  assert.equal(result.final.verification.verifier, "deterministic-held-out-verifier");
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
}

async function modelCannotPromoteItselfWithoutVerifier() {
  const workFactory = createMondayIDAgentWorkFactory({
    providerAdapters: { sol: solAdapter },
    maxTurns: 1,
  });
  const runtime = createWorklessRuntimeV2({
    workFactory,
    computeRouter: createComputeRouter([{ id: "sol", priority: 1 }]),
  });

  const result = await runtime.run("a provider answer is not independent proof");
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "external_verification_required");
  assert.equal(result.final.status, "candidate_complete");
  assert.equal(result.final.verification.accepted, false);
}

async function rejectedCandidateFailsClosed() {
  const workFactory = createMondayIDAgentWorkFactory({
    providerAdapters: { sol: solAdapter },
    maxTurns: 1,
    verifyCandidate() {
      return {
        accepted: false,
        causalKey: "unsupported-terminal-claim",
        predicted: "evidence exists",
        observed: "evidence absent",
      };
    },
  });
  const runtime = createWorklessRuntimeV2({
    workFactory,
    computeRouter: createComputeRouter([{ id: "sol", priority: 1 }]),
  });

  const result = await runtime.run("reject unsupported completion");
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker, "verification_failed");
  assert.equal(result.final.verification.accepted, false);
  assert.equal(result.final.verification.causalKey, "unsupported-terminal-claim");
}

await providerFailoverRequiresIndependentVerification();
await modelCannotPromoteItselfWithoutVerifier();
await rejectedCandidateFailsClosed();

assert.equal(normalizeProviderFailure({ code: "quota_or_rate_limit" }), "rate_limit");
assert.equal(normalizeProviderFailure({ code: "network_error" }), "provider_unavailable");
assert.equal(normalizeProviderFailure({ code: "http_503" }), "provider_unavailable");
assert.equal(normalizeProviderFailure({ code: "timeout" }), "provider_timeout");

console.log("WORKUP_PROVIDER_ADAPTER_PROOF_PASS 22/22");
