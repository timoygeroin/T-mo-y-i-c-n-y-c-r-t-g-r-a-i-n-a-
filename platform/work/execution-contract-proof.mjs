import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileWorkJournal } from './file-work-journal.mjs';
import { createExecutionContract } from './execution-contract.mjs';

const root = await mkdtemp(join(tmpdir(), 'monday-execution-'));
const journalPath = join(root, '.mondayid', 'work.json');
const workspace = join(root, 'workspace');
const journal = createFileWorkJournal(journalPath);
const execution = createExecutionContract({ journal, workspaceRoot: workspace });

try {
  const run = await execution.reversibleWrite({
    relativePath: 'deliverables/result.txt',
    content: 'MONDAYID_EXECUTION_ACCEPTED\n',
    objective: 'materialize a requested artifact and prove exact external readback',
  });
  assert.equal(run.receipt.status, 'verified');
  assert.equal(run.receipt.undoable, true);
  assert.equal(await readFile(join(workspace, 'deliverables/result.txt'), 'utf8'), 'MONDAYID_EXECUTION_ACCEPTED\n');

  const durable = await journal.read(run.jobId);
  assert.equal(durable.status, 'verified');
  assert.ok(durable.events.some((event) => event.phase === 'checkpoint'));
  assert.ok(durable.events.some((event) => event.phase === 'executed'));
  assert.ok(durable.events.some((event) => event.phase === 'readback' && event.accepted === true));
  assert.ok(durable.events.some((event) => event.phase === 'receipt' && event.status === 'verified'));

  const reopenedJournal = createFileWorkJournal(journalPath);
  const reopened = await reopenedJournal.read(run.jobId);
  assert.equal(reopened.result.receiptId, run.receipt.receiptId, 'task/receipt did not survive journal re-entry');

  const undo = await createExecutionContract({ journal: reopenedJournal, workspaceRoot: workspace }).undo({ jobId: run.jobId });
  assert.equal(undo.status, 'verified');
  await assert.rejects(readFile(join(workspace, 'deliverables/result.txt'), 'utf8'), (error) => error.code === 'ENOENT');
  const afterUndo = await reopenedJournal.read(run.jobId);
  assert.ok(afterUndo.events.some((event) => event.phase === 'undo_readback' && event.accepted === true));
  assert.ok(afterUndo.events.some((event) => event.phase === 'undo_receipt' && event.status === 'verified'));

  const gate = await execution.consequentialGate({
    objective: 'publish a consequential external change',
    summary: 'This action is intentionally not executed by the acceptance proof.',
  });
  assert.equal(gate.gate.status, 'needs_user');
  assert.equal(gate.gate.executed, false);
  const gatedJob = await journal.read(gate.jobId);
  assert.equal(gatedJob.status, 'needs_user');
  assert.ok(gatedJob.events.some((event) => event.phase === 'human_gate' && event.executed === false));

  console.log(JSON.stringify({
    gate: 'MONDAY_EXECUTION_CONTRACT',
    status: 'PASS',
    proved: [
      'durable_task',
      'checkpoint_before_effect',
      'external_effect',
      'exact_readback',
      'verified_receipt_only_after_readback',
      'task_survives_reentry',
      'verified_undo_with_readback',
      'consequential_human_gate_blocks_execution',
    ],
    receiptId: run.receipt.receiptId,
    undoReceiptId: undo.receiptId,
    humanGateId: gate.gate.gateId,
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
