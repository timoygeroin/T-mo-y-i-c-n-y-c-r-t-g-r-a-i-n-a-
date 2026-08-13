import { createHash } from "node:crypto";

export class ProviderUnavailableError extends Error {
  constructor(message, { providerId, code = "provider_unavailable", retryable = true } = {}) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.providerId = providerId;
    this.code = code;
    this.retryable = retryable;
  }
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function toolSchema(tool) {
  return { type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}

export function createOpenAICompatibleProvider({ id, baseUrl, model, apiKey, fetchImpl = fetch }) {
  if (!id || !baseUrl || !model || !apiKey) throw new TypeError("provider requires id, baseUrl, model, and apiKey");
  return Object.freeze({
    id,
    model,
    async complete({ messages, tools }) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, messages, tools: tools.map(toolSchema), tool_choice: "auto" }),
        });
      } catch (error) {
        throw new ProviderUnavailableError(error.message, { providerId: id, code: "network_error" });
      }
      if (!response.ok) {
        const detail = await response.text();
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new ProviderUnavailableError(`${id} returned ${response.status}: ${detail.slice(0, 300)}`, {
          providerId: id,
          code: response.status === 429 ? "quota_or_rate_limit" : `http_${response.status}`,
          retryable,
        });
      }
      const payload = await response.json();
      const message = payload.choices?.[0]?.message;
      if (!message) throw new ProviderUnavailableError(`${id} returned no assistant message`, { providerId: id, code: "invalid_response", retryable: false });
      return message;
    },
  });
}

function toResponsesInput(messages) {
  const input = [];
  for (const message of messages) {
    if (message.role === "tool") {
      input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content });
    } else if (message.role === "assistant" && message.tool_calls?.length) {
      if (message.content) input.push({ role: "assistant", content: message.content });
      for (const call of message.tool_calls) input.push({
        type: "function_call",
        call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      });
    } else {
      input.push({ role: message.role === "system" ? "developer" : message.role, content: message.content });
    }
  }
  return input;
}

export function createOpenAIResponsesProvider({ id = "openai", model, apiKey, baseUrl = "https://api.openai.com/v1", fetchImpl = fetch }) {
  if (!model || !apiKey) throw new TypeError("OpenAI Responses provider requires model and apiKey");
  return Object.freeze({
    id,
    model,
    async complete({ messages, tools }) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/responses`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            input: toResponsesInput(messages),
            tools: tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters, strict: true })),
            store: false,
          }),
        });
      } catch (error) {
        throw new ProviderUnavailableError(error.message, { providerId: id, code: "network_error" });
      }
      if (!response.ok) {
        const detail = await response.text();
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new ProviderUnavailableError(`${id} returned ${response.status}: ${detail.slice(0, 300)}`, {
          providerId: id,
          code: response.status === 429 ? "quota_or_rate_limit" : `http_${response.status}`,
          retryable,
        });
      }
      const payload = await response.json();
      const calls = (payload.output ?? []).filter((item) => item.type === "function_call");
      if (calls.length) return {
        role: "assistant",
        content: null,
        tool_calls: calls.map((call) => ({ id: call.call_id, type: "function", function: { name: call.name, arguments: call.arguments } })),
      };
      const content = (payload.output ?? [])
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text")
        .map((item) => item.text)
        .join("\n");
      if (!content) throw new ProviderUnavailableError(`${id} returned no output text`, { providerId: id, code: "invalid_response", retryable: false });
      return { role: "assistant", content };
    },
  });
}

export function createMondayIDAgent({ providers, tools, maxTurns = 12, systemPrompt }) {
  if (!providers?.length) throw new TypeError("at least one provider is required");
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  if (toolMap.size !== tools.length) throw new Error("duplicate tool name");

  async function completeWithFailover(input) {
    const failures = [];
    for (const provider of providers) {
      try {
        return { provider, message: await provider.complete(input), failures };
      } catch (error) {
        failures.push({ providerId: provider.id, code: error.code ?? "provider_error", message: error.message });
        if (!(error instanceof ProviderUnavailableError) || !error.retryable) throw error;
      }
    }
    throw new ProviderUnavailableError("all configured providers are unavailable", { code: "all_providers_unavailable", retryable: false });
  }

  async function run({ signal, state = {} }) {
    const messages = [
      { role: "system", content: systemPrompt ?? "You are MondayID's replaceable compute organ. Continue the loaded state, use tools for facts and actions, never invent tool results, and return a concise verified result." },
      { role: "system", content: `RECOVERED_STATE=${JSON.stringify({ activeObjective: state.activeObjective ?? null, continuation: state.continuation ?? null, priorResult: state.lastResult ?? null })}` },
      { role: "user", content: signal },
    ];
    const trace = [];
    const providerFailures = [];
    let lastProviderId = null;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const completion = await completeWithFailover({ messages, tools });
      lastProviderId = completion.provider.id;
      providerFailures.push(...completion.failures);
      const assistant = completion.message;
      messages.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (calls.length === 0) {
        const result = assistant.content?.trim();
        if (!result) throw new Error("provider ended without a result");
        return Object.freeze({
          status: "verified",
          result,
          providerId: lastProviderId,
          providerFailures,
          trace,
          continuation: null,
          receiptId: `agent:${hash({ signal, result, trace })}`,
        });
      }

      for (const call of calls) {
        const tool = toolMap.get(call.function?.name);
        if (!tool) throw new Error(`provider requested unknown tool: ${call.function?.name}`);
        let args;
        try { args = JSON.parse(call.function.arguments || "{}"); }
        catch { throw new Error(`invalid arguments for ${tool.name}`); }
        const output = await tool.execute(args, { state, signal });
        trace.push({ turn, tool: tool.name, callId: call.id, outputHash: hash(output) });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
      }
    }
    return Object.freeze({ status: "continuation_required", result: null, providerId: lastProviderId, providerFailures, trace, continuation: { messages }, receiptId: `agent:${hash(messages)}` });
  }

  return Object.freeze({ run });
}

export function createGitHubTools({ token, repository, apiBase = "https://api.github.com", fetchImpl = fetch }) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  async function request(path) {
    const response = await fetchImpl(`${apiBase}${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }
  return [
    {
      name: "github_read_file",
      description: "Read one UTF-8 file from the configured GitHub repository.",
      parameters: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" } }, required: ["path"], additionalProperties: false },
      async execute({ path, ref }) {
        const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
        const data = await request(`/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}${suffix}`);
        if (data.type !== "file" || data.encoding !== "base64") throw new Error("requested GitHub path is not a base64 file");
        return { path: data.path, sha: data.sha, content: Buffer.from(data.content, "base64").toString("utf8") };
      },
    },
    {
      name: "github_search_code",
      description: "Search code inside the configured GitHub repository.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
      async execute({ query }) {
        const data = await request(`/search/code?q=${encodeURIComponent(`${query} repo:${repository}`)}&per_page=20`);
        return { totalCount: data.total_count, items: data.items.map(({ name, path, sha, html_url }) => ({ name, path, sha, url: html_url })) };
      },
    },
    {
      name: "web_fetch",
      description: "Fetch a public HTTP or HTTPS page as text. Use only URLs directly relevant to the task.",
      parameters: { type: "object", properties: { url: { type: "string", pattern: "^https?://" } }, required: ["url"], additionalProperties: false },
      async execute({ url }) {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported URL protocol");
        const response = await fetchImpl(url, { headers: { "user-agent": "MondayID/1.0" }, redirect: "follow" });
        if (!response.ok) throw new Error(`web fetch ${response.status}`);
        return { url: response.url, status: response.status, text: (await response.text()).slice(0, 100_000) };
      },
    },
  ];
}
