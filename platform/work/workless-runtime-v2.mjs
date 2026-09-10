import { createHash } from "node:crypto";

const COMPUTE_FAILURES = new Set([
  "quota",
  "rate_limit",
  "capacity",
  "provider_unavailable",
  "provider_timeout",
]);

function freeze(value) {
  return Object.freeze(value);
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function requireFunction(object, name, label) {
  if (!object || typeof object[name] !== "function") {
    throw new TypeError(`${label} requires ${name}()`);
  }
}

function normalizeProvider(provider) {
  if (!provider?.id) throw new TypeError("compute provider requires id");
  return freeze({
    priority: 100,
    capabilities: [],
    kind: "model",
    ...provider,
    capabilities: freeze([...(provider.capabilities ?? [])]),
  });
}

export function createComputeRouter(providers, policy = {}) {
  const catalog = providers.map(normalizeProvider);
  if (catalog.length === 0) throw new TypeError("compute router requires at least one provider");
  if (new Set(catalog.map((provider) => provider.id)).size !== catalog.length) {
    throw new Error("compute provider ids must be unique");
  }

  const health = new Map(catalog.map((provider) => [provider.id, {
    state: "ready",
    failures: 0,
    lastFailure: null,
  }]));

  const effectivePolicy = freeze({
    preferKinds: ["deterministic", "local", "oss", "model"],
    ...policy,
  });

  function route({ requiredCapabilities = [], excluded = [] } = {}) {
    const excludedSet = new Set(excluded);
    const candidates = catalog
      .filter((provider) => !excludedSet.has(provider.id))
      .filter((provider) => health.get(provider.id)?.state !== "disabled")
      .filter((provider) => requiredCapabilities.every((capability) => provider.capabilities.includes(capability)))
      .sort((a, b) => {
        const ah = health.get(a.id);
        const bh = health.get(b.id);
        const kindA = effectivePolicy.preferKinds.indexOf(a.kind);
        const kindB = effectivePolicy.preferKinds.indexOf(b.kind);
        const normalizedKindA = kindA === -1 ? Number.MAX_SAFE_INTEGER : kindA;
        const normalizedKindB = kindB === -1 ? Number.MAX_SAFE_INTEGER : kindB;
        return (
          ah.failures - bh.failures ||
          a.priority - b.priority ||
          normalizedKindA - normalizedKindB ||
          a.id.localeCompare(b.id)
        );
      });

    if (candidates.length === 0) {
      return freeze({ status: "no_compute_route", requiredCapabilities, excluded: [...excludedSet] });
    }

    return freeze({ status: "routed", provider: candidates[0] });
  }

  function report(providerId, outcome) {
    if (!health.has(providerId)) throw new Error(`unknown compute provider: ${providerId}`);
    const prior = health.get(providerId);
    if (outcome?.ok) {
      health.set(providerId, { ...prior, state: "ready", lastFailure: null });
      return;
    }
    const code = outcome?.code ?? "unknown_failure";
    health.set(providerId, {
      state: COMPUTE_FAILURES.has(code) ? "degraded" : prior.state,
      failures: prior.failures + 1,
      lastFailure: code,
    });
  }

  function snapshot() {
    return freeze(Object.fromEntries([...health.entries()].map(([id, value]) => [id, freeze({ ...value })])));
  }

  return freeze({ route, report, snapshot, catalog: freeze(catalog), policy: effectivePolicy });
}

export function createMemoryWorkJournal() {
  const jobs = new Map();

  function open(task) {
    const jobId = `workless:${hash({ task, at: Date.now(), nonce: jobs.size })}`;
    jobs.set(jobId, {
      jobId,
      status: "running",
      originalTask: task,
      activeTask: task,
      events: [],
      steering: [],
      result: null,
    });
    return jobId;
  }

  function append(jobId, event) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown workless job: ${jobId}`);
    job.events.push(freeze({ index: job.events.length, ...event }));
  }

  function steer(jobId, update) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown workless job: ${jobId}`);
    job.steering.push(freeze({ index: job.steering.length, update }));
    append(jobId, { phase: "steer", update });
  }

  function consumeSteering(jobId) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown workless job: ${jobId}`);
    if (job.steering.length === 0) return [];
    const updates = [...job.steering];
    job.steering.length = 0;
    return updates;
  }

  function setActiveTask(jobId, task) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown workless job: ${jobId}`);
    job.activeTask = task;
  }

  function close(jobId, status, result) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`unknown workless job: ${jobId}`);
    job.status = status;
    job.result = result;
    append(jobId, { phase: "close", status });
  }

  function read(jobId) {
    const job = jobs.get(jobId);
    if (!job) return null;
    return freeze({
      ...job,
      events: freeze([...job.events]),
      steering: freeze([...job.steering]),
    });
  }

  return freeze({ open, append, steer, consumeSteering, setActiveTask, close, read });
}

function extractBlockerCode(result) {
  return (
    result?.final?.execution?.code ??
    result?.final?.execution?.result?.code ??
    result?.final?.verification?.code ??
    result?.blocker ??
    result?.final?.status ??
    result?.status ??
    "unknown_failure"
  );
}

function mergeSteering(task, updates) {
  if (updates.length === 0) return task;
  return freeze({
    ...(typeof task === "object" && task !== null ? task : { instruction: task }),
    steering: freeze([
      ...((typeof task === "object" && task?.steering) ? task.steering : []),
      ...updates.map((item) => item.update),
    ]),
  });
}

export function createWorklessRuntimeV2({
  workFactory,
  computeRouter,
  journal = createMemoryWorkJournal(),
  policy = {},
}) {
  requireFunction(workFactory, "create", "Workless workFactory");
  requireFunction(computeRouter, "route", "Workless computeRouter");
  requireFunction(computeRouter, "report", "Workless computeRouter");
  requireFunction(journal, "open", "Workless journal");
  requireFunction(journal, "append", "Workless journal");
  requireFunction(journal, "consumeSteering", "Workless journal");
  requireFunction(journal, "setActiveTask", "Workless journal");
  requireFunction(journal, "close", "Workless journal");

  const effectivePolicy = freeze({
    maxComputeReroutes: 4,
    maxPassesPerRoute: 8,
    requiredCapabilities: [],
    ...policy,
  });

  async function run(task, options = {}) {
    const jobId = options.jobId ?? await journal.open(task);
    let activeTask = task;
    const excluded = new Set();
    const routeAttempts = [];

    for (let routeIndex = 0; routeIndex <= effectivePolicy.maxComputeReroutes; routeIndex += 1) {
      const steering = await journal.consumeSteering(jobId);
      activeTask = mergeSteering(activeTask, steering);
      await journal.setActiveTask(jobId, activeTask);

      const routed = computeRouter.route({
        requiredCapabilities: effectivePolicy.requiredCapabilities,
        excluded: [...excluded],
      });

      if (routed.status !== "routed") {
        const result = freeze({
          status: "blocked",
          blocker: "no_compute_route",
          jobId,
          routeAttempts: freeze([...routeAttempts]),
          router: computeRouter.snapshot?.() ?? null,
        });
        await journal.close(jobId, "blocked", result);
        return result;
      }

      const provider = routed.provider;
      await journal.append(jobId, {
        phase: "compute_route",
        routeIndex,
        providerId: provider.id,
        providerKind: provider.kind,
      });

      const work = await workFactory.create({
        provider,
        jobId,
        routeIndex,
        journal,
      });
      requireFunction(work, "runUntilBlocker", `Workless provider ${provider.id}`);

      const workResult = await work.runUntilBlocker(activeTask, {
        maxPasses: effectivePolicy.maxPassesPerRoute,
      });

      routeAttempts.push(freeze({ providerId: provider.id, result: workResult }));

      if (workResult.status === "complete") {
        computeRouter.report(provider.id, { ok: true });
        const result = freeze({
          status: "complete",
          jobId,
          providerId: provider.id,
          routeAttempts: freeze([...routeAttempts]),
          final: workResult.final,
          router: computeRouter.snapshot?.() ?? null,
        });
        await journal.close(jobId, "complete", result);
        return result;
      }

      const blockerCode = extractBlockerCode(workResult);
      await journal.append(jobId, {
        phase: "route_result",
        routeIndex,
        providerId: provider.id,
        blockerCode,
      });

      if (!COMPUTE_FAILURES.has(blockerCode)) {
        computeRouter.report(provider.id, { ok: false, code: blockerCode });
        const result = freeze({
          status: "blocked",
          blocker: blockerCode,
          jobId,
          providerId: provider.id,
          routeAttempts: freeze([...routeAttempts]),
          final: workResult.final,
          router: computeRouter.snapshot?.() ?? null,
        });
        await journal.close(jobId, "blocked", result);
        return result;
      }

      computeRouter.report(provider.id, { ok: false, code: blockerCode });
      excluded.add(provider.id);
      await journal.append(jobId, {
        phase: "compute_reroute",
        fromProviderId: provider.id,
        reason: blockerCode,
      });
    }

    const result = freeze({
      status: "blocked",
      blocker: "compute_reroute_limit",
      jobId,
      routeAttempts: freeze([...routeAttempts]),
      router: computeRouter.snapshot?.() ?? null,
    });
    await journal.close(jobId, "blocked", result);
    return result;
  }

  return freeze({
    mode: "MONDAYID_WORKLESS_RUNTIME_V2",
    alias: "WorkUp",
    law: "quota failure reroutes compute; semantic failure changes the causal route; task state belongs to MondayID",
    policy: effectivePolicy,
    run,
    steer: journal.steer,
    readJob: journal.read,
    journal,
    computeRouter,
  });
}

export const WORKLESS_COMPUTE_FAILURES = freeze([...COMPUTE_FAILURES]);
