import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMondayIDHttpRuntime } from "./http-runtime.mjs";
import { readEncryptedState } from "./secure-state.mjs";

const directory = await mkdtemp(join(tmpdir(), "mondayid-http-"));
const statePath = join(directory, "state.enc");
const agent = { async run({ signal, state }) { return { status: "verified", result: `${signal}:after:${state.revision}`, receiptId: `r-${state.revision + 1}`, providerId: "openai-mondayid", continuation: null, trace: [] }; } };
const server = createMondayIDHttpRuntime({ agent, statePath, stateKey: "state-key-with-enough-entropy", controlToken: "control-secret" });
server.listen(0, "127.0.0.1"); await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const health = await fetch(`${origin}/health`).then(r => r.json());
  assert.deepEqual(health, { status: "ok", runtime: "MondayID", durable: true });
  assert.equal((await fetch(`${origin}/v1/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signal: "continue" }) })).status, 401);
  const run = await fetch(`${origin}/v1/tasks`, { method: "POST", headers: { authorization: "Bearer control-secret", "content-type": "application/json" }, body: JSON.stringify({ signal: "continue" }) }).then(r => r.json());
  assert.equal(run.result, "continue:after:0");
  assert.equal(run.stateRevision, 1);
  const recovered = await readEncryptedState(statePath, "state-key-with-enough-entropy");
  assert.equal(recovered.revision, 1);
  assert.equal(recovered.lastReceiptId, "r-1");
  console.log(JSON.stringify({ RESULT: "PASS", vertical: "iPhone-compatible HTTP signal -> authenticated runtime -> agent -> encrypted canonical state -> receipt", run }, null, 2));
} finally { server.close(); await rm(directory, { recursive: true, force: true }); }
