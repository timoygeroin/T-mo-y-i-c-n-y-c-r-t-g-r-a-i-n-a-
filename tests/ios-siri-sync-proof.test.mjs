import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../platform/apple-adapter/Sources/MondayIDAppleAdapter/MondayIDSyncProofIntent.swift', import.meta.url),
  'utf8'
);
const adapter = readFileSync(
  new URL('../platform/apple-adapter/Sources/MondayIDAppleAdapter/MondayIDIntents.swift', import.meta.url),
  'utf8'
);
const host = readFileSync(
  new URL('../platform/apple-host/MondayIDHost/MondayIDHostApp.swift', import.meta.url),
  'utf8'
);

test('Siri sync readback is pinned to the observed GitHub event, not a mutable branch', () => {
  assert.match(source, /037904d3e024d14a5b7ed3bbfff885dd4ca763a9/);
  assert.match(source, /mondayid-pos-20261114-chatgpt-001/);
  assert.match(source, /event\.schema == "mondayid\.proof-of-sync\.v1"/);
  assert.match(source, /event\.origin == "chatgpt-monday"/);
  assert.match(source, /event\.target == "ios-monday"/);
  assert.match(source, /event\.state == "PENDING_REMOTE_ACK"/);
});

test('readback requires a physical iPhone and fresh HTTP response', () => {
  assert.match(source, /#if !os\(iOS\) \|\| targetEnvironment\(simulator\)/);
  assert.match(source, /reloadIgnoringLocalCacheData/);
  assert.match(source, /http\.statusCode == 200/);
  assert.match(source, /data\.count <= 16_384/);
  assert.match(source, /UserDefaults\.standard\.set/);
  assert.match(source, /UserDefaults\.standard\.data\(forKey: receiptKey\)/);
});

test('read-only proof cannot claim remote ACK or production synchronization', () => {
  assert.match(source, /GITHUB_EVENT_READ_ON_IPHONE_ONLY_NOT_WORLDLINE_SYNC/);
  assert.match(source, /Production synchronization is not yet verified/);
  assert.doesNotMatch(source, /httpMethod = "POST"/);
  assert.doesNotMatch(source, /Bearer |Authorization|GITHUB_TOKEN|WORLDLINE_WRITER/);
});

test('existing Apple adapter and iPhone app both surface the sync-check intent', () => {
  assert.match(source, /struct CheckMondaySyncIntent: AppIntent/);
  assert.match(adapter, /intent: CheckMondaySyncIntent\(\)/);
  assert.match(host, /intent: CheckMondaySyncIntent\(\)/);
  assert.ok(adapter.includes('Check sync in ' + String.fromCharCode(92) + '(.applicationName)'));
  assert.ok(host.includes('Check sync in ' + String.fromCharCode(92) + '(.applicationName)'));
});
