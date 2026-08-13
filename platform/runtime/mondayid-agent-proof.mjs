import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createGitHubTools, createMondayIDAgent, createOpenAICompatibleProvider } from "./mondayid-agent.mjs";
import { decryptState, encryptState } from "./secure-state.mjs";

let modelCalls = 0;
const server = createServer(async (request, response) => {
  if (request.url === "/primary/chat/completions") { response.writeHead(429); return response.end("quota exhausted"); }
  if (request.url === "/fallback/chat/completions") {
    modelCalls += 1;
    response.setHeader("content-type", "application/json");
    if (modelCalls === 1) return response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "github_read_file", arguments: JSON.stringify({ path: "STATE.md" }) } }] } }] }));
    return response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Recovered STATE.md and continued the task." } }] }));
  }
  if (request.url === "/repos/owner/repo/contents/STATE.md") {
    response.setHeader("content-type", "application/json");
    return response.end(JSON.stringify({ type: "file", encoding: "base64", path: "STATE.md", sha: "abc", content: Buffer.from("continuation=step-2").toString("base64") }));
  }
  response.writeHead(404); response.end("not found");
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  const primary = createOpenAICompatibleProvider({ id: "primary", baseUrl: `${origin}/primary`, model: "gpt", apiKey: "test" });
  const fallback = createOpenAICompatibleProvider({ id: "fallback", baseUrl: `${origin}/fallback`, model: "other", apiKey: "test" });
  const tools = createGitHubTools({ token: "test", repository: "owner/repo", apiBase: origin });
  const agent = createMondayIDAgent({ providers: [primary, fallback], tools });
  const result = await agent.run({ signal: "continue", state: { activeObjective: "build", continuation: "step-2" } });
  assert.equal(result.status, "verified");
  assert.equal(result.providerId, "fallback");
  assert.equal(result.providerFailures[0].code, "quota_or_rate_limit");
  assert.equal(result.trace[0].tool, "github_read_file");
  assert.match(result.result, /continued/);
  const secret = "correct horse battery staple";
  const encrypted = encryptState({ result: result.result, continuation: null }, secret);
  assert.ok(!encrypted.includes(result.result));
  assert.equal(decryptState(encrypted, secret).result, result.result);
  assert.throws(() => decryptState(encrypted, "wrong secret value"));
  console.log(JSON.stringify({ RESULT: "PASS", vertical: "signal -> recovered state -> primary quota failure -> fallback model -> live tool -> verified result -> encrypted continuation", receiptId: result.receiptId }, null, 2));
} finally { server.close(); }
