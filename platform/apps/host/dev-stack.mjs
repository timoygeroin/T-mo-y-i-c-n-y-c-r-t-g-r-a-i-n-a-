import { spawn } from 'node:child_process';

const children = [];
let stopping = false;

function run(name, command, args, env = process.env) {
  const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`${name} exited with ${reason}`);
    stop(code ?? 1);
  });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 150).unref();
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not configured. Create/select the MondayiD Platform key before starting the live host.');
  process.exit(1);
}

console.log(`MondayID stack: model=${process.env.MONDAYID_MODEL || 'gpt-5.6-sol'} reasoning=${process.env.MONDAYID_REASONING || 'high'}`);
run('runtime', process.execPath, ['runtime-server.mjs']);
run('vite', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev']);

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
