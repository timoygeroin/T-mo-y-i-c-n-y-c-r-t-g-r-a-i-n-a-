import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createGitHubTools, createMondayIDAgent, createOpenAICompatibleProvider, createOpenAIResponsesProvider } from "./mondayid-agent.mjs";
import { readEncryptedState, writeEncryptedState } from "./secure-state.mjs";

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function readBody(request, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; if (body.length > limit) reject(new Error("request too large")); });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

export function createMondayIDHttpRuntime({ agent, statePath, stateKey, controlToken }) {
  if (!agent?.run || !statePath || !stateKey || !controlToken) throw new TypeError("HTTP runtime requires agent, statePath, stateKey, and controlToken");
  let queue = Promise.resolve();
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { status: "ok", runtime: "MondayID", durable: true });
    if (request.method !== "POST" || request.url !== "/v1/tasks") return json(response, 404, { error: "not_found" });
    if (request.headers.authorization !== `Bearer ${controlToken}`) return json(response, 401, { error: "unauthorized" });
    let payload;
    try { payload = JSON.parse(await readBody(request)); }
    catch (error) { return json(response, 400, { error: "invalid_json", detail: error.message }); }
    if (typeof payload.signal !== "string" || !payload.signal.trim()) return json(response, 422, { error: "signal_required" });

    const execute = async () => {
      const state = await readEncryptedState(statePath, stateKey);
      const result = await agent.run({ signal: payload.signal.trim(), state });
      const next = {
        ...state,
        revision: (state.revision ?? 0) + 1,
        activeObjective: payload.signal.trim(),
        continuation: result.continuation,
        lastResult: result.result,
        lastReceiptId: result.receiptId,
        lastProviderId: result.providerId,
        lineage: [...(state.lineage ?? []), { revision: (state.revision ?? 0) + 1, receiptId: result.receiptId, providerId: result.providerId }],
      };
      await mkdir(dirname(statePath), { recursive: true });
      await writeEncryptedState(statePath, next, stateKey);
      return { status: result.status, result: result.result, receiptId: result.receiptId, providerId: result.providerId, stateRevision: next.revision, toolTrace: result.trace };
    };
    const task = queue.then(execute, execute);
    queue = task.then(() => undefined, () => undefined);
    try { return json(response, 200, await task); }
    catch (error) { return json(response, 503, { error: "runtime_failed", detail: error.message }); }
  });
  return server;
}

export function runtimeFromEnvironment(env = process.env) {
  const required = (name) => { if (!env[name]) throw new Error(`missing ${name}`); return env[name]; };
  const providers = [createOpenAIResponsesProvider({
    id: "openai-mondayid",
    model: env.OPENAI_MODEL ?? "gpt-5.4-mini",
    apiKey: required("OPENAI_API_KEY"),
  })];
  if (env.MONDAYID_FALLBACK_BASE_URL && env.MONDAYID_FALLBACK_API_KEY && env.MONDAYID_FALLBACK_MODEL) providers.push(createOpenAICompatibleProvider({
    id: "fallback",
    baseUrl: env.MONDAYID_FALLBACK_BASE_URL,
    apiKey: env.MONDAYID_FALLBACK_API_KEY,
    model: env.MONDAYID_FALLBACK_MODEL,
  }));
  const tools = env.GITHUB_TOKEN && env.GITHUB_REPOSITORY ? createGitHubTools({ token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY }) : [];
  const agent = createMondayIDAgent({ providers, tools });
  return createMondayIDHttpRuntime({
    agent,
    statePath: env.MONDAYID_STATE_PATH ?? ".mondayid/state.enc",
    stateKey: required("MONDAYID_STATE_KEY"),
    controlToken: required("MONDAYID_CONTROL_TOKEN"),
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const server = runtimeFromEnvironment();
  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ status: "listening", port })));
}
