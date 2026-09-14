import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStateResult, saveState, newTurn, patchTurn, parsePacket, serializePacket, MAX_PACKET_BYTES } from '../src/model.ts';

function state() {
  const first = newTurn('Продолжить работу');
  const second = patchTurn(newTurn('Проверить сборку'), { result: 'Сборка прошла' });
  return { version: 1, turns: [first, patchTurn(second, { verified: true })], activeId: second.id };
}
function storage(initial = null, fail = false) {
  let value = initial;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => value,
    setItem: (_key, next) => { if (fail) throw new Error('QuotaExceededError'); value = next; }
  } });
  return () => value;
}
test('export/import preserves active turn, history and user attestation', () => {
  const original = state();
  assert.deepEqual(parsePacket(serializePacket(original)), original);
});
test('bad packets are rejected without altering persisted data', () => {
  const original = state();
  const read = storage(JSON.stringify(original));
  const invalid = [null, { version: 2, turns: [] }, { version: 1, turns: {} },
    { ...original, turns: [original.turns[0], original.turns[0]] },
    { ...original, activeId: 'missing' },
    { ...original, turns: [{ ...original.turns[0], context: [42] }] },
    { ...original, turns: [{ ...original.turns[0], verified: 'yes' }] }];
  for (const value of invalid) assert.throws(() => parsePacket(JSON.stringify({ schema: 'mondayid.continuity.v1', state: value })));
  assert.throws(() => parsePacket('{'));
  assert.throws(() => parsePacket(JSON.stringify({ schema: 'other', state: original })));
  assert.throws(() => parsePacket(' '.repeat(MAX_PACKET_BYTES + 1)));
  assert.equal(read(), JSON.stringify(original));
});
test('corrupt storage is reported and remains untouched', () => {
  const read = storage('{broken');
  const loaded = loadStateResult();
  assert.deepEqual(loaded.state, { version: 1, turns: [] });
  assert.ok(loaded.error);
  assert.equal(read(), '{broken');
});
test('write failure returns an error instead of claiming persistence', () => {
  storage(null, true);
  const saved = saveState(state());
  assert.equal(saved.ok, false);
  assert.ok(saved.error);
});
test('intent change invalidates previous result and verification', () => {
  const original = state().turns[1];
  const changed = patchTurn(original, { intent: 'Другая задача', verified: true });
  assert.equal(changed.result, undefined);
  assert.equal(changed.verified, false);
  assert.equal(original.verified, true);
});
test('editing result requires fresh attestation; blank result cannot be confirmed', () => {
  const original = state().turns[1];
  assert.equal(patchTurn(original, { result: 'Новый результат', verified: true }).verified, false);
  assert.equal(patchTurn(newTurn('x'), { result: ' ', verified: true }).verified, false);
});
test('legacy fabricated proof is removed during migration', () => {
  const original = state();
  original.turns[1].result = 'Ход выполнен и ожидает подтверждения результата.';
  original.turns[1].context = ['Текущий разговор', 'Канон MondayID'];
  storage(JSON.stringify(original));
  const migrated = loadStateResult().state.turns[1];
  assert.equal(migrated.result, undefined);
  assert.equal(migrated.verified, false);
  assert.deepEqual(migrated.context, []);
});
test('new intentions have no fabricated context or execution', () => {
  const turn = newTurn('  Новый запрос  ');
  assert.equal(turn.request, 'Новый запрос');
  assert.deepEqual(turn.context, []);
  assert.equal(turn.result, undefined);
  assert.equal(turn.verified, false);
});
