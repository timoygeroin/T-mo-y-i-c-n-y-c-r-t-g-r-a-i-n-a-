import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMondayIDHttpRuntime } from "./http-runtime.mjs";
import { readEncryptedState } from "./secure-state.mjs";

const directory = await mkdtemp(join(tmpdir(), "mondayid-reentry-"));
const statePath = join(directory, "state.enc");
const stateKey = "reentry-state-key-with-enough-entropy";
const controlToken = "reentry-control-secret";

function agent(label) {
  return {
    async run({ signal, state }) {
      return {
        status: "executed",
        result: `${label}:${signal}:after:${state.revision}`,
        receiptId: `${label}-r-${state.revision + 1}`,
        providerId: "proof-provider",
        continuation: { objective: signal, checkpoint: state.revision + 1 },
        trace: [{ phase: "proof", label }],
      };
    },
  };
}

async function start(label) {
  const server = createMondayIDHttpRuntime({
    agent: agent(label),
    statePath,
    stateKey,
    controlToken,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function submit(origin, signal) {
  const response = await fetch(`${origin}/v1/tasks`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${controlToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ signal }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

let first;
let second;
try {
  first = await start("session-a");
  const firstRun = await submit(first.origin, "finish Monday");
  assert.equal(firstRun.stateRevision, 1);
  assert.equal(firstRun.receiptId, "session-a-r-1");
  await new Promise((resolve, reject) => first.server.close((error) => error ? reject(error) : resolve()));
  first = null;

  const afterExit = await readEncryptedState(statePath, stateKey);
  assert.equal(afterExit.revision, 1);
  assert.equal(afterExit.activeObjective, "finish Monday");
  assert.equal(afterExit.lastReceiptId, "session-a-r-1");
  assert.deepEqual(afterExit.continuation, { objective: "finish Monday", checkpoint: 1 });

  second = await start("session-b");
  const secondRun = await submit(second.origin, "continue Monday");
  assert.equal(secondRun.stateRevision, 2);
  assert.equal(secondRun.result, "session-b:continue Monday:after:1");
  assert.equal(secondRun.receiptId, "session-b-r-2");

  const recovered = await readEncryptedState(statePath, stateKey);
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.lineage.length, 2);
  assert.equal(recovered.lineage[0].receiptId, "session-a-r-1");
  assert.equal(recovered.lineage[1].receiptId, "session-b-r-2");

  console.log(JSON.stringify({
    RESULT: "PASS",
    gate: "SESSION_REENTRY_DURABLE_RUNTIME",
    evidence: {
      firstRevision: firstRun.stateRevision,
      recoveredRevisionAfterServerExit: afterExit.revision,
      secondRevision: secondRun.stateRevision,
      secondProcessObservedPriorRevision: secondRun.result.endsWith("after:1"),
      receiptLineage: recovered.lineage.map((entry) => entry.receiptId),
    },
  }, null, 2));
} finally {
  if (first?.server?.listening) await new Promise((resolve) => first.server.close(resolve));
  if (second?.server?.listening) await new Promise((resolve) => second.server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
