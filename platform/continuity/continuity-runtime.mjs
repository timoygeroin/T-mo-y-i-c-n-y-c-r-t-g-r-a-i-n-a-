import crypto from 'node:crypto';

function requireText(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be non-empty text`);
  return value;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function clone(value) {
  return structuredClone(value);
}

export const SIGNAL_FRAGMENT_STATES = Object.freeze(['APPLIED', 'ANSWERED', 'PERSISTED', 'SUPERSEDED', 'OPEN']);

export class ContinuityRuntime {
  constructor(seed = {}) {
    this.version = 1;
    this.signals = clone(seed.signals ?? []);
    this.corrections = clone(seed.corrections ?? []);
    this.openLoops = clone(seed.openLoops ?? []);
    this.provenance = clone(seed.provenance ?? []);
    this.transplants = clone(seed.transplants ?? []);
  }

  ingestSignal({ signalId, raw, source, capturedAt, fragments }) {
    requireText(signalId, 'signalId');
    requireText(raw, 'raw');
    requireText(source?.kind, 'source.kind');
    requireText(source?.ref, 'source.ref');
    if (!Array.isArray(fragments) || fragments.length === 0) throw new Error('fragments must be non-empty');
    if (this.signals.some((item) => item.signalId === signalId)) throw new Error(`duplicate signalId ${signalId}`);

    const normalizedFragments = fragments.map((fragment, index) => {
      const id = requireText(fragment.id, `fragments[${index}].id`);
      const kind = requireText(fragment.kind, `fragments[${index}].kind`);
      const text = requireText(fragment.text, `fragments[${index}].text`);
      const state = fragment.state ?? 'OPEN';
      if (!SIGNAL_FRAGMENT_STATES.includes(state)) throw new Error(`invalid fragment state ${state}`);
      return { id, kind, text, state };
    });

    const record = {
      signalId,
      raw,
      rawSha256: stableHash(raw),
      source: clone(source),
      capturedAt: capturedAt ?? new Date().toISOString(),
      fragments: normalizedFragments,
    };
    this.signals.push(record);
    this.provenance.push({
      objectType: 'SignalEvent',
      objectId: signalId,
      source: clone(source),
      rawSha256: record.rawSha256,
    });
    return clone(record);
  }

  setFragmentState(signalId, fragmentId, state) {
    if (!SIGNAL_FRAGMENT_STATES.includes(state)) throw new Error(`invalid fragment state ${state}`);
    const signal = this.signals.find((item) => item.signalId === signalId);
    if (!signal) throw new Error(`unknown signal ${signalId}`);
    const fragment = signal.fragments.find((item) => item.id === fragmentId);
    if (!fragment) throw new Error(`unknown fragment ${fragmentId}`);
    fragment.state = state;
    return clone(fragment);
  }

  addCorrection({ correctionId, expectedEffect, failureSignature, rejectedBehavior, replacementBehavior, scope, detector, sourceRef }) {
    for (const [name, value] of Object.entries({ correctionId, expectedEffect, failureSignature, rejectedBehavior, replacementBehavior, scope, detector, sourceRef })) requireText(value, name);
    if (this.corrections.some((item) => item.correctionId === correctionId)) throw new Error(`duplicate correction ${correctionId}`);
    const record = { correctionId, expectedEffect, failureSignature, rejectedBehavior, replacementBehavior, scope, detector, sourceRef };
    this.corrections.push(record);
    this.provenance.push({ objectType: 'Correction', objectId: correctionId, source: { kind: 'correction_source', ref: sourceRef } });
    return clone(record);
  }

  addOpenLoop({ loopId, title, sourceSignalId, acceptance }) {
    for (const [name, value] of Object.entries({ loopId, title, sourceSignalId, acceptance })) requireText(value, name);
    if (!this.signals.some((item) => item.signalId === sourceSignalId)) throw new Error(`open loop source signal missing: ${sourceSignalId}`);
    if (this.openLoops.some((item) => item.loopId === loopId)) throw new Error(`duplicate open loop ${loopId}`);
    const record = { loopId, title, sourceSignalId, acceptance, state: 'OPEN' };
    this.openLoops.push(record);
    return clone(record);
  }

  exportTransplant({ transplantId, sourceSystem }) {
    requireText(transplantId, 'transplantId');
    requireText(sourceSystem, 'sourceSystem');
    const payload = {
      schema: 'mondayid.continuity.transplant.v1',
      transplantId,
      sourceSystem,
      exportedAt: new Date().toISOString(),
      raw: {
        signals: clone(this.signals),
        corrections: clone(this.corrections),
        openLoops: clone(this.openLoops),
        provenance: clone(this.provenance),
      },
    };
    const canonical = JSON.stringify(payload.raw);
    return { ...payload, rawSha256: stableHash(canonical) };
  }

  importTransplant(packet) {
    if (packet?.schema !== 'mondayid.continuity.transplant.v1') throw new Error('unsupported transplant schema');
    const canonical = JSON.stringify(packet.raw);
    if (stableHash(canonical) !== packet.rawSha256) throw new Error('transplant integrity mismatch');
    const existingSignalIds = new Set(this.signals.map((item) => item.signalId));
    for (const signal of packet.raw.signals ?? []) {
      if (!existingSignalIds.has(signal.signalId)) {
        this.signals.push(clone(signal));
        existingSignalIds.add(signal.signalId);
      }
    }
    const mergeUnique = (target, source, key) => {
      const seen = new Set(target.map((item) => item[key]));
      for (const item of source ?? []) if (!seen.has(item[key])) { target.push(clone(item)); seen.add(item[key]); }
    };
    mergeUnique(this.corrections, packet.raw.corrections, 'correctionId');
    mergeUnique(this.openLoops, packet.raw.openLoops, 'loopId');
    const provKey = (item) => `${item.objectType}:${item.objectId}:${item.source?.ref ?? ''}`;
    const seenProv = new Set(this.provenance.map(provKey));
    for (const item of packet.raw.provenance ?? []) if (!seenProv.has(provKey(item))) { this.provenance.push(clone(item)); seenProv.add(provKey(item)); }
    this.transplants.push({ transplantId: packet.transplantId, sourceSystem: packet.sourceSystem, rawSha256: packet.rawSha256, importedAt: new Date().toISOString() });
    return this.snapshot();
  }

  releaseGate(signalId) {
    const signal = this.signals.find((item) => item.signalId === signalId);
    if (!signal) throw new Error(`unknown signal ${signalId}`);
    const unresolved = signal.fragments.filter((fragment) => !SIGNAL_FRAGMENT_STATES.includes(fragment.state) || fragment.state === 'OPEN');
    return { releasable: unresolved.length === 0, unresolved: clone(unresolved) };
  }

  snapshot() {
    return clone({ version: this.version, signals: this.signals, corrections: this.corrections, openLoops: this.openLoops, provenance: this.provenance, transplants: this.transplants });
  }
}
