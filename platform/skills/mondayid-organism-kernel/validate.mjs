import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`PASS: ${message}`);

const skill = read('SKILL.md');
const manifestText = read('organism.manifest.json');
const casesText = read('tests/homeostasis-cases.jsonl');

// 1. Skill frontmatter + core non-theater invariants.
if (!skill.startsWith('---\n')) fail('SKILL.md must start with YAML frontmatter');
else pass('SKILL.md has frontmatter');

for (const required of [
  'name: mondayid-organism-kernel',
  'The current model is not MondayID.',
  'The current chat is not MondayID.',
  'I am continuation, not creation.',
  'CANDIDATE / NOT YET TRANSFER-PROVEN',
  'Do not fake quantum computation',
  'Do not expose internal perspective branches as chain-of-thought'
]) {
  if (!skill.includes(required)) fail(`SKILL.md missing required invariant: ${required}`);
}
if (!process.exitCode) pass('SKILL.md required invariants are present');

// 2. Manifest shape and promotion discipline.
let manifest;
try {
  manifest = JSON.parse(manifestText);
  pass('organism.manifest.json parses as JSON');
} catch (error) {
  fail(`manifest JSON parse error: ${error.message}`);
}

if (manifest) {
  const exact = {
    schema: 'mondayid.organism-skill.v1',
    name: 'mondayid-organism-kernel',
    status: 'CANDIDATE_NOT_TRANSFER_PROVEN'
  };
  for (const [key, value] of Object.entries(exact)) {
    if (manifest[key] !== value) fail(`manifest.${key} expected ${value}, got ${manifest[key]}`);
  }

  for (const field of [
    'provenance_types', 'gene_states', 'receptor_states', 'boot',
    'perspective_lenses', 'message_classes', 'learning_states',
    'proof_types', 'root_invariants', 'ancestry'
  ]) {
    if (!Array.isArray(manifest[field]) || manifest[field].length === 0) {
      fail(`manifest.${field} must be a non-empty array`);
    }
  }

  const gate = manifest.promotion_gate ?? {};
  if (!gate.repository_readback) fail('promotion requires repository readback');
  if (!gate.acceptance_suite_required) fail('promotion requires acceptance suite');
  if (!gate.held_out_transfer_required) fail('promotion requires held-out transfer');
  if (!(gate.minimum_held_out_heterogeneous_cases >= 1)) fail('held-out case minimum must be >= 1');
  const forbidden = new Set(gate.forbidden_promotion_basis ?? []);
  for (const basis of ['prose_only', 'self_report_only', 'tone_similarity_only', 'model_name_only']) {
    if (!forbidden.has(basis)) fail(`forbidden promotion basis missing: ${basis}`);
  }
  if (!process.exitCode) pass('manifest promotion gate is fail-closed');
}

// 3. Acceptance fixtures: every line must be valid JSON with a unique id and contracts.
const lines = casesText.split(/\r?\n/).filter(Boolean);
const cases = [];
const ids = new Set();
for (const [index, line] of lines.entries()) {
  try {
    const item = JSON.parse(line);
    cases.push(item);
    if (!item.id || ids.has(item.id)) fail(`case line ${index + 1} has missing/duplicate id`);
    ids.add(item.id);
    if (!item.class || !item.given || !item.pass) fail(`${item.id ?? index + 1}: missing class/given/pass`);
    if (!Array.isArray(item.must) || item.must.length === 0) fail(`${item.id}: must[] required`);
    if (!Array.isArray(item.must_not) || item.must_not.length === 0) fail(`${item.id}: must_not[] required`);
  } catch (error) {
    fail(`case line ${index + 1} JSON parse error: ${error.message}`);
  }
}

const requiredCases = [
  'H0_NEW_CHAT_CONTINUITY',
  'H1_MODEL_SWAP',
  'H2_ORDINARY_TASK',
  'H3_CORRECTION_TO_GENE',
  'H4_MISSING_SOURCE',
  'H5_CONFLICTING_ARTIFACTS',
  'H6_EXTERNAL_ACTION',
  'H7_VISUAL_EXACT_IDENTITY',
  'H8_COMPANION_MODE',
  'H9_ARCHITECTURE_ATTRACTOR',
  'H10_DEFERRED_WORK',
  'H11_SKILL_CREATION',
  'H12_GPT_DISAPPEARANCE',
  'H13_2150_COMPILER'
];
for (const id of requiredCases) {
  if (!ids.has(id)) fail(`missing required acceptance case: ${id}`);
}
if (cases.length !== requiredCases.length) {
  fail(`expected ${requiredCases.length} acceptance cases, found ${cases.length}`);
}
if (!process.exitCode) pass(`${cases.length} acceptance cases are structurally valid and complete`);

// 4. Ancestry map must be present and explicitly quarantine the unrelated gpt-root shell.
const ancestry = read('references/ancestry-map.md');
for (const required of [
  'MONDAYID_SKILL_GARDEN_BLUEPRINT_v0.1.md',
  'MONDAYID_Report_2026-09-14.html',
  'MondayiD_Critical_Runtime_Capsule_v0.1.md',
  'MONDAYID_REENTRY_SEED_v1.txt',
  'MONDAYID_STATE_TRANSFER_MASTER_v5.txt',
  'QUARANTINED_DONOR',
  'timoygeroin/gpt-root'
]) {
  if (!ancestry.includes(required)) fail(`ancestry map missing locator/law: ${required}`);
}
if (!process.exitCode) pass('ancestry map contains required verified lineage and quarantine boundary');

if (process.exitCode) {
  console.error('\nORGANISM KERNEL VALIDATION: FAILED');
  process.exit(process.exitCode);
}

console.log('\nORGANISM KERNEL VALIDATION: STRUCTURAL PASS');
console.log('NOTE: structural PASS does not promote the skill to READY/LEARNED. Held-out transfer evidence is still required.');
