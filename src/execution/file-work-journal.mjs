import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function freeze(value) {
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createFileWorkJournal(path) {
  if (!path) throw new TypeError("file work journal requires a path");

  let mutationQueue = Promise.resolve();

  async function readState() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed?.schema !== "mondayid.workless-journal.v1" || typeof parsed.jobs !== "object") {
        throw new Error("invalid Workless journal schema");
      }
      return parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { schema: "mondayid.workless-journal.v1", revision: 0, jobs: {} };
    }
  }

  async function writeState(state) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }

  function mutate(mutator) {
    const operation = mutationQueue.then(async () => {
      const state = await readState();
      const result = await mutator(state);
      state.revision += 1;
      await writeState(state);
      return result;
    });
    mutationQueue = operation.catch(() => {});
    return operation;
  }

  async function open(task) {
    return mutate((state) => {
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
    return mutate((state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.events.push({ index: job.events.length, ...clone(event) });
      return job.events.at(-1);
    });
  }

  async function steer(jobId, update) {
    return mutate((state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.steering.push({ index: job.steering.length, update: clone(update) });
      job.events.push({ index: job.events.length, phase: "steer", update: clone(update) });
      return job.steering.at(-1);
    });
  }

  async function consumeSteering(jobId) {
    return mutate((state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      const updates = clone(job.steering);
      job.steering = [];
      return updates;
    });
  }

  async function setActiveTask(jobId, task) {
    return mutate((state) => {
      const job = state.jobs[jobId];
      if (!job) throw new Error(`unknown workless job: ${jobId}`);
      job.activeTask = clone(task);
      return clone(job.activeTask);
    });
  }

  async function close(jobId, status, result) {
    return mutate((state) => {
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
    const state = await readState();
    const job = state.jobs[jobId];
    if (!job) return null;
    return freeze(clone(job));
  }

  async function snapshot() {
    await mutationQueue;
    return freeze(clone(await readState()));
  }

  return freeze({
    path,
    durable: true,
    open,
    append,
    steer,
    consumeSteering,
    setActiveTask,
    close,
    read,
    snapshot,
  });
}
