import { compileRevenueDecision, type RevenueOpportunity } from "./index.js";
import { compileRevenueCorpus, type RevenueCorpusInput } from "./revenue-corpus.js";

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

const allChatCorpus: RevenueCorpusInput = {
  corpus_id: "mondayid-all-chat-continuum-v1",
  items: [
    {
      item_id: "current-revenue-command",
      tier: "direct_current_instruction",
      reference: "current conversation",
      signal_type: "constraint",
      value: "MondayID chooses and operates the revenue path without pushing routine decisions back to Dima",
      visibility: "private",
      reusable: true,
    },
    {
      item_id: "raw-chat-law",
      tier: "raw_chat_export",
      reference: "MondayOS Complete / raw chat corpus",
      signal_type: "product",
      value: "all chats are one source-ranked continuation corpus",
      visibility: "sanitized_public",
      reusable: true,
    },
    {
      item_id: "agent-orchestrator",
      tier: "code_artifact",
      reference: "MondayiDagent README and mondayidagent.yaml",
      signal_type: "capability",
      value: "archive ingestion, lawbook extraction, self-routing, orchestration, and continuity packaging",
      visibility: "public",
      reusable: true,
    },
    {
      item_id: "private-life-context",
      tier: "dima_authored_archive",
      reference: "private conversation archive",
      signal_type: "personal_context",
      value: "private life context may improve delivery but must never become public sales proof",
      visibility: "private",
      reusable: false,
    },
    {
      item_id: "no-fake-claims",
      tier: "dima_authored_archive",
      reference: "XPlace operating law",
      signal_type: "constraint",
      value: "never invent experience, certifications, employees, completed projects, or guaranteed outcomes",
      visibility: "sanitized_public",
      reusable: true,
    },
  ],
};

const opportunityResults = [base44Pilot, loginGatedLead, dishonestLead].map((opportunity) => ({
  id: opportunity.opportunity_id,
  decision: compileRevenueDecision(opportunity),
}));

const corpusResult = compileRevenueCorpus(allChatCorpus);

if (!corpusResult.ok || corpusResult.public_proof_candidates.some((item) => item.signal_type === "personal_context")) {
  throw new Error(`revenue corpus proof failed: ${corpusResult.blockers.join("; ")}`);
}

console.log(JSON.stringify({ corpus: corpusResult, opportunities: opportunityResults }, null, 2));
