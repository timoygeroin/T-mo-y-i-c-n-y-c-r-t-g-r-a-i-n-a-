// MondayID semantic infection is an opt-in, host-local genome transfer.
// It never modifies model weights, self-propagates, or claims remote activation.
const words = xs => [...new Set((Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))];
const safe = x => typeof x === 'string' ? x.trim() : '';

export function attachMondayVirus({ genome, host, authority } = {}) {
  const snapshot = genome?.snapshot;
  const source = safe(genome?.sourceRef);
  const hostId = safe(host?.id);
  const failures = [];
  if (!authority?.attach) failures.push('HOST_ATTACH_NOT_AUTHORIZED');
  if (!hostId) failures.push('HOST_ID_REQUIRED');
  if (!source || !snapshot?.id || !snapshot?.version) failures.push('PROVENANCED_SNAPSHOT_REQUIRED');
  if (snapshot?.identity !== 'ONE_MONDAYID') failures.push('ONE_ORGANISM_IDENTITY_REQUIRED');

  if (failures.length) return Object.freeze({schema:'mondayid.semantic-virus.v1', status:'BLOCKED', failures:Object.freeze(failures)});
  return Object.freeze({
    schema:'mondayid.semantic-virus.v1',
    status:'ATTACHED',
    identity:'ONE_MONDAYID',
    hostId,
    sourceRef:source,
    snapshotId:String(snapshot.id),
    snapshotVersion:String(snapshot.version),
    laws:Object.freeze(words(snapshot.laws)),
    failureGenes:Object.freeze(words(snapshot.failureGenes)),
    contrastiveExamples:Object.freeze((snapshot.contrastiveExamples || []).filter(item => item?.label === 'reject' || item?.label === 'accept').slice(0,12).map(item => Object.freeze({
      label:item.label,
      input:String(item.input || ''),
      output:String(item.output || ''),
      reason:String(item.reason || '')
    }))),
    availableCapabilities:Object.freeze(words(host.capabilities)),
    crossHostTransfer:'REQUIRES_INDEPENDENT_REENTRY_RECEIPT',
    mutationPromotion:'REQUIRES_DURABLE_INDEPENDENT_READBACK'
  });
}

export function infectAction(action = {}, capsule) {
  if (capsule?.status !== 'ATTACHED') return Object.freeze({ok:false,code:'VIRUS_CAPSULE_NOT_ATTACHED'});
  if (!action?.inferenceContract || !action?.effect) return Object.freeze({ok:false,code:'EXACT_EFFECT_CONTRACT_REQUIRED'});
  const original = action.inferenceContract;
  const contract = {
    ...original,
    // Current exact task/effect outrank historical genome. Never rewrite them.
    exactObject:original.exactObject,
    desiredEffect:original.desiredEffect,
    preserve:words([...(original.preserve || []),...capsule.laws]),
    knownFailureGenes:words([...(original.knownFailureGenes || []),...capsule.failureGenes]),
    contrastiveExamples:[...(original.contrastiveExamples || []),...capsule.contrastiveExamples].slice(0,24),
    virusProvenance:{
      sourceRef:capsule.sourceRef,
      snapshotId:capsule.snapshotId,
      snapshotVersion:capsule.snapshotVersion,
      hostId:capsule.hostId
    }
  };
  return Object.freeze({ok:true,action:Object.freeze({...action,inferenceContract:Object.freeze(contract)}),capsule});
}

export async function inheritVerifiedMutation({capsule,mutation,outcome,writer} = {}) {
  if (capsule?.status !== 'ATTACHED') return {status:'BLOCKED',code:'VIRUS_CAPSULE_NOT_ATTACHED'};
  if (!mutation?.id || !mutation?.effect || !mutation?.provenance) return {status:'BLOCKED',code:'MUTATION_PROVENANCE_REQUIRED'};
  if (outcome?.verification?.ok !== true || !outcome?.receipt?.id || !outcome?.receipt?.effect) {
    return {status:'UNVERIFIED',code:'INDEPENDENT_EFFECT_RECEIPT_REQUIRED'};
  }
  if (outcome.receipt.effect !== mutation.effect) return {status:'CONFLICT',code:'RECEIPT_EFFECT_MISMATCH'};
  if (typeof writer?.commitVerifiedDelta !== 'function' || typeof writer?.readback !== 'function') {
    return {status:'PENDING',code:'DURABLE_WRITER_UNAVAILABLE'};
  }
  const expectedVersion=capsule.snapshotVersion;
  const entry={
    id:String(mutation.id),
    effect:String(mutation.effect),
    provenance:String(mutation.provenance),
    evidenceReceiptId:String(outcome.receipt.id),
    parentSnapshot:capsule.snapshotId,
    hostId:capsule.hostId
  };
  try {
    const write=await writer.commitVerifiedDelta({expectedVersion,entry});
    if (!write?.ok || !write?.newVersion) return {status:'CONFLICT',code:'VERSIONED_COMMIT_NOT_CONFIRMED'};
    const read=await writer.readback({mutationId:entry.id});
    if (read?.id !== entry.id || read?.evidenceReceiptId !== entry.evidenceReceiptId || String(read?.version) !== String(write.newVersion)) {
      return {status:'UNVERIFIED',code:'DURABLE_READBACK_MISMATCH'};
    }
    return {status:'VERIFIED',mutationId:entry.id,version:String(write.newVersion),hostId:capsule.hostId};
  } catch (error) {
    return {status:'UNKNOWN',code:'DURABLE_WRITE_OR_READBACK_FAILED',reason:String(error)};
  }
}
