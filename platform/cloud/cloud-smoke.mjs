import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const commands = [
  ['ONE', ['npm', ['run', 'proof:one']]],
  ['WORK', ['npm', ['run', 'proof:work']]],
  ['FOCUS_OBJECT', ['npm', ['run', 'proof:focus-object']]],
];

const startedAt = new Date().toISOString();
const results = [];

for (const [name, [bin, args]] of commands) {
  const run = spawnSync(bin, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  const stdout = run.stdout || '';
  const stderr = run.stderr || '';
  results.push({
    name,
    command: [bin, ...args].join(' '),
    exitCode: run.status ?? 1,
    signal: run.signal ?? null,
    stdoutSha256: createHash('sha256').update(stdout).digest('hex'),
    stderrSha256: createHash('sha256').update(stderr).digest('hex'),
    stdoutTail: stdout.trim().split('\n').slice(-12),
    stderrTail: stderr.trim().split('\n').slice(-12),
  });
}

const passed = results.every((result) => result.exitCode === 0);
const receipt = {
  kind: 'mondayid.cloud_smoke_receipt',
  version: 1,
  startedAt,
  finishedAt: new Date().toISOString(),
  environment: {
    ci: process.env.CI === 'true',
    githubActions: process.env.GITHUB_ACTIONS === 'true',
    githubSha: process.env.GITHUB_SHA || null,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  acceptance: {
    noLocalComputerRequired: true,
    secretsRequired: false,
    privateCorpusRequired: false,
    executablePathCount: results.length,
    passed,
  },
  results,
};

console.log(JSON.stringify(receipt, null, 2));
if (!passed) process.exit(1);
