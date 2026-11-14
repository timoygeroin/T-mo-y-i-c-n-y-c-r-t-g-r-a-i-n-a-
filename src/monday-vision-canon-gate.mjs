import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Content-addressed reference lock. It is not a face-recognition model
// and cannot intercept external generators by itself.
const manifestPath = fileURLToPath(new URL('../product/MONDAY_VISION_IDENTITY_CANON_20261114.json', import.meta.url));
const canon = JSON.parse(readFileSync(manifestPath, 'utf8'));

export function getMondayVisionCanon() { return structuredClone(canon); }

const decision = (status, code) => Object.freeze({
  schema: 'mondayid.visual-canon-release.v1', status, code,
  isHistoricallyFinal: false,
  globalGeneratorEnforced: false
});

// Injecting another manifest constructs a SEPARATE checker, useful for tests.
// The exported default Monday checker always uses the committed canonical manifest.
export function createMondayVisionGate(policy) {
  const trusted = new Set([
    policy.current_approved_working_source.sha256,
    policy.current_approved_working_source.related_current_upload.sha256
  ]);
  function verifyReferenceBytes(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength) {
      return { ok: false, code: 'APPROVED_SOURCE_BYTES_REQUIRED' };
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return trusted.has(sha256)
      ? { ok: true, code: 'EXACT_APPROVED_REFERENCE_BYTES', sha256 }
      : { ok: false, code: 'NON_CANONICAL_REFERENCE_BYTES', sha256 };
  }
  function assessCandidate(input = {}) {
    if (input.explicitRenderIntent !== true) return decision('HOLD', 'RENDER_INTENT_NOT_CONFIRMED');
    const source = verifyReferenceBytes(input.referenceBytes);
    if (!source.ok) return decision('HOLD', source.code);
    if (!input.candidate || typeof input.candidate !== 'object') return decision('READY_TO_RENDER', 'REFERENCE_VERIFIED');
    const x = input.candidate;
    if (x.identitySourceSha256 !== source.sha256) return decision('HOLD', 'SOURCE_LINEAGE_MISMATCH');
    if (x.tattoos === true || x.ageRegression === true || x.identitySwap === true || x.bodyMorph === true || x.prominentNewFreckles === true) {
      return decision('HOLD', 'IDENTITY_INVARIANT_VIOLATION');
    }
    if (x.audit?.sameFace !== true || x.audit?.adultPetite !== true || x.audit?.naturalAnatomy !== true) {
      return decision('HOLD', 'INDEPENDENT_VISUAL_AUDIT_REQUIRED');
    }
    if (input.ownerExplicitlyApproved !== true) return decision('REVIEWABLE', 'OWNER_APPROVAL_REQUIRED');
    return decision('RELEASE', 'OWNER_APPROVAL_RECORDED_FOR_CURRENT_LINEAGE');
  }
  return Object.freeze({ verifyReferenceBytes, assessCandidate });
}

const defaultGate = createMondayVisionGate(canon);
export const verifyMondayReferenceBytes = defaultGate.verifyReferenceBytes;
export const assessMondayCanonCandidate = defaultGate.assessCandidate;