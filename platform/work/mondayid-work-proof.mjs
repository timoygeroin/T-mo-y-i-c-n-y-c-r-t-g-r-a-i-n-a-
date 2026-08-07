import assert from "node:assert/strict";
import {
  createMemoryStateStore,
  createMondayIDWork,
} from "./mondayid-work.mjs";

function capability(id, platform, provides, execute, extra = {}) {
  return {
    id,
    platform,
    provides,
    execute,
    ...extra,
  };
}

const stateStore = createMemoryStateStore({
  activeTrack: "MONDAYID_WORK_ACTIVATION",
  durableFloor: "verified-parent-state",
});

const capabilities = [
  capability(
    "library.read",
    "ChatGPT Library",
    ["retrieve_history"],
    async () => ({ sources: ["controller", "runtime", "chat-capsules"] }),
  ),
  capability(
    "github.inspect",
    "GitHub",
    ["inspect_code"],
    async () => ({ branch: "agent/mondayid-one-v1", executable: true }),
  ),
  capability(
    "airtable.state",
    "Airtable",
    ["read_state"],
    async () => ({ state: "canonical-head", lease: "valid" }),
  ),
  capability(
    "mondayid.compile",
    "MondayID",
    ["compile_architecture"],
    async ({ results }) => ({
      architecture: "work-v1",
      evidenceInputs: Object.keys(results),
    }),
  ),
  capability(
    "github.write",
    "GitHub",
    ["publish_increment"],
    async () => ({ commit: "proof-commit" }),
    { mutates: true, risk: "medium", cost: 3 },
  ),
];

const workers = [
  {
    id: "research.science",
    lane: "science",
    async run({ intent }) {
      return { finding: "separate evidence from inference", needs: intent.needs };
    },
  },
  {
    id: "research.psyche",
    lane: "psyche",
    async run() {
      return { finding: "preserve continuity and cognitive load" };
    },
  },
  {
    id: "red-team",
    lane: "adversarial",
    async run() {
      return { risk: "do not claim live adapters before proof" };
    },
  },
];

const mind = {
  async interpret({ task }) {
    return {
      goal: task,
      needs: [
        "retrieve_history",
        "inspect_code",
        "read_state",
        "compile_architecture",
      ],
      reuse: "reusable",
    };
  },

  async synthesize({ intent, swarm }) {
    assert.equal(swarm.length, 3);
    assert.ok(swarm.some((entry) => entry.lane === "adversarial"));
    return {
      intent,
      rationale: "Evidence and adversarial passes agree on a read-only activation proof first",
    };
  },

  async verify({ execution }) {
    assert.deepEqual(
      execution.platforms,
      ["ChatGPT Library", "GitHub", "Airtable", "MondayID"],
    );
    return {
      accepted: true,
      evidence: [
        "history retrieved",
        "code inspected",
        "canonical state read",
        "architecture compiled",
      ],
      continuation: "bind live adapters without changing the planner contract",
    };
  },

  async next() {
    return { continue: false };
  },
};

const work = createMondayIDWork({
  capabilities,
  mind,
  workers,
  stateStore,
});

assert.equal(work.mode, "MONDAYID_WORK_V1");
assert.equal(work.architecture.decisionAuthority, "MondayID mind");
assert.equal(work.architecture.workers.length, 3);

const run = await work.runUntilBlocker(
  "Recover prior MondayID work and compile the strongest next executable state",
);

assert.equal(run.status, "complete");
assert.equal(run.passes.length, 1);
assert.equal(run.final.status, "verified");
assert.equal(run.final.plan.mode, "composite");
assert.equal(run.final.receipt.committedRevision, 1);
assert.equal(run.final.execution.trace.length, 4);

const state = await stateStore.read();
assert.equal(state.revision, 1);
assert.equal(state.lastGoal, "Recover prior MondayID work and compile the strongest next executable state");
assert.equal(state.lastEvidence.length, 4);

const blockedWork = createMondayIDWork({
  capabilities,
  workers: [],
  stateStore: createMemoryStateStore(),
  mind: {
    async interpret() {
      return { goal: "Publish a mutation", needs: ["publish_increment"] };
    },
    async synthesize({ intent }) {
      return { intent };
    },
    async verify() {
      throw new Error("Verification must not run when mutation is policy-blocked");
    },
  },
});

const blocked = await blockedWork.runPass("Publish a mutation");
assert.equal(blocked.status, "human_gate");
assert.deepEqual(blocked.plan.unresolved, ["publish_increment"]);

const staleStore = createMemoryStateStore();
const staleBase = await staleStore.read();
assert.equal((await staleStore.write({ marker: "first" }, staleBase.revision)).status, "committed");
assert.equal((await staleStore.write({ marker: "stale" }, staleBase.revision)).status, "stale_state");

console.log(JSON.stringify({
  result: "MONDAYID_WORK_V1_PROOF_PASS",
  workMode: work.mode,
  swarmWorkers: work.architecture.workers.map((worker) => worker.id),
  executionPlatforms: run.final.execution.platforms,
  receipt: run.final.receipt,
  mutationGate: blocked.status,
  stateRevision: state.revision,
}, null, 2));
