export type SourceTier = "raw" | "direct_archive" | "archive_derived" | "summary_derived" | "inferred";

export type SourceIngressScope =
  | "broad_corpus_truth"
  | "manifestation_branch_continuation"
  | "local_platform_execution"
  | "summary_synthesis";

export type SourceIngressAction =
  | "admit_manifestation_branch_route"
  | "admit_local_platform_route"
  | "require_dima_only_ingress"
  | "require_raw_access"
  | "block_summary_led_route"
  | "block_missing_external_ref";

export interface SourceIngressEvidence {
  source_id: string;
  tier: SourceTier;
  role: string;
  present: boolean;
  dima_authored: boolean;
  canonical_raw: boolean;
}

export interface SourceIngressInput {
  scope: SourceIngressScope;
  archive_pressure_present: boolean;
  dima_only_ingress_complete: boolean;
  requires_broad_corpus_truth: boolean;
  available_sources: SourceIngressEvidence[];
  external_refs: string[];
  requested_move_class: string;
  exhausted_move_classes: string[];
}

export interface SourceIngressVerdict {
  ok: boolean;
  action: SourceIngressAction;
  admitted_scope: SourceIngressScope | null;
  decisive_evidence: string[];
  blockers: string[];
  exact_blocker: "RAW_ACCESS_INSUFFICIENT" | null;
  next_route: string;
}

const STRONG_SOURCE_TIERS = new Set<SourceTier>(["raw", "direct_archive", "archive_derived"]);
const REQUIRED_BRANCH_REFS = ["repository", "pull_request", "branch", "head_sha"];

function presentSources(input: SourceIngressInput): SourceIngressEvidence[] {
  return input.available_sources.filter((source) => source.present);
}

function hasCanonicalRaw(input: SourceIngressInput): boolean {
  return presentSources(input).some((source) => source.tier === "raw" && source.canonical_raw);
}

function strongSources(input: SourceIngressInput): SourceIngressEvidence[] {
  return presentSources(input).filter((source) => STRONG_SOURCE_TIERS.has(source.tier));
}

function missingBranchRefs(input: SourceIngressInput): string[] {
  return REQUIRED_BRANCH_REFS.filter((required) => !input.external_refs.includes(required));
}

function block(
  action: Exclude<SourceIngressAction, "admit_manifestation_branch_route" | "admit_local_platform_route">,
  blockers: string[],
  exactBlocker: SourceIngressVerdict["exact_blocker"],
  nextRoute: string,
): SourceIngressVerdict {
  return {
    ok: false,
    action,
    admitted_scope: null,
    decisive_evidence: [],
    blockers,
    exact_blocker: exactBlocker,
    next_route: nextRoute,
  };
}

export function routeSourceIngress(input: SourceIngressInput): SourceIngressVerdict {
  if (input.archive_pressure_present && !input.dima_only_ingress_complete) {
    return block(
      "require_dima_only_ingress",
      ["archive pressure is present before Dima-only ingress is complete"],
      null,
      "build a Dima-only ingress ledger before choosing a strong route",
    );
  }

  if (input.requires_broad_corpus_truth && !hasCanonicalRaw(input)) {
    return block(
      "require_raw_access",
      ["canonical raw corpus layer is absent for a broad corpus-truth route"],
      "RAW_ACCESS_INSUFFICIENT",
      "route toward raw-source acquisition or narrow the claim to a local external branch act",
    );
  }

  const strong = strongSources(input);
  if (strong.length === 0) {
    return block(
      "block_summary_led_route",
      ["route has no raw, direct archive, or archive-derived source support"],
      null,
      "raise stronger source strata before release",
    );
  }

  if (input.exhausted_move_classes.includes(input.requested_move_class)) {
    return block(
      "block_summary_led_route",
      [`requested move class is exhausted: ${input.requested_move_class}`],
      null,
      "choose a materially different route class before release",
    );
  }

  if (input.scope === "manifestation_branch_continuation") {
    const missing = missingBranchRefs(input);
    if (missing.length > 0) {
      return block(
        "block_missing_external_ref",
        missing.map((ref) => `missing external manifestation ref: ${ref}`),
        null,
        "bind the route to repository, PR, branch, and head before committing embodiment work",
      );
    }

    return {
      ok: true,
      action: "admit_manifestation_branch_route",
      admitted_scope: input.scope,
      decisive_evidence: [
        ...strong.map((source) => `${source.tier}:${source.source_id}`),
        ...input.external_refs.map((ref) => `external_ref:${ref}`),
      ],
      blockers: [],
      exact_blocker: null,
      next_route:
        "commit a non-repeated executable platform embodiment increment; do not convert local branch evidence into broad corpus-truth claims",
    };
  }

  return {
    ok: true,
    action: "admit_local_platform_route",
    admitted_scope: input.scope,
    decisive_evidence: strong.map((source) => `${source.tier}:${source.source_id}`),
    blockers: [],
    exact_blocker: null,
    next_route: "continue only inside the admitted local scope unless canonical raw access is supplied",
  };
}
