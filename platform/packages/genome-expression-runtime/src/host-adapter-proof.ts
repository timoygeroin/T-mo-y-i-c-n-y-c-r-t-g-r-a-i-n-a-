import { ExpressionContext } from "./contracts";
import { GenomeExpressionHostAdapter } from "./host-adapter";

const base: ExpressionContext = {
  genomeVersion: "GER-v1",
  hostId: "adapter-proof-host",
  sceneClass: "EXTERNAL_EFFECT",
  intent: "prove native actuation is gated",
  invariants: ["authority", "temporal ordering"],
  capabilities: [{ id: "writer", state: "AVAILABLE_AUTHORIZED", receptor: "host" }],
  requiredCapabilities: ["writer"],
  temporalGates: [{
    id: "human-gate",
    condition: "external write is admitted",
    satisfied: false,
    dependentEffectors: ["writer"],
  }],
  requestedBlastRadius: "EXTERNAL_WORLD",
  authorizedBlastRadius: "EXTERNAL_WORLD",
  provenance: ["proof"],
  unresolvedBlockers: [],
};

let executions = 0;
const blockedAdapter = new GenomeExpressionHostAdapter(
  () => base,
  { writer: () => { executions += 1; return "written"; } },
);

const blocked = await blockedAdapter.execute({ effectorId: "writer", payload: "x" });
if (blocked.executed || executions !== 0 || blocked.release.reason !== "unsatisfied-dependent-temporal-gate") {
  throw new Error("proof failed: blocked native effector reached executor");
}

const admittedAdapter = new GenomeExpressionHostAdapter(
  () => ({ ...base, temporalGates: [{ ...base.temporalGates[0], satisfied: true }] }),
  { writer: () => { executions += 1; return "written"; } },
);

const admitted = await admittedAdapter.execute<string, string>({ effectorId: "writer", payload: "x" });
if (!admitted.executed || admitted.result !== "written" || executions !== 1) {
  throw new Error("proof failed: admitted effector did not execute exactly once");
}

const unknown = await admittedAdapter.execute({ effectorId: "undeclared", payload: "x" });
if (unknown.executed || executions !== 1 || unknown.release.reason !== "effector-not-authorized-by-compiled-phenotype") {
  throw new Error("proof failed: undeclared effector escaped phenotype boundary");
}

console.log("PASS: host adapter enforces genome release boundary before native execution");
