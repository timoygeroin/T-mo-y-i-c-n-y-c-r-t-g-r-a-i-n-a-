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
  'Do not fake quantum computation',
  'Do not expose internal perspective branches as chain-of-thought'
]) {
  if (!skill.includes(required)) fail(`SKILL.md missing required invariant: ${required}`);
}
if (!process.exitCode) pass('SKILL.md required invariants are present');

// 2. Manifest shape, transfer proof state, and fail-closed production discipline.
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
    version: '0.1.0-integrated',
    status: 'INTEGRATED_SOFTWARE_TRANSFER_TESTED'
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

  const verified = manifest.verified_state ?? {};
  if (verified.repository_integration !== 'PASS') fail('manifest must record repository integration PASS');
  if (verified.software_transfer !== 'PASS_12_OF_12_FRESH_PROCESS_CASES') fail('manifest must record 12/12 fresh-process software transfer proof');
  if (verified.kernel_ci !== 'PASS') fail('manifest must record kernel CI PASS');
  if (verified.platform_ci !== 'PASS') fail('manifest must record platform CI PASS');
  if (verified.route_governor !== 'PASS') fail('manifest must record route-governor PASS');
  if (verified.desktop_iphone_browser_regression !== 'PASS') fail('manifest must record desktop+iPhone browser regression PASS');
  if (verified.production_public_host !== 'PENDING_AUTH_SECRET_DEPLOY_READBACK') {
    fail('production must remain pending until authenticated deploy + provider readback');
  }

  const productionGate = manifest.production_gate ?? {};
  if (productionGate.vercel_project !== 'mondayid-host') fail('canonical Vercel project must be mondayid-host');
  if (productionGate.openai_project !== 'MondayiD') fail('canonical OpenAI Platform project must be MondayiD');
  const requiredLiveProof = new Set(productionGate.required_before_live_claim ?? []);
  for (const item of [
    'authenticated_vercel_github_binding',
    'server_side_openai_api_key',
    'successful_deployment',
    'health_readback_api_key_configured_true',
    'real_openai_response_id',
    'public_ui_response_readback'
  ]) {
    if (!requiredLiveProof.has(item)) fail(`production live gate missing: ${item}`);
  }
  if (!process.exitCode) pass('manifest records integrated transfer proof and keeps production fail-closed');
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

// 5. Runtime binding must integrate existing bodies rather than invent a competing runtime.
const binding = read('references/runtime-binding.md');
for (const required of [
  'Organism Kernel — cortex / identity / evolution',
  'Continuity — durable nervous system / checkpoint spine',
  'MondayID ONE — capability planner / execution nucleus',
  'Proof adapters are not live adapters.',
  'No second continuity system.',
  'No second capability planner.',
  'host -> continuity state -> organism kernel -> ONE -> live model/tool adapter -> real action -> provider readback -> durable receipt/snapshot'
]) {
  if (!binding.includes(required)) fail(`runtime binding missing invariant: ${required}`);
}
if (!process.exitCode) pass('runtime binding reuses continuity + ONE and preserves live-adapter boundary');

// 6. Snapshot must reflect integrated software transfer while keeping public production pending.
const snapshot = read('CURRENT_SNAPSHOT.md');
for (const required of [
  'INTEGRATED / SOFTWARE_TRANSFER_TESTED / PRODUCTION_BINDING_PENDING',
  'd39ffd95875883f098ee806ee353f7bd5c48c890',
  '12/12 heterogeneous cases',
  'AUTHENTICATE_VERCEL_BROWSER',
  'Do **not** call public production live yet.'
]) {
  if (!snapshot.includes(required)) fail(`snapshot missing integrated-state invariant: ${required}`);
}
if (!process.exitCode) pass('current snapshot records integration/transfer and remains production fail-closed');

// 7. Build receipt must be parseable and distinguish software readiness from public-production readiness.
let receipt;
try {
  receipt = JSON.parse(read('BUILD_RECEIPT.json'));
  pass('BUILD_RECEIPT.json parses as JSON');
} catch (error) {
  fail(`build receipt JSON parse error: ${error.message}`);
}

if (receipt) {
  if (receipt.schema !== 'mondayid.organism-kernel.build-receipt.v2') fail('unexpected build receipt schema');
  if (receipt.integration?.merged !== true) fail('build receipt must record merged=true');
  if (receipt.integration?.merge_commit !== 'd39ffd95875883f098ee806ee353f7bd5c48c890') fail('unexpected integration merge commit');
  if (receipt.proof?.structural !== 'PASS') fail('structural proof must be PASS');
  if (receipt.proof?.software_transfer !== 'PASS') fail('software transfer proof must be PASS');
  if (receipt.proof?.software_transfer_cases !== 12) fail('software transfer proof must contain 12 cases');
  if (receipt.states?.learning !== 'TESTED') fail('learning state must remain TESTED');
  if (receipt.states?.software_transfer !== 'TRANSFERRED') fail('software transfer state must be TRANSFERRED');
  if (receipt.states?.repository_integration !== 'INTEGRATED') fail('repository integration must be INTEGRATED');
  if (receipt.states?.production !== 'PENDING_HUMAN_AUTH_SECRET') fail('production must remain pending human auth/secret');
  if (receipt.ready?.kernel_software !== true) fail('kernel software should be ready after passed proofs');
  if (receipt.ready?.production_public_host !== false) fail('public host must remain not-ready until deployment readback');
  if (receipt.production?.live_verified !== false) fail('production live_verified must remain false');
  const forbidden = new Set(receipt.forbidden_claims ?? []);
  for (const claim of [
    'production_live_before_vercel_readback',
    'full_three_year_semantic_assimilation',
    'universal_cross_llm_identity_proven',
    'background_self_evolution_without_executor'
  ]) {
    if (!forbidden.has(claim)) fail(`build receipt missing forbidden claim: ${claim}`);
  }
  if (!process.exitCode) pass('build receipt separates software readiness from public-production readiness');
}

if (process.exitCode) {
  console.error('\nORGANISM KERNEL VALIDATION: FAILED');
  process.exit(process.exitCode);
}

console.log('\nORGANISM KERNEL VALIDATION: INTEGRATED SOFTWARE PASS');
console.log('NOTE: public production remains pending until Vercel auth/secret/deploy + live provider readback gates pass.');
