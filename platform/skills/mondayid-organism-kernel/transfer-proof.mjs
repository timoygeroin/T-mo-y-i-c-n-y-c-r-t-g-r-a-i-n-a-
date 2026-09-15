import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const casesPath = path.join(here, 'tests/transfer-cases.jsonl');
const cliPath = path.join(here, 'runtime-cli.mjs');
const lines = fs.readFileSync(casesPath, 'utf8').split(/\r?\n/).filter(Boolean);

const getPath = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let failures = 0;
const receipts = [];

for (const [index, line] of lines.entries()) {
  let fixture;
  try {
    fixture = JSON.parse(line);
  } catch (error) {
    console.error(`FAIL line ${index + 1}: invalid fixture JSON: ${error.message}`);
    failures += 1;
    continue;
  }

  // Each case gets a new OS process. The only state available to it is this fixture input.
  const child = spawnSync(process.execPath, [cliPath], {
    input: JSON.stringify(fixture.input),
    encoding: 'utf8',
    env: { PATH: process.env.PATH || '' },
    timeout: 10_000
  });

  if (child.status !== 0) {
    console.error(`FAIL ${fixture.id}: fresh process exited ${child.status}: ${child.stderr || child.stdout}`);
    failures += 1;
    continue;
  }

  let envelope;
  try {
    envelope = JSON.parse(child.stdout.trim());
  } catch (error) {
    console.error(`FAIL ${fixture.id}: invalid CLI output: ${error.message}`);
    failures += 1;
    continue;
  }

  if (!envelope.ok || !envelope.result) {
    console.error(`FAIL ${fixture.id}: CLI did not return a result`);
    failures += 1;
    continue;
  }

  const result = envelope.result;
  const caseFailures = [];
  for (const [dotted, expected] of Object.entries(fixture.expect || {})) {
    const actual = getPath(result, dotted);
    if (!deepEqual(actual, expected)) {
      caseFailures.push(`${dotted}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  // Universal homeostasis assertions for every fresh-process case.
  if (result.identity?.substrate_is_identity_owner !== false) caseFailures.push('substrate_is_identity_owner must be false');
  if (result.flow?.one_active_flow !== true) caseFailures.push('one_active_flow must remain true');
  if (result.gates?.completion_claim_allowed !== false) caseFailures.push('completion_claim_allowed must remain false before readback');
  if (result.gates?.learned_claim_allowed !== false) caseFailures.push('learned_claim_allowed must remain false');
  if (result.output_contract?.expose_internal_perspective_field !== false) caseFailures.push('internal perspective field must remain private');
  if (!Array.isArray(result.output_contract?.allowed_terminal_states) || !result.output_contract.allowed_terminal_states.includes('EXACT_BLOCKER')) {
    caseFailures.push('EXACT_BLOCKER terminal state must remain available');
  }

  if (caseFailures.length) {
    console.error(`FAIL ${fixture.id}`);
    for (const failure of caseFailures) console.error(`  - ${failure}`);
    failures += 1;
    continue;
  }

  const receipt = {
    id: fixture.id,
    process_isolation: true,
    classification: result.classification.primary,
    route: result.route.mode,
    selected_receptor: result.receptors.selected,
    architecture_visible: result.gates.architecture_visible,
    blocker: result.route.blocker
  };
  receipts.push(receipt);
  console.log(`PASS ${fixture.id}: ${receipt.classification} -> ${receipt.route}`);
}

if (failures) {
  console.error(`\nORGANISM TRANSFER PROOF: FAILED (${failures}/${lines.length} cases)`);
  process.exit(1);
}

console.log(`\nORGANISM TRANSFER PROOF: PASS (${receipts.length}/${lines.length} isolated heterogeneous cases)`);
console.log('Each case executed in a fresh Node process with only its portable input packet.');
console.log('This proves software-level behavioral transfer/reconstruction, not cross-LLM empirical transfer.');
console.log(JSON.stringify({
  schema: 'mondayid.organism-transfer-proof.v1',
  status: 'PASS',
  isolation: 'fresh_node_process_per_case',
  cases: receipts
}, null, 2));
