import { randomUUID } from "node:crypto";

function freeze(value) {
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function emptyState() {
  return { schema: "mondayid.workless-github-journal.v1", revision: 0, jobs: {} };
}

export function createGitHubWorkJournal({
  repository,
  branch,
  path,
  token,
  apiBase = "https://api.github.com",
  fetchImpl = fetch,
  maxConflictRetries = 4,
} = {}) {
  if (!repository || !repository.includes("/")) throw new TypeError("GitHub Work journal requires owner/repository");
  if (!branch) throw new TypeError("GitHub Work journal requires branch");
  if (!path) throw new TypeError("GitHub Work journal requires path");
  if (!token) throw new TypeError("GitHub Work journal requires token");

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
  };
  const contentUrl = `${apiBase.replace(/\/$/, "")}/repos/${repository}/contents/${encodePath(path)}`;
  let mutationQueue = Promise.resolve();

  async function readRemote() {
    const response = await fetchImpl(`${contentUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (response.status === 404) return { state: emptyState(), sha: null };
    if (!response.ok) {
      throw new Error(`GitHub journal read failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const payload = await response.json();
    if (payload.type !== "file" || payload.encoding !== "base64") {
      throw new Error("GitHub journal path is not a base64 file");
    }
    const state = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
    if (state?.schema !== "mondayid.workless-github-journal.v1" || typeof state.jobs !== "object") {
      throw new Error("invalid GitHub Workless journal schema");
    }
    return { state, sha: payload.sha };
  }

  async function writeRemote(state, sha, message) {
    const body = {
      message,
      content: Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8").toString("base64"),
      branch,
    };
    if (sha) body.sha = sha;
    const response = await fetchImpl(contentUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error("GitHub journal write conflicted with a newer remote revision");
      error.code = "stale_remote_state";
      throw error;
    }
    if (!response.ok) {
      throw new Error(`GitHub journal write failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
  }

  async function mutate(label, mutator) {
    for (let attempt = 0; attempt <= maxConflictRetries; attempt += 1) {
      const { state, sha } = await readRemote();
      const working = clone(state);
      const result = await mutator(working);
      working.revision += 1;
      try {
        await writeRemote(working, sha, `workup journal: ${label} r${working.revision}`);
        return result;
      } catch (error) {
        if (error.code !== "stale_remote_state" || attempt === maxConflictRetries) throw error;
      }
    }
    throw new Error("unreachable GitHub journal retry state");
  }

  function enqueue(label, mutator) {
    const operation = mutationQueue.then(() => mutate(label, mutator));
    mutationQueue = operation.catch(() => {});
    return operation;
  }

  async function open(task) {
    return enqueue("open", (state) => {
      const jobId = `workless:${randomUUID()}`;
      state.jobs[jobId] = {
        jobId,
        status: "running",
        originalTask: clone(task),
        activeTask: clone(task),
        events: [],
        steering: [],
        result: null,
      };
      return jobId;
    });
  }

  async function append(jobId, event) {
    return enqueue("append", (state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.events.push({ index: job.events.length, ...clone(event) });
      return clone(job.events.at(-1));
    });
  }

  async function steer(jobId, update) {
    return enqueue("steer", (state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.steering.push({ index: job.steering.length, update: clone(update) });
      job.events.push({ index: job.events.length, phase: "steer", update: clone(update) });
      return clone(job.steering.at(-1));
    });
  }

  async function consumeSteering(jobId) {
    return enqueue("consume-steering", (state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      const updates = clone(job.steering);
      job.steering = [];
      return updates;
    });
  }

  async function setActiveTask(jobId, task) {
    return enqueue("set-active-task", (state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.activeTask = clone(task);
      return clone(job.activeTask);
    });
  }

  async function close(jobId, status, result) {
    return enqueue("close", (state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.status = status;
      job.result = clone(result);
      job.events.push({ index: job.events.length, phase: "close", status });
      return clone(job);
    });
  }

  async function read(jobId) {
    await mutationQueue;
    const { state } = await readRemote();
    const job = state.jobs[jobId];
    return job ? freeze(clone(job)) : null;
  }

  async function snapshot() {
    await mutationQueue;
    const { state } = await readRemote();
    return freeze(clone(state));
  }

  async function destroy() {
    await mutationQueue;
    const { sha } = await readRemote();
    if (!sha) return freeze({ status: "already_absent" });
    const response = await fetchImpl(contentUrl, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ message: "workup journal: remove live proof state", sha, branch }),
    });
    if (!response.ok) {
      throw new Error(`GitHub journal delete failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return freeze({ status: "deleted" });
  }

  return freeze({
    id: "workless.github-journal.v1",
    durable: true,
    remote: true,
    repository,
    branch,
    path,
    open,
    append,
    steer,
    consumeSteering,
    setActiveTask,
    close,
    read,
    snapshot,
    destroy,
  });
}
