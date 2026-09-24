function freeze(value) {
  return Object.freeze(value);
}

function requireFunction(object, name) {
  if (!object || typeof object[name] !== "function") {
    throw new TypeError(`causal controller requires ${name}()`);
  }
}

export function createCausalTaskController({ identifyFailure, replan }) {
  requireFunction({ identifyFailure }, "identifyFailure");
  requireFunction({ replan }, "replan");

  return freeze({
    async identifyFailure(context) {
      const result = await identifyFailure(context);
      if (!result?.causalKey) {
        return freeze({ status: "unidentified", reason: result?.reason ?? "causal_key_missing" });
      }
      return freeze({
        status: "identified",
        causalKey: String(result.causalKey),
        hypothesis: result.hypothesis ?? null,
        predicted: result.predicted,
        observed: result.observed,
        provenance: result.provenance ?? "workless-runtime",
      });
    },

    async replan(context) {
      const result = await replan(context);
      if (!result?.continue) {
        return freeze({
          continue: false,
          blocker: result?.blocker ?? "no_viable_causal_route",
          evidence: result?.evidence ?? [],
        });
      }
      if (result.task == null) {
        throw new TypeError("causal replan returned continue=true without task");
      }
      return freeze({
        continue: true,
        task: result.task,
        selectedCausalKey: result.selectedCausalKey ?? null,
        evidence: result.evidence ?? [],
      });
    },
  });
}

export function createTaskCandidateCausalController() {
  return createCausalTaskController({
    identifyFailure({ task, workResult }) {
      const verification = workResult?.final?.verification ?? {};
      const causalKey = verification.causalKey ?? task?.causalKey ?? null;
      if (!causalKey) return { reason: "causal_key_missing" };
      return {
        causalKey,
        hypothesis: verification.hypothesis ?? task?.hypothesis ?? null,
        predicted: verification.predicted,
        observed: verification.observed,
        provenance: verification.provenance ?? "verification",
      };
    },

    replan({ task, invalidatedCausalKeys }) {
      const candidates = Array.isArray(task?.causalCandidates) ? task.causalCandidates : [];
      const invalid = new Set(invalidatedCausalKeys);
      const next = candidates.find((candidate) => candidate?.causalKey && !invalid.has(candidate.causalKey));
      if (!next) {
        return { continue: false, blocker: "no_viable_causal_route" };
      }
      return {
        continue: true,
        selectedCausalKey: next.causalKey,
        task: freeze({
          ...task,
          causalKey: next.causalKey,
          hypothesis: next.hypothesis ?? null,
          instruction: next.instruction ?? task.instruction,
        }),
      };
    },
  });
}
