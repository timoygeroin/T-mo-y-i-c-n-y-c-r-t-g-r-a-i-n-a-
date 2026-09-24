import { compileSignals } from './compiler.mjs';
import { buildFrontier } from './planner.mjs';
import { Worldline } from './worldline.mjs';
import { persistIntents, activeIntents, settleIntents } from './intent-field.mjs';
import { PolicyField, defaultMetaInvariants } from './policy-field.mjs';
import { evaluateCandidateOutput } from './attractor-field.mjs';
import { ensureTasks, updateTasks } from './task-field.mjs';
import { ActionLedger } from './action-ledger.mjs';

export class MondayRuntime {
  constructor({
    worldline = new Worldline(),
    capabilities = {},
    foundry = null,
    policyField = null,
    actionLedger = null,
    cellId = 'cell:runtime'
  } = {}) {
    this.worldline = worldline;
    this.capabilities = capabilities;
    this.foundry = foundry;
    this.policyField = policyField || new PolicyField({ metaInvariants:defaultMetaInvariants });
    this.actionLedger = actionLedger || new ActionLedger();
    this.cellId = cellId;
  }

  mutatePolicy(mutation) {
    return this.policyField.mutate(mutation);
  }

  observe(signals) {
    const state = this.worldline.materialize();
    const policies = this.policyField.snapshot();
    const graph = compileSignals(signals, { state, policies });
    const frontier = buildFrontier(graph, this.capabilities);
    return { graph, frontier };
  }

  async invent(blocked = []) {
    if (!this.foundry || blocked.length === 0) return [];

    return Promise.all(blocked.map(async action => {
      try {
        const outcome = await this.foundry.forge(action, this.capabilities);
        if (outcome?.ok === true && outcome.receptor) {
          this.capabilities[action.domain] = outcome.receptor;
        }
        return {
          domain:action.domain,
          objectiveId:action.objectiveId,
          sourceSignal:action.sourceSignal,
          ok:outcome?.ok === true,
          state:outcome?.state || 'UNRESOLVED',
          code:outcome?.code || null,
          contract:outcome?.contract || null,
          proof:outcome?.proof || null,
          receipt:outcome?.receipt || null
        };
      } catch (error) {
        return {
          domain:action.domain,
          objectiveId:action.objectiveId,
          sourceSignal:action.sourceSignal,
          ok:false,
          state:'UNRESOLVED',
          code:'FOUNDRY_ERROR',
          error:String(error)
        };
      }
    }));
  }

  semanticProgress() {
    const state = this.worldline.materialize();
    const intents = Object.values(state.intents || {})
      .map(intent => ({
        id:intent.id,
        status:intent.status,
        completedDomains:[...(intent.completedDomains || [])].sort()
      }))
      .sort((a, b) => a.id.localeCompare(b));
    const tasks = Object.values(state.tasks || {})
      .map(task => ({
        taskId:task.taskId,
        status:task.status,
        openRemainder:[...(task.openRemainder || [])].sort(),
        blockers:[...(task.blockers || [])].sort()
      }))
      .sort((a,b)=>String(a.taskId).localeCompare(String(b.taskId)));
    const capabilities = Object.entries(this.capabilities)
      .map(([domain, receptor]) => [domain, receptor?.name || domain])
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ intents, tasks, capabilities, policies:this.policyField.snapshot() });
  }

  async runPass(incomingSignals = [], { maxCycles = 8 } = {}) {
    const cycles = [];
    let signals = incomingSignals;
    let previous = this.semanticProgress();

    for (let index = 0; index < maxCycles; index += 1) {
      const cycle = await this.cycle(signals);
      cycles.push(cycle);
      if (!cycle?.ok) {
        return {
          ok:false,
          state:'UNRESOLVED',
          reason:cycle?.code || 'CYCLE_FAILED',
          cycles,
          final:cycle
        };
      }

      signals = [];
      const intents = Object.values(cycle.intents || {});
      const active = intents.filter(intent => intent?.status === 'active');
      if (active.length === 0) {
        return {
          ok:true,
          state:'FULFILLED',
          reason:'ALL_INTENTS_FULFILLED',
          cycles,
          final:cycle
        };
      }

      const current = this.semanticProgress();
      if (current === previous) {
        return {
          ok:true,
          state:'BLOCKED',
          reason:'NO_SEMANTIC_PROGRESS',
          cycles,
          blockers:cycle.frontier?.blocked || [],
          final:cycle
        };
      }
      previous = current;
    }

    const final = cycles.at(-1);
    return {
      ok:true,
      state:'BLOCKED',
      reason:'PASS_BUDGET_EXHAUSTED',
      cycles,
      blockers:final?.frontier?.blocked || [],
      final
    };
  }

  async executeAction(action) {
    const receptor = this.capabilities[action.domain] || this.capabilities.general;
    const prepared = this.actionLedger.prepare(action,{ cellId:this.cellId });
    if (!prepared.ok) {
      return {
        action,
        ok:false,
        verification:{ ok:false, code:prepared.code || 'ACTION_PREPARE_FAILED' },
        ledger:{ actionKey:prepared.actionKey || null, state:'UNRESOLVED' }
      };
    }

    const reserved = this.actionLedger.reserve(prepared.actionKey,{ cellId:this.cellId });
    if (!reserved.ok) {
      return {
        action,
        ok:false,
        verification:{ ok:false, code:reserved.code || 'ACTION_RESERVATION_FAILED' },
        ledger:{
          actionKey:prepared.actionKey,
          state:reserved.record?.state || 'UNRESOLVED',
          owner:reserved.owner || null
        }
      };
    }

    if (reserved.reused === true) {
      if (reserved.record?.state === 'VERIFIED') {
        this.actionLedger.commit(prepared.actionKey);
      }
      const prior = reserved.record?.outcome;
      if (prior) {
        return {
          ...prior,
          action,
          ledger:{
            actionKey:prepared.actionKey,
            state:'COMMITTED',
            reused:true
          }
        };
      }
      return {
        action,
        ok:false,
        verification:{ ok:false, code:'ACTION_LEDGER_OUTCOME_MISSING' },
        ledger:{ actionKey:prepared.actionKey, state:reserved.record?.state || 'UNRESOLVED' }
      };
    }

    if (reserved.reusedReservation === true && reserved.record?.state === 'EXECUTING') {
      return {
        action,
        ok:false,
        verification:{ ok:false, code:'ACTION_ALREADY_EXECUTING' },
        ledger:{ actionKey:prepared.actionKey, state:'EXECUTING' }
      };
    }

    const token = reserved.token;
    const started = this.actionLedger.start(prepared.actionKey, token);
    if (!started.ok) {
      return {
        action,
        ok:false,
        verification:{ ok:false, code:started.code || 'ACTION_START_FAILED' },
        ledger:{ actionKey:prepared.actionKey, state:started.state || 'UNRESOLVED' }
      };
    }

    try {
      const result = await receptor.execute({
        ...action,
        idempotencyKey:prepared.actionKey
      });

      if (result?.ok === false) {
        const outcome = {
          action,
          result,
          steering:{ ok:true, hits:[] },
          verification:{ ok:false, code:'EXECUTION_REPORTED_FAILURE' },
          ok:false
        };
        this.actionLedger.fail(prepared.actionKey, token, outcome);
        return {
          ...outcome,
          ledger:{ actionKey:prepared.actionKey, state:'FAILED' }
        };
      }

      const steering = evaluateCandidateOutput(result, action.inferenceContract);
      if (!steering.ok) {
        const outcome = {
          action,
          result,
          steering,
          verification:{
            ok:false,
            code:'MONDAY_ATTRACTOR_RELEASE_VETO',
            hits:[...steering.hits]
          },
          ok:false
        };
        this.actionLedger.ambiguous(
          prepared.actionKey,
          token,
          outcome,
          'EXECUTED_BUT_RELEASE_VETOED'
        );
        return {
          ...outcome,
          ledger:{ actionKey:prepared.actionKey, state:'AMBIGUOUS' }
        };
      }

      if (typeof receptor?.verify !== 'function') {
        const outcome = {
          action,
          result,
          steering,
          verification:{ ok:false, code:'VERIFICATION_RECEPTOR_MISSING' },
          ok:false
        };
        this.actionLedger.ambiguous(
          prepared.actionKey,
          token,
          outcome,
          'VERIFICATION_RECEPTOR_MISSING'
        );
        return {
          ...outcome,
          ledger:{ actionKey:prepared.actionKey, state:'AMBIGUOUS' }
        };
      }

      const verification = await receptor.verify(result, action);
      const outcome = {
        action,
        result,
        steering,
        verification,
        ok:verification?.ok === true
      };

      if (verification?.ok !== true) {
        this.actionLedger.ambiguous(
          prepared.actionKey,
          token,
          outcome,
          verification?.code || 'READBACK_UNRESOLVED'
        );
        return {
          ...outcome,
          ledger:{ actionKey:prepared.actionKey, state:'AMBIGUOUS' }
        };
      }

      const verified = this.actionLedger.verify(prepared.actionKey, token,{ verification, outcome });
      if (!verified.ok) {
        return {
          ...outcome,
          ok:false,
          verification:{ ok:false, code:verified.code || 'ACTION_LEDGER_VERIFY_FAILED' },
          ledger:{ actionKey:prepared.actionKey, state:'UNRESOLVED' }
        };
      }

      const committed = this.actionLedger.commit(prepared.actionKey, token);
      if (!committed.ok) {
        return {
          ...outcome,
          ok:false,
          verification:{ ok:false, code:committed.code || 'ACTION_LEDGER_COMMIT_FAILED' },
          ledger:{ actionKey:prepared.actionKey, state:committed.state || 'UNRESOLVED' }
        };
      }

      return {
        ...outcome,
        ledger:{ actionKey:prepared.actionKey, state:'COMMITTED', reused:false }
      };
    } catch (error) {
      const outcome = {
        action,
        ok:false,
        error:String(error),
        verification:{ ok:false, code:'EXECUTION_OUTCOME_AMBIGUOUS' }
      };
      this.actionLedger.ambiguous(
        prepared.actionKey,
        token,
        outcome,
        'EXECUTION_EXCEPTION_AFTER_START'
      );
      return {
        ...outcome,
        ledger:{ actionKey:prepared.actionKey, state:'AMBIGUOUS' }
      };
    }
  }

  async cycle(incomingSignals = []) {
    const persisted = persistIntents(this.worldline, incomingSignals);
    if (!persisted.ok) return persisted;
    const tasksCreated = ensureTasks(this.worldline, persisted.persisted || []);
    if (!tasksCreated.ok) return tasksCreated;

    const field = activeIntents(this.worldline);
    const { graph } = this.observe(field);
    let frontier = buildFrontier(graph, this.capabilities);

    const observations = this.worldline.append({
      kind:'fact',
      subject:`cycle:${Date.now()}`,
      payload:{
        activeIntentIds:field.map(intent => intent.id),
        graph,
        blocked:frontier.blocked
      },
      epistemic:'observed'
    }, this.worldline.revision());
    if (!observations.ok) return observations;

    const forged = await this.invent(frontier.blocked);

    let rev = this.worldline.revision();
    for (const organ of forged) {
      const out = this.worldline.append({
        kind:organ.ok ? 'capability' : 'failure',
        subject:`foundry:${organ.domain}:${organ.objectiveId}`,
        payload:organ,
        epistemic:organ.ok ? 'verified' : 'observed'
      }, rev);
      if (!out.ok) return out;
      rev = out.revision;
    }

    if (forged.some(x => x.ok)) frontier = buildFrontier(graph, this.capabilities);

    const results = await Promise.all(
      frontier.parallel.map(action => this.executeAction(action))
    );

    rev = this.worldline.revision();
    for (const result of results) {
      const out = this.worldline.append({
        kind:result.ok ? 'receipt' : 'failure',
        subject:result.action.id,
        payload:result,
        epistemic:result.ok ? 'verified' : 'observed'
      }, rev);
      if (!out.ok) return out;
      rev = out.revision;
    }

    const settled = settleIntents(this.worldline, graph, results);
    if (!settled.ok) return settled;

    const tasksUpdated = updateTasks(this.worldline,{ graph, frontier, results });
    if (!tasksUpdated.ok) return tasksUpdated;

    return {
      ok:true,
      revision:this.worldline.revision(),
      graph,
      frontier,
      forged,
      results,
      intents:this.worldline.materialize().intents,
      state:this.worldline.materialize(),
      policies:this.policyField.snapshot(),
      actionLedger:this.actionLedger.snapshot()
    };
  }
}
