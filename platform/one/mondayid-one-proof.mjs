import assert from "node:assert/strict";
import {
  createCapabilityRegistry,
  materializeTool,
  planIntent,
  summarizePlan,
} from "./mondayid-one.mjs";

const registry = createCapabilityRegistry([
  {
    id: "github.search_code",
    platform: "github",
    provides: ["discover_implementation"],
    risk: "low",
    cost: 2,
    latency: 2,
    async execute({ input }) {
      return {
        query: input.query,
        candidates: ["repo://memory-engine", "repo://tool-router", "repo://proof-runtime"],
      };
    },
  },
  {
    id: "github.fetch_source",
    platform: "github",
    provides: ["read_source"],
    dependsOn: ["github.search_code"],
    risk: "low",
    cost: 1,
    latency: 1,
    async execute({ results }) {
      return {
        fetched: results["github.search_code"].candidates,
        files: ["src/index.ts", "src/proof.ts"],
      };
    },
  },
  {
    id: "openai.reason",
    platform: "openai",
    provides: ["synthesize_architecture"],
    dependsOn: ["github.fetch_source"],
    risk: "low",
    cost: 3,
    latency: 2,
    async execute({ input, results }) {
      return {
        goal: input.goal,
        architecture: "capability-registry -> planner -> ephemeral-tool -> verification-receipt",
        groundedIn: results["github.fetch_source"].fetched,
      };
    },
  },
  {
    id: "runtime.verify",
    platform: "mondayid",
    provides: ["verify_result"],
    dependsOn: ["openai.reason"],
    risk: "low",
    cost: 1,
    latency: 1,
    async execute({ results }) {
      const architecture = results["openai.reason"]?.architecture;
      return {
        passed: typeof architecture === "string" && architecture.includes("ephemeral-tool"),
        checks: ["grounded", "composed", "traceable", "permission-aware"],
      };
    },
  },
  {
    id: "browser.inspect_surface",
    platform: "browser",
    provides: ["inspect_surface"],
    risk: "low",
    cost: 1,
    latency: 1,
    async execute({ input }) {
      return { surface: input.surface, status: "observed" };
    },
  },
  {
    id: "github.write_branch",
    platform: "github",
    provides: ["persist_result"],
    mutates: true,
    risk: "high",
    cost: 2,
    latency: 2,
    async execute({ input }) {
      return { branch: input.branch, commit: "simulated-commit" };
    },
  },
]);

const compositePlan = planIntent({
  intent: {
    goal: "Find existing implementations, understand them, synthesize a new organ, and prove it",
    needs: [
      "discover_implementation",
      "read_source",
      "synthesize_architecture",
      "verify_result",
    ],
    reuse: "one-shot",
  },
  registry,
  policy: {
    allowMutations: false,
    maxRisk: "medium",
    materializeCompositeTool: true,
  },
});

assert.equal(compositePlan.status, "ready");
assert.equal(compositePlan.mode, "composite");
assert.equal(compositePlan.steps.length, 4);
assert.deepEqual(
  compositePlan.steps.map((step) => step.capabilityId),
  ["github.search_code", "github.fetch_source", "openai.reason", "runtime.verify"],
);
assert.equal(compositePlan.ephemeralTool.lifecycle, "one-shot");

const generatedTool = materializeTool(compositePlan, registry);
const execution = await generatedTool.execute({
  query: "cross-platform capability composer",
  goal: compositePlan.goal,
});

assert.equal(execution.status, "executed");
assert.deepEqual(execution.platforms, ["github", "openai", "mondayid"]);
assert.equal(execution.result.passed, true);
assert.equal(execution.trace.length, 4);

const exactPlan = planIntent({
  intent: {
    goal: "Inspect one visible platform surface",
    needs: ["inspect_surface"],
  },
  registry,
});

assert.equal(exactPlan.status, "ready");
assert.equal(exactPlan.mode, "exact");
assert.equal(exactPlan.steps[0].capabilityId, "browser.inspect_surface");
assert.equal(exactPlan.ephemeralTool, null);

const gatedPlan = planIntent({
  intent: {
    goal: "Persist the synthesized result",
    needs: ["persist_result"],
  },
  registry,
  policy: {
    allowMutations: false,
    maxRisk: "medium",
  },
});

assert.equal(gatedPlan.status, "human_gate");
assert.deepEqual(gatedPlan.unresolved, ["persist_result"]);
assert.deepEqual(gatedPlan.humanGate.needs, ["persist_result"]);
assert.equal(gatedPlan.blockedCapabilities[0].id, "github.write_branch");

const missingPlan = planIntent({
  intent: {
    goal: "Move a physical object with thought",
    needs: ["telekinesis"],
  },
  registry,
});

assert.equal(missingPlan.status, "missing_capability");
assert.deepEqual(missingPlan.unresolved, ["telekinesis"]);

const receipt = {
  RESULT: "PASS",
  PRODUCT: "MondayID ONE capability composer",
  COMPOSITE_PLAN: summarizePlan(compositePlan),
  EXECUTION: execution,
  EXACT_PLAN: summarizePlan(exactPlan),
  HUMAN_GATE_PLAN: summarizePlan(gatedPlan),
  MISSING_CAPABILITY_PLAN: summarizePlan(missingPlan),
  TESTS: {
    composite_route: "PASS",
    one_shot_tool_materialization: "PASS",
    cross_platform_execution: "PASS",
    exact_tool_selection: "PASS",
    mutation_gate: "PASS",
    honest_missing_capability: "PASS",
  },
};

console.log(JSON.stringify(receipt, null, 2));
