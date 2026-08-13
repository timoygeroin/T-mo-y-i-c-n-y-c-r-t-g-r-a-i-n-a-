import { appendFile, readFile } from "node:fs/promises";
import { createGitHubTools, createMondayIDAgent, createOpenAICompatibleProvider } from "./mondayid-agent.mjs";
import { readEncryptedState, writeEncryptedState } from "./secure-state.mjs";

function required(name) { const value = process.env[name]; if (!value) throw new Error(`missing required environment variable ${name}`); return value; }
function providerFrom(prefix, priority) {
  const baseUrl = process.env[`${prefix}_BASE_URL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  const model = process.env[`${prefix}_MODEL`];
  if (!baseUrl || !apiKey || !model) return null;
  return createOpenAICompatibleProvider({ id: prefix.toLowerCase(), baseUrl, apiKey, model, priority });
}

const signal = process.env.MONDAYID_SIGNAL ?? (process.env.MONDAYID_SIGNAL_FILE ? await readFile(process.env.MONDAYID_SIGNAL_FILE, "utf8") : "");
if (!signal.trim()) throw new Error("MondayID received an empty signal");
const statePath = process.env.MONDAYID_STATE_PATH ?? ".mondayid-state.enc";
const stateKey = required("MONDAYID_STATE_KEY");
const state = await readEncryptedState(statePath, stateKey);
const providers = [providerFrom("MONDAYID_PRIMARY", 1), providerFrom("MONDAYID_FALLBACK", 2)].filter(Boolean);
if (!providers.length) throw new Error("configure MONDAYID_PRIMARY_* or MONDAYID_FALLBACK_* provider secrets");
const tools = createGitHubTools({ token: required("GITHUB_TOKEN"), repository: required("GITHUB_REPOSITORY") });
const agent = createMondayIDAgent({ providers, tools });
const result = await agent.run({ signal: signal.trim(), state });
const next = {
  ...state,
  revision: (state.revision ?? 0) + 1,
  activeObjective: signal.trim(),
  continuation: result.continuation,
  lastResult: result.result,
  lastReceiptId: result.receiptId,
  lastProviderId: result.providerId,
  lineage: [...(state.lineage ?? []), { revision: (state.revision ?? 0) + 1, receiptId: result.receiptId, providerId: result.providerId, failedProviders: result.providerFailures.map(x => x.providerId) }],
};
await writeEncryptedState(statePath, next, stateKey);
const publicReceipt = { status: result.status, receiptId: result.receiptId, providerId: result.providerId, failedProviders: result.providerFailures.map(({ providerId, code }) => ({ providerId, code })), toolTrace: result.trace, stateRevision: next.revision, result: result.result };
await appendFile(process.env.GITHUB_OUTPUT, `receipt<<MONDAYID_EOF\n${JSON.stringify(publicReceipt)}\nMONDAYID_EOF\n`);
console.log(JSON.stringify(publicReceipt, null, 2));
