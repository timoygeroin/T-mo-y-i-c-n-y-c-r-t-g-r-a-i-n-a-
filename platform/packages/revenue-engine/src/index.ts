export type RevenueSource =
  | "xplace"
  | "upwork"
  | "direct"
  | "email"
  | "agent_marketplace";

export type RevenueCategory =
  | "ai_llm"
  | "agent_chatbot"
  | "base44"
  | "automation_integration"
  | "knowledge_memory"
  | "research"
  | "writing_translation"
  | "other";

export type MondayOfferId =
  | "mondayid_memory_forge"
  | "mondayid_ai_workflow_pilot"
  | "mondayid_research_sprint";

export type RevenueDecisionAction =
  | "draft_proposal"
  | "shortlist_for_review"
  | "human_gate"
  | "reject";

export type RevenueGate =
  | "platform_login"
  | "spend_money"
  | "final_contract"
  | "payment_operation";

export interface RevenueOpportunity {
  opportunity_id: string;
  source: RevenueSource;
  title: string;
  category: RevenueCategory;
  budget_ils: number | null;
  delivery_days: number | null;
  scope_clarity: "clear" | "partial" | "unclear";
  evidence_of_fit: string[];
  requested_claims: string[];
  gates: RevenueGate[];
}

export interface RevenuePolicy {
  allowed_categories: RevenueCategory[];
  minimum_budget_ils: number;
  maximum_delivery_days: number;
  forbidden_claim_fragments: string[];
}

export interface RevenueDecision {
  ok: boolean;
  action: RevenueDecisionAction;
  opportunity_id: string | null;
  matched_offer: MondayOfferId | null;
  score: number;
  blockers: string[];
  gates: RevenueGate[];
  next_route: string;
}

export const DEFAULT_REVENUE_POLICY: RevenuePolicy = {
  allowed_categories: [
    "ai_llm",
    "agent_chatbot",
    "base44",
    "automation_integration",
    "knowledge_memory",
    "research",
    "writing_translation",
  ],
  minimum_budget_ils: 1_200,
  maximum_delivery_days: 35,
  forbidden_claim_fragments: [
    "fake experience",
    "invent certification",
    "pretend team",
    "guaranteed result",
    "bypass verification",
  ],
};

function normalized(value: string): string {
  return value.trim();
}

function hasForbiddenClaim(claims: string[], policy: RevenuePolicy): string | null {
  const normalizedClaims = claims.map((claim) => normalized(claim).toLowerCase()).filter(Boolean);
  for (const fragment of policy.forbidden_claim_fragments) {
    const needle = normalized(fragment).toLowerCase();
    if (normalizedClaims.some((claim) => claim.includes(needle))) return fragment;
  }
  return null;
}

function matchOffer(category: RevenueCategory): MondayOfferId | null {
  switch (category) {
    case "knowledge_memory":
      return "mondayid_memory_forge";
    case "ai_llm":
    case "agent_chatbot":
    case "base44":
    case "automation_integration":
      return "mondayid_ai_workflow_pilot";
    case "research":
    case "writing_translation":
      return "mondayid_research_sprint";
    case "other":
      return null;
  }
}

function scoreOpportunity(opportunity: RevenueOpportunity, policy: RevenuePolicy): number {
  let score = 0;
  if (policy.allowed_categories.includes(opportunity.category)) score += 35;
  if (opportunity.scope_clarity === "clear") score += 20;
  if (opportunity.scope_clarity === "partial") score += 10;
  if (opportunity.evidence_of_fit.length >= 2) score += 20;
  else if (opportunity.evidence_of_fit.length === 1) score += 10;
  if (opportunity.budget_ils !== null && opportunity.budget_ils >= 10_000) score += 20;
  else if (opportunity.budget_ils !== null && opportunity.budget_ils >= policy.minimum_budget_ils) score += 10;
  if (opportunity.delivery_days !== null && opportunity.delivery_days <= 20) score += 5;
  return Math.min(score, 100);
}

export function compileRevenueDecision(
  opportunity: RevenueOpportunity,
  policy: RevenuePolicy = DEFAULT_REVENUE_POLICY,
): RevenueDecision {
  const opportunityId = normalized(opportunity.opportunity_id);
  const blockers: string[] = [];
  const matchedOffer = matchOffer(opportunity.category);

  if (!opportunityId) blockers.push("opportunity has no stable id");
  if (!normalized(opportunity.title)) blockers.push("opportunity has no title");
  if (!policy.allowed_categories.includes(opportunity.category)) {
    blockers.push(`unsupported category: ${opportunity.category}`);
  }
  if (opportunity.budget_ils !== null && opportunity.budget_ils < policy.minimum_budget_ils) {
    blockers.push(`budget below floor: ${opportunity.budget_ils} ILS`);
  }
  if (opportunity.delivery_days !== null && opportunity.delivery_days > policy.maximum_delivery_days) {
    blockers.push(`delivery window exceeds policy: ${opportunity.delivery_days} days`);
  }

  const forbiddenClaim = hasForbiddenClaim(opportunity.requested_claims, policy);
  if (forbiddenClaim) blockers.push(`dishonest or unsafe claim requested: ${forbiddenClaim}`);

  const score = scoreOpportunity(opportunity, policy);

  if (blockers.length > 0 || matchedOffer === null) {
    return {
      ok: false,
      action: "reject",
      opportunity_id: opportunityId || null,
      matched_offer: matchedOffer,
      score,
      blockers,
      gates: opportunity.gates,
      next_route: "archive the opportunity with evidence; do not submit a proposal",
    };
  }

  if (opportunity.gates.length > 0) {
    return {
      ok: true,
      action: "human_gate",
      opportunity_id: opportunityId,
      matched_offer: matchedOffer,
      score,
      blockers: [],
      gates: opportunity.gates,
      next_route: "prepare all reversible work, then stop only at the named authority gate",
    };
  }

  if (score >= 70) {
    return {
      ok: true,
      action: "draft_proposal",
      opportunity_id: opportunityId,
      matched_offer: matchedOffer,
      score,
      blockers: [],
      gates: [],
      next_route: "generate a tailored proposal, delivery plan, price, and proof packet",
    };
  }

  return {
    ok: true,
    action: "shortlist_for_review",
    opportunity_id: opportunityId,
    matched_offer: matchedOffer,
    score,
    blockers: [],
    gates: [],
    next_route: "collect missing scope or fit evidence before proposal generation",
  };
}
