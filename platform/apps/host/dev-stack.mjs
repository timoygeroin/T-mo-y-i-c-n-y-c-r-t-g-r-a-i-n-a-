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

const modelCredentialAvailable = Boolean(
  process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY
);

if (!modelCredentialAvailable) {
  console.error('No model credential is configured. Use VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY for Vercel AI Gateway or OPENAI_API_KEY for direct local OpenAI fallback.');
  process.exit(1);
}

const transport = (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY)
  ? 'vercel_ai_gateway'
  : 'direct_openai';
console.log(`MondayID stack: transport=${transport} model=${process.env.MONDAYID_MODEL || 'openai/gpt-5.6-sol'} reasoning=${process.env.MONDAYID_REASONING || 'high'}`);
run('runtime', process.execPath, ['runtime-server.mjs']);
run('vite', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev']);

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
