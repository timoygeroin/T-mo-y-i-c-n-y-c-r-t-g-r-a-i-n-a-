import fs from 'node:fs';

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const ok = (message) => console.log(`PASS: ${message}`);

const constitutionPath = new URL('./MONDAY_PRODUCT_CONSTITUTION_V1.md', import.meta.url);
const planPath = new URL('./CONTINUUM_INTEGRATION_PLAN.json', import.meta.url);
const rejectionPath = new URL('./KNOWN_REJECTIONS_V1.json', import.meta.url);
const lineagePath = new URL('./LINEAGE_ADJUDICATION_V1.json', import.meta.url);
const iosHostPath = new URL('../platform/apple-host/MondayIDHost/MondayIDHostApp.swift', import.meta.url);

for (const [name, url] of [['constitution', constitutionPath], ['plan', planPath], ['rejections', rejectionPath], ['lineage', lineagePath], ['ios-host', iosHostPath]]) {
  if (!fs.existsSync(url)) fail(`${name} artifact missing`); else ok(`${name} artifact exists`);
}

if (process.exitCode) process.exit(process.exitCode);

const constitution = fs.readFileSync(constitutionPath, 'utf8');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const rejections = JSON.parse(fs.readFileSync(rejectionPath, 'utf8'));
const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
const iosHost = fs.readFileSync(iosHostPath, 'utf8');

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
  rejectionIds.has(id) ? ok(`anti-regression registered: ${id}`) : fail(`missing anti-regression: ${id}`);
}
if (!rejections.release_blocking) fail('known rejections must be release-blocking');
else ok('known rejections are release-blocking');

if (lineage.schema !== 'monday.lineage-adjudication.v1') fail('lineage adjudication schema mismatch');
else ok('lineage adjudication schema locked');
const highAuthority = (lineage.contradictions ?? []).filter(x => x.authority === 'high');
if (highAuthority.length === 0) fail('lineage adjudication has no high-authority conflicts');
else ok(`lineage adjudication tracks ${highAuthority.length} high-authority conflicts`);
const unresolvedHighAuthority = highAuthority.filter(x => x.status !== 'RESOLVED');
if (unresolvedHighAuthority.length) fail(`unresolved high-authority lineage conflicts: ${unresolvedHighAuthority.map(x => x.id).join(', ')}`);
else ok('no unresolved high-authority lineage contradiction');
for (const item of highAuthority) {
  if (!item.decision || !item.basis) fail(`lineage conflict lacks decision/basis: ${item.id}`);
}

// Real release-surface regression checks. These fail if the iPhone host drifts back
// to a developer form/dashboard or loses the familiar stable consumer shell.
const rootStart = iosHost.indexOf('private struct MondayRootView');
const homeStart = iosHost.indexOf('private struct MondayHomeView');
if (rootStart < 0 || homeStart < 0 || homeStart <= rootStart) {
  fail('cannot isolate MondayRootView consumer shell');
} else {
  const root = iosHost.slice(rootStart, homeStart);
  root.includes('TabView') ? ok('consumer root uses stable TabView') : fail('consumer root lost stable TabView');
  for (const label of ['Home', 'Chats', 'Create', 'Spaces', 'You']) {
    root.includes(`Label("${label}"`) ? ok(`consumer tab present: ${label}`) : fail(`consumer tab missing: ${label}`);
  }
  root.includes('showingSearch') && root.includes('MondaySearchView') ? ok('global Search is reachable') : fail('global Search missing');
  root.includes('showingActivity') && root.includes('MondayActivityView') ? ok('global Activity is reachable') : fail('global Activity missing');
  for (const forbidden of ['Form {', 'Control token', 'Canonical runtime', 'Telemetry', 'Dashboard']) {
    !root.includes(forbidden) ? ok(`root rejects developer/dashboard shell token: ${forbidden}`) : fail(`rejected developer/dashboard shell leaked into root: ${forbidden}`);
  }
}

const appBody = iosHost.match(/var body: some Scene \{([^]*?)\n    \}/)?.[1] ?? '';
appBody.includes('MondayRootView()') ? ok('WindowGroup enters consumer root') : fail('WindowGroup does not enter consumer root');
!appBody.includes('MondayRuntimeConnectionView()') ? ok('runtime settings are not the app root') : fail('runtime settings became the app root');

iosHost.includes('NavigationLink("Library")') ? ok('Library has an explicit manual path') : fail('Library manual path missing');
iosHost.includes('NavigationLink("Connections") { MondayRuntimeConnectionView() }') ? ok('runtime configuration is scoped under You/Connections') : fail('runtime configuration is not scoped under Connections');

const consumerBehaviorTokens = [
  'togglePin(spaceID:',
  'togglePin(documentID:',
  'MondaySpaceDetailView',
  'MondayNewTaskView',
  'MondayCapabilityComposer',
  'MondayPreferences',
  'appendChat(role:',
  'MondayDocumentKind'
];
for (const token of consumerBehaviorTokens) iosHost.includes(token) ? ok(`consumer behavior present: ${token}`) : fail(`consumer behavior missing: ${token}`);
for (const stalePlaceholder of ['Pinning is not implemented yet.', 'Section("Not implemented yet")']) {
  !iosHost.includes(stalePlaceholder) ? ok(`stale placeholder removed: ${stalePlaceholder}`) : fail(`stale placeholder still present: ${stalePlaceholder}`);
}

const fakeStatusClaims = [
  'Work complete',
  'Everything is synced',
  'All systems operational',
  '100% complete'
];
for (const claim of fakeStatusClaims) {
  !iosHost.includes(claim) ? ok(`no fake completion literal: ${claim}`) : fail(`fake completion literal present: ${claim}`);
}

if (!process.exitCode) console.log('PRODUCT_CONTRACT_GATE=PASS');