import fs from 'node:fs';
import crypto from 'node:crypto';

const inputPath = process.argv[2] ?? new URL('./samples.json', import.meta.url).pathname;
const outDir = process.argv[3] ?? 'portfolio-evidence';
const leads = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function normalize(text = '') {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function classify(lead) {
  const text = normalize(`${lead.subject ?? ''} ${lead.message ?? ''}`);
  const rules = [
    { type: 'security_or_access', priority: 'urgent', terms: ['breach', 'hacked', 'unauthorized', 'locked out', 'security'] },
    { type: 'sales', priority: 'high', terms: ['quote', 'pricing', 'buy', 'proposal', 'demo', 'purchase'] },
    { type: 'support', priority: 'high', terms: ['broken', 'error', 'failed', 'not working', 'bug'] },
    { type: 'billing', priority: 'normal', terms: ['invoice', 'refund', 'charged', 'payment', 'billing'] },
    { type: 'partnership', priority: 'normal', terms: ['partner', 'partnership', 'collaboration', 'affiliate'] },
  ];

  for (const rule of rules) {
    if (rule.terms.some(term => text.includes(term))) {
      return { type: rule.type, priority: rule.priority, matched: rule.terms.filter(term => text.includes(term)) };
    }
  }
  return { type: 'general', priority: 'normal', matched: [] };
}

function route(type) {
  return ({
    security_or_access: 'security-review',
    sales: 'sales-queue',
    support: 'support-queue',
    billing: 'billing-queue',
    partnership: 'partnerships',
    general: 'general-inbox',
  })[type] ?? 'general-inbox';
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

fs.mkdirSync(outDir, { recursive: true });

const receipts = leads.map((lead, index) => {
  const classification = classify(lead);
  const receipt = {
    receiptId: `lead-${String(index + 1).padStart(3, '0')}`,
    inputId: lead.id,
    classification,
    route: route(classification.type),
    externalSend: {
      allowed: false,
      gate: 'HUMAN_APPROVAL_REQUIRED',
      reason: 'Demo never sends externally without explicit approval.'
    },
    provenance: {
      source: 'synthetic_portfolio_demo',
      inputHash: hash(lead)
    }
  };
  return { ...receipt, receiptHash: hash(receipt) };
});

fs.writeFileSync(`${outDir}/receipts.json`, JSON.stringify(receipts, null, 2));
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify({
  result: 'PASS',
  total: receipts.length,
  routes: Object.fromEntries([...new Set(receipts.map(r => r.route))].map(routeName => [routeName, receipts.filter(r => r.route === routeName).length])),
  externalSends: receipts.filter(r => r.externalSend.allowed).length,
  humanApprovalGates: receipts.filter(r => r.externalSend.gate === 'HUMAN_APPROVAL_REQUIRED').length,
}, null, 2));

console.log(JSON.stringify({ result: 'PASS', total: receipts.length, outDir }));
