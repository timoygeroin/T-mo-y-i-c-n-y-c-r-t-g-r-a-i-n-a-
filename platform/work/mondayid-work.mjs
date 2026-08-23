import { createHash } from "node:crypto";
import {
  createCapabilityRegistry,
  materializeTool,
  planIntent,
  summarizePlan,
} from "../one/mondayid-one.mjs";
import { collapsePhenotype } from "./origin-convergence.mjs";

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function freeze(value) {
  return Object.freeze(value);
}

function requiredFunction(object, name) {
  if (!object || typeof object[name] !== "function") {
    throw new TypeError(`MondayID Work requires ${name}()`);
  }
}

function optionalFunction(object, name, label) {
  if (object != null && typeof object[name] !== "function") {
    throw new TypeError(`${label} requires ${name}()`);
  }
}

function normalizeWorkers(workers = []) {
  const ids = new Set();
  return workers.map((worker) => {
    if (!worker?.id || typeof worker.run !== "function") {
      throw new TypeError("Each worker requires id and run()");
    }
    if (ids.has(worker.id)) throw new Error(`Duplicate worker id: ${worker.id}`);
    ids.add(worker.id);
    return freeze({
      lane: "research",
      weight: 1,
      ...worker,
    });
  });
}

export function createMemoryStateStore(initialState = {}) {
  let state = freeze({ revision: 0, ...initialState });
  const history = [state];
  return freeze({
    async read() {
      return state;
    },
    async write(next, expectedRevision) {
      if (state.revision !== expectedRevision) {
        return freeze({
          status: "stale_state",
          expectedRevision,
          actualRevision: state.revision,
          state,
        });
      }
      state = freeze({ ...next, revision: state.revision + 1 });
      history.push(state);
      return freeze({ status: "committed", state });
    },
    async history() {
      return [...history];
    },
  });
}

export function createMondayIDWork({
  capabilities,
  mind,
  workers = [],
  stateStore = createMemoryStateStore(),
  policy = {},
  originResolver = null,
  authorityGate = null,
}) {
  requiredFunction(mind, "interpret");
  requiredFunction(mind, "synthesize");
  requiredFunction(mind, "verify");
  optionalFunction(originResolver, "resolve", "MondayID originResolver");
  optionalFunction(authorityGate, "decide", "MondayID authorityGate");

  const registry = createCapabilityRegistry(capabilities);
  const normalizedWorkers = normalizeWorkers(workers);
  const effectivePolicy = freeze({
    allowMutations: false,
    maxRisk: "medium",
    materializeCompositeTool: true,
    ...policy,
  });

  async function runPass(task, passIndex = 0) {
    const startedAt = Date.now();
    const state = await stateStore.read();
    const trace = [];

    const origin = originResolver
      ? await originResolver.resolve({ task, state, passIndex })
      : null;
    if (origin) trace.push(freeze({ phase: "origin", output: origin }));

    const authority = authorityGate
      ? await authorityGate.decide({ task, state, origin, passIndex })
      : null;
    if (authority) trace.push(freeze({ phase: "authority", output: authority }));

    if (authority && authority.decision !== "APPROVE") {
      const phenotype = collapsePhenotype({
        task,
        origin,
        authority,
        intent: null,
        synthesis: { move: "preserve unresolved Dima authority gate" },
      });
      return freeze({
        workId: `work:${hash({ task, state: state.revision, passIndex, authority: authority.decision })}`,
        status: "authority_hold",
        passIndex,
        stateRevision: state.revision,
        task,
        origin,
        authority,
        phenotype,
        plan: null,
        verification: null,
        receipt: null,
        trace,
        durationMs: Date.now() - startedAt,
      });
    }

    const interpreted = await mind.interpret({ task, state, passIndex, origin, authority });
    if (!interpreted?.goal || !Array.isArray(interpreted.needs) || interpreted.needs.length === 0) {
      throw new TypeError("mind.interpret() must return { goal, needs[] }");
    }
    trace.push(freeze({ phase: "interpret", output: interpreted }));

    const swarmStarted = Date.now();
    const swarm = await Promise.all(
      normalizedWorkers.map(async (worker) => {
        const output = await worker.run({
          task,
          state,
          intent: interpreted,
          passIndex,
          origin,
          authority,
        });
        return freeze({
          workerId: worker.id,
          lane: worker.lane,
          weight: worker.weight,
          output,
        });
      }),
    );
    trace.push(freeze({
      phase: "swarm",
      durationMs: Date.now() - swarmStarted,
      workers: swarm,
    }));

    const synthesis = await mind.synthesize({
      task,
      state,
      intent: interpreted,
      swarm,
      passIndex,
      origin,
      authority,
    });
    const finalIntent = synthesis?.intent ?? interpreted;
    trace.push(freeze({ phase: "synthesize", output: synthesis }));

    const phenotypeBeforeExecution = collapsePhenotype({
      task,
      origin,
      authority,
      intent: finalIntent,
      synthesis,
    });

    const plan = planIntent({
      intent: finalIntent,
      registry,
      policy: synthesis?.policy ? { ...effectivePolicy, ...synthesis.policy } : effectivePolicy,
    });
    trace.push(freeze({ phase: "plan", output: summarizePlan(plan) }));

    if (plan.status !== "ready") {
      return freeze({
        workId: `work:${hash({ task, state: state.revision, passIndex })}`,
        status: plan.status,
        passIndex,
        stateRevision: state.revision,
        task,
        origin,
        authority,
        phenotype: phenotypeBeforeExecution,
        plan: summarizePlan(plan),
        verification: null,
        receipt: null,
        trace,
        durationMs: Date.now() - startedAt,
      });
    }

    const tool = materializeTool(plan, registry);
    const execution = await tool.execute({
      task,
      state,
      intent: finalIntent,
      swarm,
      synthesis,
      origin,
      authority,
    });
    trace.push(freeze({ phase: "execute", output: execution }));

    const verification = await mind.verify({
      task,
      state,
      intent: finalIntent,
      swarm,
      synthesis,
      plan,
      execution,
      passIndex,
      origin,
      authority,
    });
    trace.push(freeze({ phase: "verify", output: verification }));

    const phenotype = collapsePhenotype({
      task,
      origin,
      authority,
      intent: finalIntent,
      synthesis,
      verification,
    });

    if (!verification?.accepted) {
      return freeze({
        workId: `work:${hash({ task, state: state.revision, passIndex })}`,
        status: "verification_failed",
        passIndex,
        stateRevision: state.revision,
        task,
        origin,
        authority,
        phenotype,
        plan: summarizePlan(plan),
        execution,
        verification,
        receipt: null,
        trace,
        durationMs: Date.now() - startedAt,
      });
    }

    const checkpoint = freeze({
      ...state,
      activeTask: task,
      activeTarget: origin?.activeTarget ?? state.activeTarget ?? finalIntent.goal,
      lastGoal: finalIntent.goal,
      lastPlanId: plan.planId,
      lastToolId: execution.toolId,
      lastResult: execution.result,
      lastEvidence: verification.evidence ?? [],
      lastPassIndex: passIndex,
      lastOrigin: origin?.origin ?? null,
      lastAuthority: authority?.decision ?? null,
      lastPhenotype: phenotype,
      continuation: verification.continuation ?? null,
    });

    const commit = await stateStore.write(checkpoint, state.revision);
    trace.push(freeze({ phase: "checkpoint", output: commit }));

    const status = commit.status === "committed" ? "verified" : commit.status;
    const receipt = freeze({
      receiptId: `receipt:${hash({
        planId: plan.planId,
        toolId: execution.toolId,
        state: commit.state?.revision ?? state.revision,
        evidence: verification.evidence ?? [],
        origin: origin?.origin ?? null,
        authority: authority?.decision ?? null,
      })}`,
      status,
      priorRevision: state.revision,
      committedRevision: commit.state?.revision ?? null,
      planId: plan.planId,
      toolId: execution.toolId,
      platforms: execution.platforms,
      evidence: verification.evidence ?? [],
      origin: origin?.origin ?? null,
      authority: authority?.decision ?? null,
    });

    return freeze({
      workId: `work:${hash({ task, receipt: receipt.receiptId, passIndex })}`,
      status,
      passIndex,
      stateRevision: state.revision,
      task,
      origin,
      authority,
      phenotype,
      plan: summarizePlan(plan),
      execution,
      verification,
      receipt,
      trace,
      durationMs: Date.now() - startedAt,
    });
  }

  async function runUntilBlocker(task, { maxPasses = 8 } = {}) {
    if (!Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 64) {
      throw new RangeError("maxPasses must be an integer from 1 to 64");
    }

    const passes = [];
    let currentTask = task;

    for (let passIndex = 0; passIndex < maxPasses; passIndex += 1) {
      const result = await runPass(currentTask, passIndex);
      passes.push(result);

      if (result.status !== "verified") {
        return freeze({
          status: "blocked",
          blocker: result.status,
          passes,
          final: result,
        });
      }

      if (typeof mind.next !== "function") {
        return freeze({ status: "complete", passes, final: result });
      }

      const state = await stateStore.read();
      const next = await mind.next({
        task: currentTask,
        state,
        result,
        passIndex,
        origin: result.origin,
        authority: result.authority,
      });

      if (!next?.continue) {
        return freeze({ status: "complete", passes, final: result });
      }
      if (!next.task) {
        throw new TypeError("mind.next() returned continue=true without task");
      }
      currentTask = next.task;
    }

    return freeze({
      status: "depth_limit",
      blocker: "max_passes",
      passes,
      final: passes.at(-1),
    });
  }

  return freeze({
    mode: originResolver || authorityGate ? "MONDAYID_WORK_ORIGIN_CONVERGED_V1" : "MONDAYID_WORK_V1",
    law: "origin -> Dima authority -> internal organs -> synthesis -> capability route -> execute -> proof -> checkpoint -> continuation",
    architecture: freeze({
      decisionAuthority: authorityGate ? "Dima authority -> MondayID mind" : "MondayID mind",
      originAuthority: originResolver?.id ?? null,
      authorityGate: authorityGate?.id ?? null,
      workers: normalizedWorkers.map((worker) => ({ id: worker.id, lane: worker.lane })),
      capabilityCount: registry.size,
      stateAuthority: "external checkpoint store",
      delegationLaw: "organs advise one shared state; MondayID synthesizes one phenotype; connectors execute",
    }),
    runPass,
    runUntilBlocker,
    stateStore,
  });
}
