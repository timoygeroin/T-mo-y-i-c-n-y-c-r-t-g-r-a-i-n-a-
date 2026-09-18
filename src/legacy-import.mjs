// One-way compatibility membrane. New runtime never imports legacy modules.
export function legacyEvidenceToEvents(records = []) {
  return records.map((r, i) => ({
    id: r.id || `legacy:${i}`,
    kind: r.kind === 'failure' ? 'failure' : 'fact',
    subject: r.subject || `legacy:${i}`,
    payload: { imported: true, legacy: r.payload ?? r },
    evidence: r.evidence || null,
    epistemic: r.verified ? 'verified' : 'historical'
  }));
}
