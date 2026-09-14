import assert from 'node:assert/strict';
import { ContinuityRuntime } from './continuity-runtime.mjs';

const raw = 'Дима: не теряй ни один смысл. emoji 🧬; newline\nsecond line; quotes "raw"; null-like \\0 stays text.';
const source = { kind: 'direct_current_instruction', ref: 'acceptance/continuity-proof' };
const runtime = new ContinuityRuntime();

const signal = runtime.ingestSignal({
  signalId: 'signal-001',
  raw,
  source,
  capturedAt: '2026-09-14T16:00:00.000Z',
  fragments: [
    { id: 'f-request', kind: 'request', text: 'finish continuity', state: 'APPLIED' },
    { id: 'f-constraint', kind: 'constraint', text: 'preserve raw signal losslessly', state: 'PERSISTED' },
    { id: 'f-loop', kind: 'open_loop', text: 'prove transplant', state: 'OPEN' },
  ],
});

assert.equal(signal.raw, raw, 'raw SignalEvent changed at ingestion');
assert.equal(runtime.snapshot().provenance[0].objectType, 'SignalEvent');
assert.equal(runtime.releaseGate('signal-001').releasable, false, 'OPEN fragment must prevent release');

runtime.addCorrection({
  correctionId: 'correction-001',
  expectedEffect: 'execution survives boundaries',
  failureSignature: 'report replaces execution',
  rejectedBehavior: 'fake completion',
  replacementBehavior: 'receipt + readback before Verified',
  scope: 'Monday v1',
  detector: 'completion without readback evidence',
  sourceRef: 'acceptance/continuity-proof',
});

runtime.addOpenLoop({
  loopId: 'loop-001',
  title: 'continuity transplant proof',
  sourceSignalId: 'signal-001',
  acceptance: 'raw/provenance/correction/open-loop survive export+import byte-for-byte where applicable',
});

runtime.setFragmentState('signal-001', 'f-loop', 'PERSISTED');
assert.equal(runtime.releaseGate('signal-001').releasable, true, 'resolved material fragments should permit release');

const packet = runtime.exportTransplant({ transplantId: 'transplant-001', sourceSystem: 'ChatGPT archive' });
const target = new ContinuityRuntime();
const imported = target.importTransplant(packet);

assert.equal(imported.signals.length, 1);
assert.equal(imported.signals[0].raw, raw, 'transplant changed raw SignalEvent');
assert.equal(imported.signals[0].rawSha256, signal.rawSha256, 'raw digest changed across transplant');
assert.equal(imported.corrections.length, 1);
assert.equal(imported.corrections[0].replacementBehavior, 'receipt + readback before Verified');
assert.equal(imported.openLoops.length, 1);
assert.equal(imported.openLoops[0].state, 'OPEN');
assert.ok(imported.provenance.some((item) => item.objectType === 'SignalEvent' && item.objectId === 'signal-001'));
assert.ok(imported.provenance.some((item) => item.objectType === 'Correction' && item.objectId === 'correction-001'));
assert.equal(imported.transplants[0].rawSha256, packet.rawSha256);

const beforeTamper = target.snapshot();
const tampered = structuredClone(packet);
tampered.raw.signals[0].raw += 'tampered';
assert.throws(() => new ContinuityRuntime().importTransplant(tampered), /integrity mismatch/);
assert.deepEqual(target.snapshot(), beforeTamper, 'failed transplant mutated target state');

console.log(JSON.stringify({
  gate: 'MONDAY_CONTINUITY_GATE',
  status: 'PASS',
  proved: [
    'lossless_raw_signal_event',
    'fragment_release_accounting',
    'provenance',
    'corrections',
    'open_loops',
    'integrity_checked_transplant',
    'failed_import_is_non_mutating',
  ],
  rawSha256: signal.rawSha256,
  transplantSha256: packet.rawSha256,
}, null, 2));
