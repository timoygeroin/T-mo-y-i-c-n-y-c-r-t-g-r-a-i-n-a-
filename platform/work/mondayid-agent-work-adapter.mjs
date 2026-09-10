import {
  ProviderUnavailableError,
  createMondayIDAgent,
} from "../runtime/mondayid-agent.mjs";

function freeze(value) {
  return Object.freeze(value);
}

function normalizeProviderFailure(error) {
  const raw = error?.code ?? "provider_error";
  if (raw === "quota" || raw === "quota_or_rate_limit" || raw === "rate_limit") return "rate_limit";
  if (raw === "capacity") return "capacity";
  if (raw === "provider_timeout" || raw === "timeout" || raw === "network_timeout") return "provider_timeout";
  if (
    raw === "network_error" ||
    raw === "all_providers_unavailable" ||
    raw === "provider_unavailable" ||
    /^http_5\d\d$/.test(raw)
  ) return "provider_unavailable";
  return raw;
}

function signalFromTask(task) {
  if (typeof task === "string") return task;
  if (task?.instruction && Object.keys(task).length === 1) return task.instruction;
  return JSON.stringify(task);
}

export function createMondayIDAgentWorkFactory({
  providerAdapters,
  tools = [],
  maxTurns = 12,
  systemPrompt = null,
} = {}) {
  const adapters = providerAdapters instanceof Map
    ? providerAdapters
    : new Map(Object.entries(providerAdapters ?? {}));

  if (adapters.size === 0) {
    throw new TypeError("MondayID agent WorkUp adapter requires providerAdapters");
  }

  return freeze({
    id: "workup.mondayid-agent-adapter.v1",

    async create({ provider, jobId, journal }) {
      const providerAdapter = adapters.get(provider.id);
      if (!providerAdapter) {
        throw new Error(`no MondayID agent adapter configured for compute provider: ${provider.id}`);
      }

      const agent = createMondayIDAgent({
        providers: [providerAdapter],
        tools,
        maxTurns,
        systemPrompt,
      });

      return freeze({
        async runUntilBlocker(task) {
          const recovered = journal?.read ? await journal.read(jobId) : null;
          try {
            const result = await agent.run({
              signal: signalFromTask(task),
              state: {
                activeObjective: recovered?.activeTask ?? task,
                continuation: recovered?.result?.final?.continuation ?? null,
                lastResult: recovered?.result?.final ?? null,
              },
            });

            if (result.status === "verified") {
              return freeze({
                status: "complete",
                final: freeze({
                  status: "verified",
                  providerId: provider.id,
                  result: result.result,
                  trace: result.trace,
                  providerFailures: result.providerFailures,
                  receiptId: result.receiptId,
                  continuation: result.continuation,
                }),
              });
            }

            return freeze({
              status: "blocked",
              blocker: result.status === "continuation_required" ? "depth_limit" : result.status,
              final: freeze({
                status: result.status,
                providerId: provider.id,
                result: result.result,
                trace: result.trace,
                receiptId: result.receiptId,
                continuation: result.continuation,
              }),
            });
          } catch (error) {
            if (error instanceof ProviderUnavailableError) {
              const code = normalizeProviderFailure(error);
              return freeze({
                status: "blocked",
                blocker: code,
                final: freeze({
                  status: code,
                  providerId: provider.id,
                  originalProviderCode: error.code,
                  retryable: error.retryable,
                }),
              });
            }
            throw error;
          }
        },
      });
    },
  });
}

export { normalizeProviderFailure };
