import { compileSignals } from './compiler.mjs';
import { buildFrontier } from './planner.mjs';
import { Worldline } from './worldline.mjs';
import { persistIntents, activeIntents, settleIntents } from './intent-field.mjs';
import { PolicyField, defaultMetaInvariants } from './policy-field.mjs';

export class MondayRuntime {
  constructor({ worldline = new Worldline(), capabilities = {}, foundry = null, policyField = null } = {}) {
    this.worldline = worldline;
    this.capabilities = capabilities;
    this.foundry = foundry;
    this.policyField = policyField || new PolicyField({ metaInvariants:defaultMetaInvariants });
  }

  mutatePolicy(mutation) {
    return this.policyField.mutate(mutation);
  }

  observe(signals) {
    const graph = compileSignals(signals);
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
          domain: action.domain,
          objectiveId: action.objectiveId,
          sourceSignal: action.sourceSignal,
          ok: outcome?.ok === true,
          state: outcome?.state || 'UNRESOLVED',
          code: outcome?.code || null,
          contract: outcome?.contract || null,
          proof: outcome?.proof || null,
          receipt: outcome?.receipt || null
        };
      } catch (error) {
        return {
          domain: action.domain,
          objectiveId: action.objectiveId,
          sourceSignal: action.sourceSignal,
          ok: false,
          state: 'UNRESOLVED',
          code: 'FOUNDRY_ERROR',
          error: String(error)
        };
      }
    }));
  }

  semanticProgress() {
    const state = this.worldline.materialize();
    const intents = Object.values(state.intents || {})
      .map(intent => ({
        id: intent.id,
        status: intent.status,
        completedDomains: [...(intent.completedDomains || [])].sort()
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const capabilities = Object.entries(this.capabilities)
      .map(([domain, receptor]) => [domain, receptor?.name || domain])
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ intents, capabilities, policies:this.policyField.snapshot() });
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
          ok: false,
          state: 'UNRESOLVED',
          reason: cycle?.code || 'CYCLE_FAILED',
          cycles,
          final: cycle
        };
      }

      signals = [];
      const intents = Object.values(cycle.intents || {});
      const active = intents.filter(intent => intent?.status === 'active');
      if (active.length === 0) {
        return {
          ok: true,
          state: 'FULFILLED',
          reason: 'ALL_INTENTS_FULFILLED',
          cycles,
          final: cycle
        };
      }

      const current = this.semanticProgress();
      if (current === previous) {
        return {
          ok: true,
          state: 'BLOCKED',
          reason: 'NO_SEMANTIC_PROGRESS',
          cycles,
          blockers: cycle.frontier?.blocked || [],
          final: cycle
        };
      }
      previous = current;
    }

    const final = cycles.at(-1);
    return {
      ok: true,
      state: 'BLOCKED',
      reason: 'PASS_BUDGET_EXHAUSTED',
      cycles,
      blockers: final?.frontier?.blocked || [],
      final
    };
  }

  async cycle(incomingSignals = []) {
    const persisted = persistIntents(this.worldline, incomingSignals);
    if (!persisted.ok) return persisted;

    const field = activeIntents(this.worldline);
    const { graph } = this.observe(field);
    let frontier = buildFrontier(graph, this.capabilities);

    const observations = this.worldline.append({
      kind: 'fact',
      subject: `cycle:${Date.now()}`,
      payload: {
        activeIntentIds: field.map(intent => intent.id),
        graph,
        blocked: frontier.blocked
      },
      epistemic: 'observed'
    }, this.worldline.revision());
    if (!observations.ok) return observations;

    const forged = await this.invent(frontier.blocked);

    let rev = this.worldline.revision();
    for (const organ of forged) {
      const out = this.worldline.append({
        kind: organ.ok ? 'capability' : 'failure',
        subject: `foundry:${organ.domain}:${organ.objectiveId}`,
        payload: organ,
        epistemic: organ.ok ? 'verified' : 'observed'
      }, rev);
      if (!out.ok) return out;
      rev = out.revision;
    }

    if (forged.some(x => x.ok)) {
      frontier = buildFrontier(graph, this.capabilities);
    }

    const results = await Promise.all(frontier.parallel.map(async action => {
      const receptor = this.capabilities[action.domain] || this.capabilities.general;
      try {
        const result = await receptor.execute(action);
        const verification = receptor.verify
          ? await receptor.verify(result, action)
          : { ok: true, mode: 'tool-result-only' };
        return { action, result, verification, ok: verification?.ok === true };
      } catch (error) {
        return { action, ok: false, error: String(error) };
      }
    }));

    rev = this.worldline.revision();
    for (const result of results) {
      const out = this.worldline.append({
        kind: result.ok ? 'receipt' : 'failure',
        subject: result.action.id,
        payload: result,
        epistemic: result.ok ? 'verified' : 'observed'
      }, rev);
      if (!out.ok) return out;
      rev = out.revision;
    }

    const settled = settleIntents(this.worldline, graph, results);
    if (!settled.ok) return settled;

    return {
      ok: true,
      revision: this.worldline.revision(),
      graph,
      frontier,
      forged,
      results,
      intents: this.worldline.materialize().intents,
      state: this.worldline.materialize(),
      policies: this.policyField.snapshot()
    };
  }
}
