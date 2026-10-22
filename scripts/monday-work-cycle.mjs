// Monday Work periodic independent readback. No model, key, mutation or paid provider.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = Object.freeze([
  'app.js', 'file-vault.js', 'portable-capsule.js',
  'encrypted-capsule.js', 'work-evidence.js',
]);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

/** A fail-closed, read-only comparison of canonical files to the public release. */
export async function inspectMondayDeployment({
  readLocal = path => readFile(path),
  fetchPublic = fetch,
  baseUrl = 'https://aloof-vr.miniup.app',
  checkedAt = new Date().toISOString(),
  localGate = 'success',
} = {}) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== 'aloof-vr.miniup.app' ||
      base.username || base.password || base.search || base.hash ||
      base.pathname !== '/') {
    throw new Error('INVALID_PUBLIC_ORIGIN');
  }
  const checks = [];
  for (const asset of ASSETS) {
    const path = `surfaces/02/${asset}`;
    let expectedSha256 = null;
    try {
      const content = await readLocal(path);
      expectedSha256 = sha256(content);
    } catch {
      checks.push({asset, status:'LOCAL_MISSING', expectedSha256:null, observedSha256:null});
      continue;
    }
    try {
      const response = await fetchPublic(new URL(asset, base).href, {
        method:'GET', redirect:'follow', headers:{'Cache-Control':'no-cache'},
        signal:AbortSignal.timeout(12000),
      });
      if (!response?.ok) {
        checks.push({asset,status:'HTTP_ERROR',expectedSha256,observedSha256:null});
        continue;
      }
      const reportedSize = Number(response.headers?.get?.('content-length'));
      if (reportedSize > 2 * 1024 * 1024) {
        checks.push({asset,status:'TOO_LARGE',expectedSha256,observedSha256:null});
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) {
        checks.push({asset,status:'TOO_LARGE',expectedSha256,observedSha256:null});
        continue;
      }
      const observedSha256 = sha256(bytes);
      checks.push({asset,
        status: observedSha256 === expectedSha256 ? 'MATCH' : 'CONTENT_DRIFT',
        expectedSha256, observedSha256,
      });
    } catch {
      // Never print URLs, response bodies, exceptions, credentials or tokens to a public artifact.
      checks.push({asset,status:'UNREACHABLE',expectedSha256,observedSha256:null});
    }
  }
  const healthy = localGate === 'success' && checks.length === ASSETS.length &&
    checks.every(item => item.status === 'MATCH');
  const action = localGate !== 'success' ? 'REVIEW_LOCAL_TESTS' :
    healthy ? 'NO_ACTION_REQUIRED' : 'REVIEW_DEPLOYMENT';
  return Object.freeze({
    schema:'monday.work-cycle.v1',
    checkedAt,
    status:healthy ? 'VERIFIED_PUBLIC_READBACK' : 'BLOCKED',
    localGate:localGate === 'success' ? 'success' : 'failure',
    action, checks,
    boundary:'Read-only QA. No autonomous code writing, background model inference or release operations.',
  });
}

async function main() {
  const outputIndex=process.argv.indexOf('--output');
  const output=outputIndex>=0?process.argv[outputIndex+1]:null;
  if (!output || !output.endsWith('.json')) throw new Error('OUTPUT_REQUIRED');
  const gateIndex=process.argv.indexOf('--local-gate');
  const localGate=gateIndex>=0?process.argv[gateIndex+1]:'failure';
  const report=await inspectMondayDeployment({localGate});
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(`Monday Work: ${report.status}; ${report.checks.filter(x=>x.status==='MATCH').length}/${report.checks.length} public assets verified; next=${report.action}`);
  if (report.status !== 'VERIFIED_PUBLIC_READBACK') process.exitCode=1;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(`Monday Work setup error: ${error.message}`);process.exitCode=1});
}
