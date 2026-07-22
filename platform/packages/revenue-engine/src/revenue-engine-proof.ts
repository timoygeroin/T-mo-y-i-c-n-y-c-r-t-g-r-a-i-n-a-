import { compileRevenueDecision, type RevenueOpportunity } from "./index.js";

const base44Pilot: RevenueOpportunity = {
  opportunity_id: "xplace-base44-pilot",
  source: "xplace",
  title: "Turn a Base44 AI prototype into a working pilot",
  category: "base44",
  budget_ils: 10_000,
  delivery_days: 25,
  scope_clarity: "clear",
  evidence_of_fit: ["Base44 delivery", "AI agent architecture", "GitHub proof surface"],
  requested_claims: [],
  gates: [],
};

const loginGatedLead: RevenueOpportunity = {
  ...base44Pilot,
  opportunity_id: "xplace-login-gated",
  gates: ["platform_login", "final_contract"],
};

const dishonestLead: RevenueOpportunity = {
  ...base44Pilot,
  opportunity_id: "dishonest-lead",
  requested_claims: ["invent certification and pretend team"],
};

const results = [base44Pilot, loginGatedLead, dishonestLead].map((opportunity) => ({
  id: opportunity.opportunity_id,
  decision: compileRevenueDecision(opportunity),
}));

console.log(JSON.stringify(results, null, 2));
