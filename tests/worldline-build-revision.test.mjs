import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldlineV4Server } from '../src/worldline-v4-server.mjs';

const root = new URL('../', import.meta.url);
const writeToken = 'revision-test-writer-only';
const readToken = 'revision-test-reader-only';

async function runBuildProof(baseUrl, sha) {
  const child = spawn(process.execPath, ['scripts/prove-worldline-build.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      MONDAYID_WORLDLINE_URL: baseUrl,
      MONDAYID_WORLDLINE_WRITER_TOKEN: writeToken,
      MONDAYID_WORLDLINE_READ_TOKEN: readToken,
      VERCEL_GIT_COMMIT_SHA: sha
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', s => { stdout += s; });
  child.stderr.setEncoding('utf8').on('data', s => { stderr += s; });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  assert.equal(code, 0, stderr || stdout);
  const match = stdout.match(/MONDAYID_WORLDLINE_PROOF (\{[^\n]+\})/);
  assert.ok(match, stdout);
  return JSON.parse(match[1]);
}

test('build-proof writes a distinct verified event per source revision and preserves idempotent retries', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'monday-worldline-revisions-'));
  const server = createWorldlineV4Server({
    file: join(dir, 'worldline.jsonl'),
    writerToken: writeToken,
    readerToken: readToken
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sha1 = 'a'.repeat(40);
  const sha2 = 'b'.repeat(40);

  const first = await runBuildProof(baseUrl, sha1);
  const second = await runBuildProof(baseUrl, sha2);
  const retried = await runBuildProof(baseUrl, sha2);

  assert.equal(first.sourceRevision, sha1);
  assert.equal(second.sourceRevision, sha2);
  assert.equal(first.writeStatus, 'INSERTED');
  assert.equal(second.writeStatus, 'INSERTED', 'a new deployment source must not reuse the previous revision event');
  assert.notEqual(first.eventId, second.eventId);
  assert.equal(retried.writeStatus, 'DUPLICATE');
  assert.equal(retried.eventId, second.eventId);
  assert.equal(first.verification.eventId, first.eventId);
  assert.equal(second.verification.eventId, second.eventId);
});
