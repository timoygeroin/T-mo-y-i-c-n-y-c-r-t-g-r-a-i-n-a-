import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safePath(root, requested) {
  if (typeof requested !== 'string' || !requested || isAbsolute(requested)) throw new Error('relativePath must be a non-empty relative path');
  const rootAbs = resolve(root);
  const target = resolve(rootAbs, requested);
  const rel = relative(rootAbs, target);
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('path escapes workspace');
  return target;
}

async function readMaybe(path) {
  try { return { exists: true, content: await readFile(path, 'utf8') }; }
  catch (error) { if (error.code === 'ENOENT') return { exists: false, content: null }; throw error; }
}

export function createExecutionContract({ journal, workspaceRoot }) {
  if (!journal?.durable || typeof journal.open !== 'function') throw new TypeError('durable journal required');
  if (!workspaceRoot) throw new TypeError('workspaceRoot required');

  async function reversibleWrite({ relativePath, content, objective = 'reversible file write' }) {
    if (typeof content !== 'string') throw new TypeError('content must be text');
    const target = safePath(workspaceRoot, relativePath);
    const task = { type: 'reversible_write', objective, relativePath };
    const jobId = await journal.open(task);
    const before = await readMaybe(target);
    const checkpoint = {
      checkpointId: `checkpoint:${randomUUID()}`,
      phase: 'checkpoint',
      target: relativePath,
      beforeExists: before.exists,
      beforeSha256: before.exists ? sha256(before.content) : null,
      beforeContent: before.content,
    };
    await journal.append(jobId, checkpoint);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    await journal.append(jobId, { phase: 'executed', target: relativePath, intendedSha256: sha256(content) });

    const after = await readMaybe(target);
    const readbackOk = after.exists && after.content === content;
    await journal.append(jobId, { phase: 'readback', target: relativePath, observedSha256: after.exists ? sha256(after.content) : null, accepted: readbackOk });
    if (!readbackOk) {
      const failed = { status: 'failed', target: relativePath, reason: 'readback_mismatch' };
      await journal.close(jobId, 'failed', failed);
      return { jobId, ...failed, checkpoint };
    }

    const receipt = {
      receiptId: `receipt:${randomUUID()}`,
      status: 'verified',
      action: 'reversible_write',
      target: relativePath,
      afterSha256: sha256(after.content),
      checkpointId: checkpoint.checkpointId,
      undoable: true,
    };
    await journal.append(jobId, { phase: 'receipt', ...receipt });
    await journal.close(jobId, 'verified', receipt);
    return { jobId, receipt, checkpoint };
  }

  async function undo({ jobId }) {
    const job = await journal.read(jobId);
    if (!job) throw new Error(`unknown job ${jobId}`);
    const checkpoint = [...job.events].reverse().find((event) => event.phase === 'checkpoint');
    const receipt = [...job.events].reverse().find((event) => event.phase === 'receipt' && event.undoable === true);
    if (!checkpoint || !receipt) throw new Error('job has no reversible receipt/checkpoint');
    const target = safePath(workspaceRoot, checkpoint.target);

    if (checkpoint.beforeExists) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, checkpoint.beforeContent, 'utf8');
    } else {
      try { await unlink(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const restored = await readMaybe(target);
    const accepted = checkpoint.beforeExists
      ? restored.exists && sha256(restored.content) === checkpoint.beforeSha256
      : !restored.exists;
    await journal.append(jobId, { phase: 'undo_readback', accepted, observedSha256: restored.exists ? sha256(restored.content) : null });
    if (!accepted) throw new Error('undo readback mismatch');
    const undoReceipt = { receiptId: `undo:${randomUUID()}`, status: 'verified', action: 'undo', target: checkpoint.target, restoresCheckpointId: checkpoint.checkpointId };
    await journal.append(jobId, { phase: 'undo_receipt', ...undoReceipt });
    return undoReceipt;
  }

  async function consequentialGate({ objective, summary }) {
    if (typeof objective !== 'string' || !objective || typeof summary !== 'string' || !summary) throw new TypeError('objective and summary required');
    const jobId = await journal.open({ type: 'consequential_action', objective, summary });
    const gate = {
      gateId: `human-gate:${randomUUID()}`,
      phase: 'human_gate',
      status: 'needs_user',
      objective,
      summary,
      executed: false,
      rule: 'No consequential/irreversible action executes before explicit confirmation.',
    };
    await journal.append(jobId, gate);
    await journal.close(jobId, 'needs_user', gate);
    return { jobId, gate };
  }

  return Object.freeze({ reversibleWrite, undo, consequentialGate });
}
