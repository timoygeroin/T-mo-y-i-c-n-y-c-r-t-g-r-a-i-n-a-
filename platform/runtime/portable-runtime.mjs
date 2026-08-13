import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function freeze(value) { return Object.freeze(value); }
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export class HostUnavailableError extends Error {
  constructor(message, { code = "host_unavailable", retryable = true } = {}) {
    super(message);
    this.name = "HostUnavailableError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function createFileCheckpointStore(path) {
  async function read() {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return freeze({ revision: 0, lineage: [], activeTask: null, continuation: null });
    }
  }

  return freeze({
    path,
    read,
    async write(next, expectedRevision) {
      const current = await read();
      if (current.revision !== expectedRevision) {
        return freeze({ status: "stale_state", expectedRevision, actualRevision: current.revision, state: current });
      }
      const state = {
        ...next,
        revision: current.revision + 1,
        previousFingerprint: current.fingerprint ?? null,
      };
      state.fingerprint = hash(state);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(temporary, path);
      return freeze({ status: "committed", state: freeze(state) });
    },
  });
}

function normalizeHosts(hosts) {
  if (!Array.isArray(hosts) || hosts.length === 0) throw new TypeError("At least one model host is required");
  return hosts.map((host) => {
    if (!host?.id || typeof host.compute !== "function") throw new TypeError("Each host requires id and compute()");
    return freeze({ priority: 100, ...host });
  }).sort((a, b) => a.priority - b.priority);
}

export function createPortableRuntime({ subject = "MondayID", hosts, checkpointStore, capabilities = [] }) {
  if (!checkpointStore?.read || !checkpointStore?.write) throw new TypeError("A checkpointStore with read/write is required");
  const modelHosts = normalizeHosts(hosts);
  const capabilityManifest = capabilities.map(({ id, platform, provides = [] }) => freeze({ id, platform, provides }));

  async function computeWithFailover(input) {
    const attempts = [];
    for (const host of modelHosts) {
      try {
        const output = await host.compute(input);
        return freeze({ hostId: host.id, output, attempts });
      } catch (error) {
        attempts.push(freeze({ hostId: host.id, code: error.code ?? "compute_failed", message: error.message }));
        if (!(error instanceof HostUnavailableError) || !error.retryable) throw error;
      }
    }
    throw new HostUnavailableError("No model host can continue the task", { code: "all_hosts_unavailable", retryable: false });
  }

  async function run(signal) {
    const before = await checkpointStore.read();
    const computation = await computeWithFailover({ signal, state: before, capabilities: capabilityManifest });
    const continuation = computation.output?.continuation ?? null;
    const next = {
      ...before,
      subject,
      activeTask: signal,
      continuation,
      lastHostId: computation.hostId,
      lastResult: computation.output?.result ?? computation.output,
      capabilityManifest,
      lineage: [...(before.lineage ?? []), {
        fromRevision: before.revision,
        hostId: computation.hostId,
        signalHash: hash(signal),
        failedHosts: computation.attempts.map((attempt) => attempt.hostId),
      }],
    };
    const commit = await checkpointStore.write(next, before.revision);
    if (commit.status !== "committed") return freeze({ status: commit.status, computation, checkpoint: commit.state });
    return freeze({
      status: "continued",
      hostId: computation.hostId,
      failedHosts: computation.attempts,
      result: computation.output,
      checkpoint: commit.state,
      receipt: freeze({
        receiptId: `portable:${commit.state.fingerprint}`,
        priorRevision: before.revision,
        committedRevision: commit.state.revision,
        hostId: computation.hostId,
        capabilityCount: capabilityManifest.length,
      }),
    });
  }

  return freeze({ subject, hosts: modelHosts.map(({ id, priority }) => ({ id, priority })), capabilityManifest, run, recover: checkpointStore.read });
}
