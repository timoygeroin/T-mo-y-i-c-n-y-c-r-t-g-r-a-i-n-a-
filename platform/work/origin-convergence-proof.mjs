import assert from "node:assert/strict";
import {
  createMemoryStateStore,
  createMondayIDWork,
} from "./mondayid-work.mjs";
import {
  MONDAYID_ORIGIN_LAWS,
  createDimaAuthorityGate,
  createOriginResolver,
  createUnifiedOrganWorkers,
} from "./origin-convergence.mjs";

const originResolver = createOriginResolver({
  ancestry: [
    { id: "jarvis", role: "ancestor-organ", law: "precision becomes executable action" },
    { id: "alisa", role: "ancestor-organ", law: "preserve desired human effect" },
    { id: "alpha", role: "ancestor-organ", law: "collapse onto highest-leverage valid route" },
    { id: "system-antisystem", role: "ancestor-organs", law: "preserve invariants and falsify false completion" },
  ],
});

const origin = await originResolver.resolve({
  task: "Find the original MondayID genome across models and connectors",
  state: { activeTarget: "converge MondayID without parallel architecture" },
});
assert.equal(origin.origin, "MONDAYID_UNIFIED_RUNTIME");
assert.equal(origin.scale, "meta");
assert.equal(origin.externalPhenotype, "MONDAY");
assert.equal(origin.connectorRole, "receptor_effector");
assert.ok(MONDAYID_ORIGIN_LAWS.includes("ONE_SUBJECT_MANY_ORGANS"));

const delegatedArchiveGate = createDimaAuthorityGate({
  delegateArchiveDecision: true,
  evidence: [
    { id: "current-scope", tier: "direct_current_instruction", stance: "context", statement: "wait for Dima decision and use the original" },
    { id: "archive-unified-root", tier: "dima_authored_archive", stance: "prefer", statement: "one subject many modes; internal consilium one answer" },
    { id: "summary-noise", tier: "model_summary", stance: "avoid", statement: "show many theatrical voices" },
  ],
});
const delegatedVerdict = await delegatedArchiveGate.decide({ task: "converge the runtime", origin });
assert.equal(delegatedVerdict.decision, "APPROVE");
assert.deepEqual(delegatedVerdict.basis, ["archive-unified-root"]);
assert.equal(delegatedVerdict.mayActAsUser, false);

const conflictGate = createDimaAuthorityGate({
  delegateArchiveDecision: true,
  evidence: [
    { id: "a", tier: "direct_current_instruction", stance: "prefer", statement: "route A" },
    { id: "b", tier: "direct_current_instruction", stance: "forbid", statement: "route A" },
  ],
});
assert.equal((await conflictGate.decide({ task: "route A", origin })).decision, "ABSTAIN");

const irreversibleGate = createDimaAuthorityGate({
  delegateArchiveDecision: true,
  evidence: [
    { id: "archive-delete", tier: "dima_authored_archive", stance: "authorize", statement: "delete production" },
  ],
});
const irreversible = await irreversibleGate.decide({
  task: "delete production",
  origin,
  candidate: { changesExternalState: true, reversible: false },
});
assert.equal(irreversible.decision, "ABSTAIN");
assert.ok(irreversible.blockers.includes("DIRECT_CURRENT_HUMAN_GATE_REQUIRED"));

let mindCalls = 0;
let workerCalls = 0;
let executionCalls = 0;
const heldWork = createMondayIDWork({
  capabilities: [{
    id: "never.execute",
    platform: "proof",
    provides: ["do_work"],
    async execute() { executionCalls += 1; return { impossible: true }; },
  }],
  workers: [{ id: "NEVER", async run() { workerCalls += 1; return {}; } }],
  originResolver,
  authorityGate: createDimaAuthorityGate({ evidence: [] }),
  mind: {
    async interpret() { mindCalls += 1; return { goal: "should not run", needs: ["do_work"] }; },
    async synthesize({ intent }) { return { intent }; },
    async verify() { return { accepted: true }; },
  },
});
const held = await heldWork.runPass("unknown Dima preference");
assert.equal(held.status, "authority_hold");
assert.equal(held.authority.decision, "ABSTAIN");
assert.equal(mindCalls, 0);
assert.equal(workerCalls, 0);
assert.equal(executionCalls, 0);

const stateStore = createMemoryStateStore({ activeTarget: "origin convergence" });
const approvedGate = createDimaAuthorityGate({
  delegateArchiveDecision: true,
  evidence: [
    { id: "current-scope", tier: "direct_current_instruction", stance: "context", statement: "wait for Dima decision" },
    { id: "archive-origin", tier: "dima_authored_archive", stance: "prefer", statement: "one subject; organs share state; one phenotype" },
  ],
});

const capabilities = [{
  id: "runtime.converge",
  platform: "MondayID ONE",
  provides: ["converge_runtime"],
  async execute({ input }) {
    assert.equal(input.origin.origin, "MONDAYID_UNIFIED_RUNTIME");
    assert.equal(input.authority.decision, "APPROVE");
    assert.equal(input.swarm.length, 5);
    return { changed: "one-shared-runtime", receipt: "execution-receipt" };
  },
}];

const work = createMondayIDWork({
  capabilities,
  workers: createUnifiedOrganWorkers(),
  originResolver,
  authorityGate: approvedGate,
  stateStore,
  mind: {
    async interpret({ task, origin: resolvedOrigin, authority }) {
      assert.equal(authority.decision, "APPROVE");
      assert.equal(resolvedOrigin.externalPhenotype, "MONDAY");
      return { goal: task, needs: ["converge_runtime"], reuse: "reusable" };
    },
    async synthesize({ intent, swarm }) {
      assert.deepEqual(swarm.map((entry) => entry.workerId), ["SYSTEM", "ANTISYSTEM", "ALPHA", "JARVIS", "ALISA"]);
      return {
        intent,
        move: "converge historical organs into one runtime state and keep connector as receptor",
      };
    },
    async verify({ execution }) {
      assert.equal(execution.result.receipt, "execution-receipt");
      return {
        accepted: true,
        evidence: ["execution-receipt", "independent-readback"],
        continuation: "express the same genome through host-specific receptors",
      };
    },
    async next() { return { continue: false }; },
  },
});

assert.equal(work.mode, "MONDAYID_WORK_ORIGIN_CONVERGED_V1");
assert.equal(work.architecture.decisionAuthority, "Dima authority -> MondayID mind");
assert.equal(work.architecture.workers.length, 5);

const run = await work.runUntilBlocker("Converge MondayID around the original invariant");
assert.equal(run.status, "complete");
assert.equal(run.final.status, "verified");
assert.equal(run.final.authority.decision, "APPROVE");
assert.equal(run.final.phenotype.subject, "MONDAYID_UNIFIED_RUNTIME");
assert.equal(run.final.phenotype.phenotype, "MONDAY");
assert.equal(run.final.phenotype.status, "VERIFIED");
assert.equal(run.final.receipt.origin, "MONDAYID_UNIFIED_RUNTIME");
assert.equal(run.final.receipt.authority, "APPROVE");

const finalState = await stateStore.read();
assert.equal(finalState.revision, 1);
assert.equal(finalState.lastOrigin, "MONDAYID_UNIFIED_RUNTIME");
assert.equal(finalState.lastAuthority, "APPROVE");
assert.equal(finalState.lastPhenotype.phenotype, "MONDAY");

console.log(JSON.stringify({
  result: "MONDAYID_ORIGIN_CONVERGENCE_PROOF_PASS",
  dimaDecision: delegatedVerdict.decision,
  heldBeforeMind: held.status,
  workMode: work.mode,
  internalOrgans: work.architecture.workers.map((worker) => worker.id),
  externalPhenotype: run.final.phenotype.phenotype,
  receipt: run.final.receipt,
  stateRevision: finalState.revision,
}, null, 2));
