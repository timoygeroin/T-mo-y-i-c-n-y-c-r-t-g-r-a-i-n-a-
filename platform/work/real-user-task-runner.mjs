import { appendFile } from 'node:fs/promises';
import { executeVerifiedIssueReceipt } from './github-issue-receipt-executor.mjs';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const issueNumber = Number(process.env.MONDAYID_LEDGER_ISSUE ?? '40');
const sourceSignal = process.env.MONDAYID_SOURCE_SIGNAL ?? 'Continue the MondayID completion program from GitHub PR #39 and issue #40; perform safe implementation and verification actions and write durable receipts/results back to authorized project surfaces.';

const receipt = await executeVerifiedIssueReceipt({
  token,
  repository,
  issueNumber,
  objective: 'Persist a truthful external execution receipt for the current MondayID completion task in its canonical GitHub ledger.',
  sourceSignal,
  evidence: [
    { gate: 'continuity', workflowRun: 34871052029, conclusion: 'success' },
    { gate: 'execution_contract', workflowRun: 34871499502, conclusion: 'success' },
    { gate: 'runtime_truth', workflowRun: 34871593307, conclusion: 'success' },
  ],
});

console.log(JSON.stringify({ gate: 'MONDAY_REAL_USER_TASK', ...receipt }, null, 2));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `receipt_id=${receipt.receiptId}\ncomment_id=${receipt.effect.commentId}\ncomment_url=${receipt.effect.url}\nstatus=${receipt.status}\n`, 'utf8');
}
