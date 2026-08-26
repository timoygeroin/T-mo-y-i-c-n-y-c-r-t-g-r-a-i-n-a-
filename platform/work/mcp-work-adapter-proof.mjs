import assert from "node:assert/strict";
import { createMondayIDWork, createMemoryStateStore } from "./mondayid-work.mjs";
import { createMcpWorkAdapter } from "./mcp-work-adapter.mjs";
import {
  createDimaAuthorityGate,
  createOriginResolver,
  createUnifiedOrganWorkers,
} from "./origin-convergence.mjs";

const originResolver = createOriginResolver();
const stateStore = createMemoryStateStore({ activeTarget: "bind host receptors without moving the root" });
let executions = 0;

const adapter = createMcpWorkAdapter({
  async createWorkForIngress(ingress) {
    return createMondayIDWork({
      capabilities: [{
        id: "host.effect",
        platform: "MCP Host",
        provides: ["produce_effect"],
        async execute({ input }) {
          executions += 1;
          assert.equal(input.origin.origin, "MONDAYID_UNIFIED_RUNTIME");
          assert.equal(input.authority.decision, "APPROVE");
          return { receipt: `host-effect-${executions}`, observed: "effect-created" };
        },
      }],
      workers: createUnifiedOrganWorkers(),
      stateStore,
      originResolver,
      authorityGate: createDimaAuthorityGate({
        delegateArchiveDecision: true,
        evidence: ingress.dimaEvidence,
      }),
      mind: {
        async interpret({ task }) {
          return { goal: task, needs: ["produce_effect"] };
        },
        async synthesize({ intent }) {
          return { intent, move: "route host effect through MondayID ONE" };
        },
        async verify({ execution }) {
          return {
            accepted: execution.result.observed === "effect-created",
            evidence: [execution.result.receipt, "independent-host-readback"],
            continuation: "preserve root and recompile next host receptor",
          };
        },
        async next() { return { continue: false }; },
      },
    });
  },
});

assert.equal(adapter.role, "receptor_adapter");
assert.equal(adapter.root, "MONDAYID_UNIFIED_RUNTIME");
assert.equal(adapter.ownsCognition, false);
assert.equal(adapter.ownsIdentity, false);
assert.equal(adapter.ownsCanonicalState, false);

const held = await adapter.handle({
  signal: "perform host effect",
  objective: "perform host effect without inventing Dima authority",
  dimaEvidence: [],
  hostCapabilities: ["produce_effect"],
});
assert.equal(held.egress.status, "HOLD");
assert.equal(held.egress.proof.promotable, false);
assert.equal(executions, 0);
assert.equal(Object.hasOwn(held.egress, "diagnostics"), false);

const approved = await adapter.handle({
  signal: "perform host effect",
  objective: "perform host effect through the unified runtime",
  dimaEvidence: [
    {
      id: "dima-current-route",
      tier: "direct_current_instruction",
      stance: "prefer",
      statement: "continue and finish through the original unified runtime",
    },
  ],
  hostCapabilities: ["produce_effect"],
  constraints: ["connector-is-receptor"],
});
assert.equal(approved.egress.status, "PROVEN");
assert.equal(approved.egress.root, "MONDAYID_UNIFIED_RUNTIME");
assert.equal(approved.egress.phenotype.phenotype, "MONDAY");
assert.equal(approved.egress.proof.promotable, true);
assert.equal(executions, 1);
assert.equal(Object.hasOwn(approved.egress, "diagnostics"), false);

const diagnostic = await adapter.handle({
  signal: "perform host effect",
  objective: "perform host effect through the unified runtime",
  dimaEvidence: [
    {
      id: "dima-current-route-2",
      tier: "direct_current_instruction",
      stance: "prefer",
      statement: "continue and finish through the original unified runtime",
    },
  ],
  hostCapabilities: ["produce_effect"],
}, { includeDiagnostics: true });
assert.equal(diagnostic.egress.status, "PROVEN");
assert.ok(Array.isArray(diagnostic.egress.diagnostics.trace));
assert.equal(diagnostic.egress.diagnostics.authority.decision, "APPROVE");
assert.equal(executions, 2);

console.log(JSON.stringify({
  result: "MONDAYID_MCP_WORK_ADAPTER_PROOF_PASS",
  adapter: adapter.id,
  root: adapter.root,
  heldWithoutAuthority: held.egress.status,
  approvedWithAuthority: approved.egress.status,
  defaultDiagnosticsExposed: Object.hasOwn(approved.egress, "diagnostics"),
  optInDiagnosticsExposed: Object.hasOwn(diagnostic.egress, "diagnostics"),
  executions,
}, null, 2));
