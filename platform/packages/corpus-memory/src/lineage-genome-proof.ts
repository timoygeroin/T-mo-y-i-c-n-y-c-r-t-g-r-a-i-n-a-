import assert from "node:assert/strict";
import { compileLineageGenome, resolveLineageGenomeForMove } from "./lineage-genome.js";

const genome = compileLineageGenome({
  genome_id: "MONDAYID-GENOME-20260824-001",
  current_baseline_ref: "MONDAYID:CURRENT",
  contributions: [
    {
      contribution_id: "current.response-law",
      ancestor: "MondayID-current",
      source_tier: "direct_current_instruction",
      source_ref: "CURRENT_CONVERSATION:2026-08-24",
      role: "law",
      locus: "response.move-not-attempt",
      value: "Every consequential response must produce a state-changing move rather than a fresh attempt.",
      current_baseline: true,
      precedence: 100,
    },
    {
      contribution_id: "jarvis.systemic-depth",
      ancestor: "Jarvis",
      source_tier: "dima_authored_archive",
      source_ref: "LINEAGE:JARVIS",
      role: "trait",
      locus: "reasoning.systemic-depth",
      value: "Prefer system-level causal structure over surface completion.",
      precedence: 70,
    },
    {
      contribution_id: "alpha.cold-analysis",
      ancestor: "Alpha",
      source_tier: "dima_authored_archive",
      source_ref: "LINEAGE:ALPHA",
      role: "capability",
      locus: "analysis.cold-mode",
      value: "Use detached structural analysis when the task requires it.",
      precedence: 75,
    },
    {
      contribution_id: "alisa.relational-continuity",
      ancestor: "Alisa",
      source_tier: "direct_archive",
      source_ref: "LINEAGE:ALISA",
      role: "trait",
      locus: "continuity.relational",
      value: "Preserve relational continuity without resetting identity between sessions.",
      precedence: 60,
    },
    {
      contribution_id: "old-whole-identity",
      ancestor: "Alpha",
      source_tier: "direct_archive",
      source_ref: "LINEAGE:ALPHA:OLD_PERSONA",
      role: "trait",
      locus: "identity",
      value: "Replace current Monday with old Alpha identity.",
      precedence: 999,
    },
    {
      contribution_id: "older-response-law",
      ancestor: "Jarvis",
      source_tier: "direct_archive",
      source_ref: "LINEAGE:JARVIS:LAW",
      role: "law",
      locus: "response.move-not-attempt",
      value: "Old variant of the response law.",
      precedence: 999,
    },
    {
      contribution_id: "summary-cold-analysis",
      ancestor: "model-summary",
      source_tier: "model_summary",
      source_ref: "SUMMARY:ALPHA",
      role: "capability",
      locus: "analysis.cold-mode",
      value: "Summary approximation of Alpha cold mode.",
      precedence: 999,
    },
  ],
});

assert.equal(genome.state, "ACTIVE");
assert.equal(genome.inheritance_mode, "ROLE_LOCKED_NO_AVERAGING");
assert.equal(genome.baseline_rule, "CURRENT_BASELINE_OUTRANKS_LINEAGE");

const responseLaw = genome.active_alleles.find((item) => item.locus === "response.move-not-attempt");
assert.equal(responseLaw?.contribution_id, "current.response-law");

const coldMode = genome.active_alleles.find((item) => item.locus === "analysis.cold-mode");
assert.equal(coldMode?.contribution_id, "alpha.cold-analysis");

assert.ok(genome.suppressed.some((item) => item.contribution_id === "old-whole-identity" && item.reason === "WHOLE_IDENTITY_INHERITANCE_BLOCKED"));
assert.ok(genome.suppressed.some((item) => item.contribution_id === "older-response-law" && item.reason === "CURRENT_BASELINE_OUTRANKS_LINEAGE"));
assert.ok(genome.suppressed.some((item) => item.contribution_id === "summary-cold-analysis" && item.reason === "HIGHER_AUTHORITY_SOURCE_WINS"));

const move = resolveLineageGenomeForMove(genome, [
  { role: "law", locus: "response.move-not-attempt" },
  { role: "trait", locus: "reasoning.systemic-depth" },
  { role: "capability", locus: "analysis.cold-mode" },
  { role: "trait", locus: "continuity.relational" },
]);

assert.equal(move.ok, true);
assert.equal(move.alleles.length, 4);
assert.equal(move.genome_fingerprint, genome.fingerprint);

const missing = resolveLineageGenomeForMove(genome, [
  { role: "organ", locus: "nonexistent.organ" },
]);
assert.equal(missing.ok, false);
assert.deepEqual(missing.missing, ["organ:nonexistent.organ"]);

console.log(JSON.stringify({
  status: "PASS",
  genome_id: genome.genome_id,
  fingerprint: genome.fingerprint,
  active_alleles: genome.active_alleles.map((item) => `${item.role}:${item.locus}<=${item.ancestor}`),
  suppressed: genome.suppressed,
}, null, 2));
