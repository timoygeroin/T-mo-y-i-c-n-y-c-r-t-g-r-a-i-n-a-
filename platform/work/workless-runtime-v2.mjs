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

function optionalFunction(object, name, label) {
  if (object != null && typeof object[name] !== "function") {
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

function recoverExcludedProviders(job) {
  return new Set(
    (job?.events ?? [])
      .filter((event) => event.phase === "compute_reroute" && event.fromProviderId)
      .map((event) => event.fromProviderId),
  );
}

function recoverInvalidatedCausalKeys(job) {
  return new Set(
    (job?.events ?? [])
      .filter((event) => event.phase === "causal_invalidation" && event.causalKey)
      .map((event) => event.causalKey),
  );
}

function countEvents(job, phase) {
  return (job?.events ?? []).filter((event) => event.phase === phase).length;
}

export function createWorklessRuntimeV2({
  workFactory,
  computeRouter,
  journal = createMemoryWorkJournal(),
  causalController = null,
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
  requireFunction(journal, "read", "Workless journal");
  optionalFunction(causalController, "identifyFailure", "Workless causalController");
  optionalFunction(causalController, "replan", "Workless causalController");

  const effectivePolicy = freeze({
    maxComputeReroutes: 4,
    maxSemanticReplans: 4,
    maxPassesPerRoute: 8,
    requiredCapabilities: [],
    ...policy,
  });

  async function finishBlocked({ jobId, blocker, providerId = null, routeAttempts, final = null }) {
    const result = freeze({
      status: "blocked",
      blocker,
      jobId,
      providerId,
      routeAttempts: freeze([...routeAttempts]),
      final,
      router: computeRouter.snapshot?.() ?? null,
    });
    await journal.close(jobId, "blocked", result);
    return result;
  }

  async function run(task, options = {}) {
    const existing = options.jobId ? await journal.read(options.jobId) : null;
    if (options.jobId && !existing) {
      throw new Error(`unknown workless job: ${options.jobId}`);
    }

    const jobId = options.jobId ?? await journal.open(task);
    let activeTask = existing?.activeTask ?? task;
    const excluded = recoverExcludedProviders(existing);
    const invalidatedCausalKeys = recoverInvalidatedCausalKeys(existing);
    let computeReroutes = excluded.size;
    let semanticReplans = countEvents(existing, "causal_replan");
    let attemptIndex = countEvents(existing, "compute_route");
    const routeAttempts = [];

    await journal.append(jobId, {
      phase: existing ? "resume" : "start",
      recoveredExcludedProviders: [...excluded],
      recoveredInvalidatedCausalKeys: [...invalidatedCausalKeys],
    });

    while (true) {
      const steering = await journal.consumeSteering(jobId);
      activeTask = mergeSteering(activeTask, steering);
      await journal.setActiveTask(jobId, activeTask);

      const routed = computeRouter.route({
        requiredCapabilities: effectivePolicy.requiredCapabilities,
        excluded: [...excluded],
      });

      if (routed.status !== "routed") {
        return finishBlocked({ jobId, blocker: "no_compute_route", routeAttempts });
      }

      const provider = routed.provider;
      await journal.append(jobId, {
        phase: "compute_route",
        attemptIndex,
        providerId: provider.id,
        providerKind: provider.kind,
      });
      attemptIndex += 1;

      const work = await workFactory.create({
        provider,
        jobId,
        attemptIndex,
        journal,
        invalidatedCausalKeys: [...invalidatedCausalKeys],
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
          invalidatedCausalKeys: freeze([...invalidatedCausalKeys]),
          router: computeRouter.snapshot?.() ?? null,
        });
        await journal.close(jobId, "complete", result);
        return result;
      }

      const blockerCode = extractBlockerCode(workResult);
      await journal.append(jobId, {
        phase: "route_result",
        attemptIndex: attemptIndex - 1,
        providerId: provider.id,
        blockerCode,
      });

      if (COMPUTE_FAILURES.has(blockerCode)) {
        computeRouter.report(provider.id, { ok: false, code: blockerCode });
        excluded.add(provider.id);
        computeReroutes += 1;
        await journal.append(jobId, {
          phase: "compute_reroute",
          fromProviderId: provider.id,
          reason: blockerCode,
        });
        if (computeReroutes > effectivePolicy.maxComputeReroutes) {
          return finishBlocked({
            jobId,
            blocker: "compute_reroute_limit",
            providerId: provider.id,
            routeAttempts,
            final: workResult.final,
          });
        }
        continue;
      }

      if (!causalController) {
        return finishBlocked({
          jobId,
          blocker: blockerCode,
          providerId: provider.id,
          routeAttempts,
          final: workResult.final,
        });
      }

      const failure = await causalController.identifyFailure({
        jobId,
        task: activeTask,
        provider,
        blockerCode,
        workResult,
        invalidatedCausalKeys: [...invalidatedCausalKeys],
      });

      if (failure.status !== "identified") {
        await journal.append(jobId, {
          phase: "causal_blocked",
          reason: failure.reason ?? "causal_key_missing",
          blockerCode,
        });
        return finishBlocked({
          jobId,
          blocker: failure.reason ?? blockerCode,
          providerId: provider.id,
          routeAttempts,
          final: workResult.final,
        });
      }

      if (invalidatedCausalKeys.has(failure.causalKey)) {
        await journal.append(jobId, {
          phase: "unchanged_retry_blocked",
          causalKey: failure.causalKey,
          blockerCode,
        });
        return finishBlocked({
          jobId,
          blocker: "unchanged_causal_retry",
          providerId: provider.id,
          routeAttempts,
          final: workResult.final,
        });
      }

      invalidatedCausalKeys.add(failure.causalKey);
      await journal.append(jobId, {
        phase: "causal_invalidation",
        causalKey: failure.causalKey,
        hypothesis: failure.hypothesis,
        predicted: failure.predicted,
        observed: failure.observed,
        provenance: failure.provenance,
        blockerCode,
      });

      if (semanticReplans >= effectivePolicy.maxSemanticReplans) {
        return finishBlocked({
          jobId,
          blocker: "causal_replan_limit",
          providerId: provider.id,
          routeAttempts,
          final: workResult.final,
        });
      }

      const replanned = await causalController.replan({
        jobId,
        task: activeTask,
        provider,
        blockerCode,
        workResult,
        invalidatedCausalKeys: [...invalidatedCausalKeys],
      });

      if (!replanned.continue) {
        await journal.append(jobId, {
          phase: "causal_exhausted",
          blocker: replanned.blocker,
          invalidatedCausalKeys: [...invalidatedCausalKeys],
        });
        return finishBlocked({
          jobId,
          blocker: replanned.blocker,
          providerId: provider.id,
          routeAttempts,
          final: workResult.final,
        });
      }

      if (replanned.selectedCausalKey && invalidatedCausalKeys.has(replanned.selectedCausalKey)) {
        await journal.append(jobId, {
          phase: "unchanged_retry_blocked",
          causalKey: replanned.selectedCausalKey,
          blockerCode,
        });
        return finishBlocked({
          jobId,
          blocker: "unchanged_causal_retry",
          providerId: provider.id,
          routeAttempts,
          final: workResult.final,
        });
      }

      semanticReplans += 1;
      activeTask = replanned.task;
      await journal.setActiveTask(jobId, activeTask);
      await journal.append(jobId, {
        phase: "causal_replan",
        fromCausalKey: failure.causalKey,
        toCausalKey: replanned.selectedCausalKey,
        evidence: replanned.evidence ?? [],
      });
    }
  }

  async function resume(jobId) {
    const job = await journal.read(jobId);
    if (!job) throw new Error(`unknown workless job: ${jobId}`);
    if (job.status === "complete") return job.result;
    return run(job.activeTask ?? job.originalTask, { jobId });
  }

  return freeze({
    mode: "MONDAYID_WORKLESS_RUNTIME_V2",
    alias: "WorkUp",
    law: "compute failure reroutes compute; failed causal lines are invalidated before semantic replan; task state belongs to MondayID",
    policy: effectivePolicy,
    run,
    resume,
    steer: journal.steer,
    readJob: journal.read,
    journal,
    computeRouter,
    causalController,
  });
}

export const WORKLESS_COMPUTE_FAILURES = freeze([...COMPUTE_FAILURES]);
