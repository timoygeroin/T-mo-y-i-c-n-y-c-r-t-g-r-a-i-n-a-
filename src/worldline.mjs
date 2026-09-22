import crypto from 'node:crypto';

const stable = (v) => Array.isArray(v)
  ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    : JSON.stringify(v);

export const hash = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');

export class Worldline {
  #events = [];
  #ids = new Set();
  #revision = 'root';

  revision() { return this.#revision; }
  events() { return structuredClone(this.#events); }

  append(event, expectedRevision = this.#revision) {
    if (expectedRevision !== this.#revision) {
      return { ok: false, code: 'STALE_REVISION', expected: this.#revision, got: expectedRevision };
    }
    const normalized = {
      id: event.id || hash({ ...event, n: this.#events.length }).slice(0, 24),
      at: event.at || new Date().toISOString(),
      kind: event.kind || 'observation',
      subject: event.subject || 'system',
      payload: event.payload ?? null,
      evidence: event.evidence ?? null,
      epistemic: event.epistemic || 'observed'
    };
    if (this.#ids.has(normalized.id)) return { ok: true, duplicate: true, revision: this.#revision };
    this.#events.push(normalized);
    this.#ids.add(normalized.id);
    this.#revision = hash({ prior: this.#revision, event: normalized }).slice(0, 24);
    return { ok: true, duplicate: false, revision: this.#revision, event: structuredClone(normalized) };
  }

  materialize() {
    const state = { facts: {}, tasks: {}, intents: {}, failures: {}, capabilities: {}, receipts: {} };
    for (const e of this.#events) {
      if (e.kind === 'fact') state.facts[e.subject] = e.payload;
      if (e.kind === 'task') state.tasks[e.subject] = e.payload;
      if (e.kind === 'intent') state.intents[e.subject] = e.payload;
      if (e.kind === 'failure') state.failures[e.subject] = e.payload;
      if (e.kind === 'capability') state.capabilities[e.subject] = e.payload;
      if (e.kind === 'receipt') state.receipts[e.subject] = e.payload;
    }
    return { revision: this.#revision, ...state };
  }
}
