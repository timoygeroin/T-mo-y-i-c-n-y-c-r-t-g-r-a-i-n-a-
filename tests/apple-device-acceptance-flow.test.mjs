import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../platform/apple-host/MondayIDHost/MondayIDHostApp.swift', import.meta.url), 'utf8'
);
function section(from, to) {
  const i = source.indexOf(from);
  assert.ok(i >= 0, 'missing start anchor: ' + from);
  const j = source.indexOf(to, i + from.length);
  assert.ok(j > i, 'missing end anchor: ' + to);
  return source.slice(i, j);
}

test('only a real saved on-device answer begins device acceptance', () => {
  const submit = section('@MainActor private func submit() async', '@MainActor private func onDeviceResponse(');
  const inference = submit.indexOf('let response = try await onDeviceResponse(');
  const saved = submit.indexOf('store.appendChat(role: "monday", text: response, receiptID: receiptID)');
  const invalidated = submit.indexOf('MondayDeviceAcceptanceStore.beginOnDeviceReceipt(receiptID)');
  const verification = submit.indexOf('MondayDeviceAcceptanceStore.recordOnDeviceIntelligence(receiptID: receiptID)');
  const fallback = submit.indexOf('Trying verified runtime');
  assert.ok(inference >= 0 && saved > inference && invalidated > saved && verification > invalidated && fallback > verification);
  assert.ok(submit.includes('let receiptID = "on-device:' + String.fromCharCode(92) + '(UUID().uuidString)"'));
});

test('a new local response invalidates stale approval before contacting health server', () => {
  const reset = section('static func beginOnDeviceReceipt(', '@MainActor\n    static func recordOnDeviceIntelligence(');
  assert.match(reset, /guard isPhysicalDevice else \{ return \}/);
  assert.match(reset, /snapshot\.runtimeReceiptID = receiptID/);
  for (const key of ['runtimeStateRevision', 'runtimeVerifiedAt', 'continuityReceiptID', 'continuityStateRevision', 'continuityVerifiedAt']) {
    assert.ok(reset.includes('snapshot.' + key + ' = nil'), key + ' was not invalidated');
  }
  assert.match(reset, /save\(snapshot\)/);
});

test('asynchronous evidence records only its current receipt, never an older reply', () => {
  const handler = section('static func recordOnDeviceIntelligence(', 'static func advanceIfPossible()');
  assert.match(handler, /guard isPhysicalDevice else \{ return \}/);
  assert.match(handler, /guard health\.isReady else \{ return \}/);
  assert.match(handler, /snapshot\.runtimeReceiptID == receiptID/);
  assert.match(handler, /snapshot\.runtimeVerifiedAt == nil/);
  assert.match(handler, /snapshot\.runtimeVerifiedAt = Date\(\)/);
});

test('a physical relaunch after model evidence is necessary, with a fresh health readback', () => {
  const verified = section('static func isVerified(', 'static func beginOnDeviceReceipt(');
  const advance = section('static func advanceIfPossible()', 'private static func canonicalHealth()');
  assert.match(verified, /guard isPhysicalDevice/);
  assert.match(verified, /snapshot\.latestLaunchAt > runtimeAt/);
  assert.match(verified, /continuityAt >= snapshot\.latestLaunchAt/);
  assert.match(advance, /snapshot\.latestLaunchAt > runtimeAt/);
  assert.match(advance, /guard health\.isReady else \{ return \}/);
  assert.match(advance, /snapshot\.continuityReceiptID == nil/);
});

test('late health result must not approve changed launch or changed model response', () => {
  const advance = section('static func advanceIfPossible()', 'private static func canonicalHealth()');
  const afterAwait = advance.slice(advance.indexOf('let health = try await canonicalHealth()'));
  assert.match(afterAwait, /let current = load\(\)/);
  for (const key of ['installID', 'latestLaunchAt', 'runtimeReceiptID']) {
    assert.ok(afterAwait.includes('current.' + key + ' == snapshot.' + key), key);
  }
  assert.match(afterAwait, /current\.runtimeVerifiedAt == runtimeAt/);
  assert.match(afterAwait, /current\.continuityReceiptID == nil/);
  assert.match(afterAwait, /relaunch:/);
});

test('every subsequent launch invalidates its old continuity and can recheck', () => {
  const launch = section('static func markLaunch()', 'static func isVerified(');
  for (const key of ['continuityReceiptID', 'continuityStateRevision', 'continuityVerifiedAt']) {
    assert.ok(launch.includes('snapshot.' + key + ' = nil'), key);
  }
  assert.match(launch, /snapshot\.launchCount \+= 1/);
});
