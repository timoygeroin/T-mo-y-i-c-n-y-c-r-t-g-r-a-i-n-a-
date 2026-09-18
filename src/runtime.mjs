import { compileSignals } from './compiler.mjs';
import { buildFrontier } from './planner.mjs';
import { Worldline } from './worldline.mjs';

export class MondayRuntime {
  constructor({ worldline = new Worldline(), capabilities = {} } = {}) {
    this.worldline = worldline;
    this.capabilities = capabilities;
  }

  observe(signals) {
    const graph = compileSignals(signals);
    const frontier = buildFrontier(graph, this.capabilities);
    return { graph, frontier };
  }

  async cycle(signals) {
    const startedAtRevision = this.worldline.revision();
    const { graph, frontier } = this.observe(signals);
    const observations = this.worldline.append({
      kind: 'fact',
      subject: `cycle:${Date.now()}`,
      payload: { graph, blocked: frontier.blocked },
      epistemic: 'observed'
    }, startedAtRevision);
    if (!observations.ok) return observations;

    const results = await Promise.all(frontier.parallel.map(async action => {
      const receptor = this.capabilities[action.domain] || this.capabilities.general;
      try {
        const result = await receptor.execute(action);
        const verification = receptor.verify ? await receptor.verify(result, action) : { ok: true, mode: 'tool-result-only' };
        return { action, result, verification, ok: verification?.ok === true };
      } catch (error) {
        return { action, ok: false, error: String(error) };
      }
    }));

    let rev = this.worldline.revision();
    for (const r of results) {
      const out = this.worldline.append({
        kind: r.ok ? 'receipt' : 'failure',
        subject: r.action.id,
        payload: r,
        epistemic: r.ok ? 'verified' : 'observed'
      }, rev);
      if (!out.ok) return out;
      rev = out.revision;
    }

    return { ok: true, revision: rev, graph, frontier, results, state: this.worldline.materialize() };
  }
}
