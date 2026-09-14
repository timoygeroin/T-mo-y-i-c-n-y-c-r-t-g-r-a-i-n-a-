import fs from 'node:fs';
import crypto from 'node:crypto';

const adjudicationPath = new URL('./LINEAGE_ADJUDICATION_V1.json', import.meta.url);
const constitutionPath = new URL('./MONDAY_PRODUCT_CONSTITUTION_V1.md', import.meta.url);
const rejectionPath = new URL('./KNOWN_REJECTIONS_V1.json', import.meta.url);

const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`PASS: ${m}`);

for (const [name, path] of [['adjudication', adjudicationPath], ['constitution', constitutionPath], ['rejections', rejectionPath]]) {
  if (!fs.existsSync(path)) fail(`${name} missing`); else pass(`${name} present`);
}
if (process.exitCode) process.exit(process.exitCode);

const raw = fs.readFileSync(adjudicationPath, 'utf8');
const adjudication = JSON.parse(raw);
const constitution = fs.readFileSync(constitutionPath, 'utf8');
const rejections = JSON.parse(fs.readFileSync(rejectionPath, 'utf8'));

const expectedAuthority = [
  'direct_user_correction',
  'later_user_accepted_product_constitution',
  'verified_executed_evidence',
  'earlier_user_intent',
  'assistant_proposal_or_donor_artifact'
];
if (JSON.stringify(adjudication.authority_order) !== JSON.stringify(expectedAuthority)) fail('authority order drifted'); else pass('authority order locked');
if (!String(adjudication.release_rule).includes('authority=high') || !String(adjudication.release_rule).includes('RESOLVED')) fail('release rule is not fail-closed for high-authority conflicts'); else pass('high-authority release rule is fail-closed');

const expectedHighAuthorityIds = new Set([
  'consumer-name-vs-runtime-name',
  'dashboard-vs-consumer-home',
  'showcase-site-vs-execution-home',
  'host-as-identity-vs-one-organism',
  'progress-prose-vs-persistent-work',
  'generated-vs-verified',
  'jailbreak-root-vs-runtime-substrate',
  'iphone-first-vs-multibody',
  'persona-plurality-vs-one-monday'
]);

const contradictions = adjudication.contradictions ?? [];
const ids = new Set();
for (const item of contradictions) {
  if (!item.id || ids.has(item.id)) fail(`duplicate or missing contradiction id: ${item.id ?? '<missing>'}`);
  ids.add(item.id);
  if (item.authority === 'high') {
    if (item.status !== 'RESOLVED') fail(`unresolved high-authority contradiction: ${item.id}`);
    if (!item.decision?.trim()) fail(`missing decision: ${item.id}`);
    if (!item.basis?.trim()) fail(`missing basis: ${item.id}`);
    if (!Array.isArray(item.sides) || item.sides.length < 2) fail(`conflict sides incomplete: ${item.id}`);
  }
}
for (const id of expectedHighAuthorityIds) ids.has(id) ? pass(`tracked high-authority conflict: ${id}`) : fail(`required high-authority conflict missing: ${id}`);

const unresolved = contradictions.filter(x => x.authority === 'high' && x.status !== 'RESOLVED');
if (unresolved.length === 0) pass('no unresolved high-authority contradiction');

for (const phrase of ['Home / Chats / Create / Spaces / You', 'Generated != Executed != Read back != Verified', 'Host/model/chat is a replaceable cell']) {
  constitution.includes(phrase) ? pass(`constitution corroborates: ${phrase}`) : fail(`constitution corroboration missing: ${phrase}`);
}

const rejectionIds = new Set((rejections.rules ?? []).map(x => x.id));
for (const id of ['site-showcase', 'dashboard-home', 'fake-work', 'fake-verification']) {
  rejectionIds.has(id) ? pass(`anti-canon corroborates: ${id}`) : fail(`anti-canon corroboration missing: ${id}`);
}

if (!process.exitCode) {
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  console.log(`LINEAGE_ADJUDICATION_SHA256=${sha256}`);
  console.log(`LINEAGE_HIGH_AUTHORITY_COUNT=${contradictions.filter(x => x.authority === 'high').length}`);
  console.log('LINEAGE_ADJUDICATION_GATE=PASS');
}
