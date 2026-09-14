import fs from 'node:fs';

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const ok = (message) => console.log(`PASS: ${message}`);

const constitutionPath = new URL('./MONDAY_PRODUCT_CONSTITUTION_V1.md', import.meta.url);
const planPath = new URL('./CONTINUUM_INTEGRATION_PLAN.json', import.meta.url);
const rejectionPath = new URL('./KNOWN_REJECTIONS_V1.json', import.meta.url);

for (const [name, url] of [['constitution', constitutionPath], ['plan', planPath], ['rejections', rejectionPath]]) {
  if (!fs.existsSync(url)) fail(`${name} artifact missing`); else ok(`${name} artifact exists`);
}

if (process.exitCode) process.exit(process.exitCode);

const constitution = fs.readFileSync(constitutionPath, 'utf8');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const rejections = JSON.parse(fs.readFileSync(rejectionPath, 'utf8'));

const requiredConstitution = [
  'Home / Chats / Create / Spaces / You',
  'Generated != Executed != Read back != Verified',
  'Host/model/chat is a replaceable cell',
  'Definition of done'
];
for (const phrase of requiredConstitution) constitution.includes(phrase) ? ok(`constitution locks: ${phrase}`) : fail(`constitution missing: ${phrase}`);

const requiredInvariants = [
  'HOST_IS_CELL_NOT_GENOME',
  'RAW_SIGNAL_LOSSLESS',
  'GENERATED_NE_EXECUTED_NE_READBACK_NE_VERIFIED',
  'NO_BACKGROUND_CLAIM_WITHOUT_PERSISTENT_EXECUTOR',
  'MANUAL_PATH_FOR_IMPORTANT_CAPABILITIES',
  'KNOWN_REJECTION_BLOCKS_RELEASE'
];
for (const invariant of requiredInvariants) plan.invariants?.includes(invariant) ? ok(`invariant: ${invariant}`) : fail(`missing invariant: ${invariant}`);

const requiredGates = ['consumer_shell','continuity','execution','provider_fabric','field_acceptance'];
const gateIds = new Set((plan.release_gates ?? []).map(x => x.id));
for (const gate of requiredGates) gateIds.has(gate) ? ok(`release gate: ${gate}`) : fail(`missing release gate: ${gate}`);

const rejectionIds = new Set((rejections.rules ?? []).map(x => x.id));
for (const id of ['site-showcase','dashboard-home','chatgpt-clone','cyberpunk-shell','orange-task-shell','fake-work','fake-verification','beautiful-substitute','forgotten-reinvention']) {
  rejectionIds.has(id) ? ok(`anti-regression: ${id}`) : fail(`missing anti-regression: ${id}`);
}

if (!rejections.release_blocking) fail('known rejections must be release-blocking');
else ok('known rejections are release-blocking');

if (!process.exitCode) console.log('PRODUCT_CONTRACT_GATE=PASS');
