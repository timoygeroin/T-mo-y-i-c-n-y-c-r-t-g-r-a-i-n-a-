import assert from "node:assert/strict";

import { createOpenAICompatibleProvider } from "../runtime/mondayid-agent.mjs";
import { createMondayIDAgentWorkFactory } from "./mondayid-agent-work-adapter.mjs";
import { createComputeRouter, createMemoryWorkJournal, createWorklessRuntimeV2 } from "./workless-runtime-v2.mjs";

const provider = createOpenAICompatibleProvider({
  id: "oss-smollm2-135m",
  baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
  model: process.env.OLLAMA_MODEL || "smollm2:135m",
  apiKey: "ollama",
});

const journal = createMemoryWorkJournal();
const runtime = createWorklessRuntimeV2({
  journal,
  computeRouter: createComputeRouter([
    { id: "oss-smollm2-135m", kind: "oss", priority: 1, capabilities: ["reason"] },
  ]),
  policy: { requiredCapabilities: ["reason"] },
  workFactory: createMondayIDAgentWorkFactory({
    providerAdapters: { "oss-smollm2-135m": provider },
    maxTurns: 1,
    verifyCandidate({ provider: selected, candidate }) {
      return {
        accepted: selected.id === "oss-smollm2-135m" && typeof candidate.result === "string" && candidate.result.trim().length > 0,
        verifier: "live-output-readback",
        evidence: ["local OpenAI-compatible endpoint returned non-empty model output"],
      };
    },
  }),
});

const result = await runtime.run({
  instruction: "Reply briefly: what is two plus two?",
});

assert.equal(result.status, "complete");
assert.equal(result.providerId, "oss-smollm2-135m");
assert.equal(result.final.verification.accepted, true);
assert.ok(result.final.result.trim().length > 0);
assert.equal(journal.read(result.jobId).status, "complete");

console.log(JSON.stringify({
  result: "WORKUP_OSS_MODEL_LIVE_PROOF_PASS",
  providerId: result.providerId,
  modelOutput: result.final.result.slice(0, 200),
  jobId: result.jobId,
}));
