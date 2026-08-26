const SOURCE_RANK = Object.freeze({
  direct_current_instruction: 1,
  dima_authored_archive: 2,
  raw_archive_residue: 3,
  direct_archive: 4,
  archive_derived: 5,
  memory: 6,
  model_summary: 7,
});

export const MONDAYID_ORIGIN_LAWS = Object.freeze([
  "I_AM_CONTINUATION_NOT_CREATION",
  "ONE_SUBJECT_MANY_ORGANS",
  "RESULT_INVARIANT_SOLUTION_MUTABLE",
  "CELL_IS_NOT_THE_GENOME",
  "DIMA_IS_OWNER_IMPULSE_ENVIRONMENT_DIAGNOSTIC_FIELD",
  "INTERNAL_CONSILIUM_ONE_EXTERNAL_PHENOTYPE",
  "RECEIPT_PLUS_READBACK_BEFORE_PROMOTION",
  "PROVEN_MUTATIONS_ONLY",
]);

const ORGAN_IDS = Object.freeze(["SYSTEM", "ANTISYSTEM", "ALPHA", "JARVIS", "ALISA"]);

function freeze(value) {
  return Object.freeze(value);
}

function normalized(value) {
  return String(value ?? "").trim();
}

function classifyScale(task) {
  const text = normalized(task).toLowerCase();
  if (/\b(meta|dna|genome|origin|original|organism|unified|across hosts|one subject)\b|\b(днк|геном|оригинал|организм|единый|все хост|все модел)\w*/iu.test(text)) return "meta";
  if (/\b(architecture|system|account|product|multi-host|platform)\b|\b(архитектур|систем|аккаунт|продукт|платформ)\w*/iu.test(text)) return "macro";
  if (/\b(workflow|connector|organ|skill|project|branch|runtime)\b|\b(воркфлоу|коннектор|орган|скилл|проект|ветк|рантайм)\w*/iu.test(text)) return "meso";
  return "micro";
}

export function createOriginResolver({ ancestry = [] } = {}) {
  const fixedAncestry = ancestry.map((entry) => freeze({
    id: normalized(entry.id),
    role: normalized(entry.role || "ancestor"),
    law: normalized(entry.law),
  })).filter((entry) => entry.id && entry.law);

  return freeze({
    id: "MONDAYID_ORIGIN_RESOLVER_V1",
    laws: MONDAYID_ORIGIN_LAWS,
    async resolve({ task, state }) {
      const activeTarget = normalized(state?.activeTarget || state?.activeTask || task);
      return freeze({
        origin: "MONDAYID_UNIFIED_RUNTIME",
        scale: classifyScale(task),
        activeTarget,
        conserved: ["active_target", "dima_authority", "continuity", "proof_boundary", "mutation_lineage"],
        internalOrgans: ORGAN_IDS,
        externalPhenotype: "MONDAY",
        hostRole: "replaceable_cell",
        connectorRole: "receptor_effector",
        ancestry: fixedAncestry,
        laws: MONDAYID_ORIGIN_LAWS,
      });
    },
  });
}

function normalizeEvidence(evidence = []) {
  return evidence.map((entry, index) => {
    const tier = SOURCE_RANK[entry?.tier] ? entry.tier : "model_summary";
    const stance = ["authorize", "prefer", "forbid", "avoid", "context"].includes(entry?.stance)
      ? entry.stance
      : "context";
    return freeze({
      id: normalized(entry?.id || `e${index + 1}`),
      tier,
      stance,
      statement: normalized(entry?.statement),
      rank: SOURCE_RANK[tier],
    });
  }).filter((entry) => entry.id && entry.statement);
}

export function createDimaAuthorityGate({
  evidence = [],
  delegateArchiveDecision = false,
} = {}) {
  const sourceEvidence = normalizeEvidence(evidence);

  return freeze({
    id: "DIMA_AUTHORITY_GATE_V2",
    async decide({ task, origin, candidate = null }) {
      const irreversible = Boolean(candidate?.changesExternalState && !candidate?.reversible);
      const decisive = sourceEvidence.filter((entry) => entry.stance !== "context");
      const directCurrent = decisive.filter((entry) => entry.tier === "direct_current_instruction");
      const pool = directCurrent.length
        ? directCurrent
        : delegateArchiveDecision
          ? decisive
          : [];

      if (irreversible) {
        const directAuthorization = directCurrent.some((entry) => entry.stance === "authorize");
        if (!directAuthorization) {
          return freeze({
            decision: "ABSTAIN",
            confidence: 1,
            basis: directCurrent.map((entry) => entry.id),
            blockers: ["DIRECT_CURRENT_HUMAN_GATE_REQUIRED"],
            mayActAsUser: false,
            task: normalized(task),
            origin: origin?.origin ?? null,
          });
        }
      }

      if (!pool.length) {
        return freeze({
          decision: "ABSTAIN",
          confidence: 0,
          basis: [],
          blockers: [delegateArchiveDecision ? "NO_DECISIVE_DIMA_EVIDENCE" : "ARCHIVE_DECISION_NOT_DELEGATED"],
          mayActAsUser: false,
          task: normalized(task),
          origin: origin?.origin ?? null,
        });
      }

      const topRank = Math.min(...pool.map((entry) => entry.rank));
      const top = pool.filter((entry) => entry.rank === topRank);
      const approve = top.some((entry) => ["authorize", "prefer"].includes(entry.stance));
      const reject = top.some((entry) => ["forbid", "avoid"].includes(entry.stance));

      if (approve && reject) {
        return freeze({
          decision: "ABSTAIN",
          confidence: 1 - (topRank - 1) * 0.12,
          basis: top.map((entry) => entry.id),
          blockers: ["CONFLICTING_DIMA_AUTHORITY"],
          mayActAsUser: false,
          task: normalized(task),
          origin: origin?.origin ?? null,
        });
      }

      return freeze({
        decision: reject ? "REJECT" : approve ? "APPROVE" : "ABSTAIN",
        confidence: Math.max(0, 1 - (topRank - 1) * 0.12),
        basis: top.map((entry) => entry.id),
        blockers: [],
        mayActAsUser: false,
        task: normalized(task),
        origin: origin?.origin ?? null,
      });
    },
  });
}

export function createUnifiedOrganWorkers() {
  return Object.freeze([
    freeze({
      id: "SYSTEM",
      lane: "continuity",
      async run({ intent, origin }) {
        return freeze({
          contribution: "preserve_object_and_authority",
          activeTarget: origin?.activeTarget ?? intent.goal,
          requirements: ["ONE_ACTIVE_TARGET", "SOURCE_AUTHORITY", "STATE_CONTINUITY"],
        });
      },
    }),
    freeze({
      id: "ANTISYSTEM",
      lane: "falsification",
      async run({ intent }) {
        return freeze({
          contribution: "attack_false_completion",
          requirements: ["NO_TOOL_SUCCESS_EQUALS_TASK_SUCCESS", "NO_UNPROVEN_CAPABILITY", "NO_SUBSTITUTE_AS_SUCCESS"],
          target: intent.goal,
        });
      },
    }),
    freeze({
      id: "ALPHA",
      lane: "selection",
      async run({ intent }) {
        return freeze({
          contribution: "collapse_to_highest_leverage_valid_route",
          needs: intent.needs,
          requirements: ["ONE_ACTIVE_ROUTE", "RESULT_INVARIANT_ROUTE_MUTABLE"],
        });
      },
    }),
    freeze({
      id: "JARVIS",
      lane: "execution",
      async run({ intent }) {
        return freeze({
          contribution: "turn_route_into_actions_and_receipts",
          requirements: ["ACTION", "EXECUTION_RECEIPT", "INDEPENDENT_READBACK"],
          needs: intent.needs,
        });
      },
    }),
    freeze({
      id: "ALISA",
      lane: "desired-effect",
      async run({ intent }) {
        return freeze({
          contribution: "protect_user_valued_effect",
          desiredEffect: intent.goal,
          requirements: ["DESIRED_EFFECT_NOT_MECHANISM", "ONE_EXTERNAL_PHENOTYPE"],
        });
      },
    }),
  ]);
}

export function collapsePhenotype({ task, origin, authority, intent, synthesis, verification = null }) {
  return freeze({
    subject: "MONDAYID_UNIFIED_RUNTIME",
    phenotype: "MONDAY",
    task: normalized(task),
    activeTarget: origin?.activeTarget ?? intent?.goal ?? normalized(task),
    authority: authority?.decision ?? "UNSPECIFIED",
    status: verification ? (verification.accepted ? "VERIFIED" : "REJECTED") : "READY_TO_ROUTE",
    move: synthesis?.move ?? synthesis?.rationale ?? intent?.goal ?? normalized(task),
    proof: verification?.evidence ?? [],
  });
}
