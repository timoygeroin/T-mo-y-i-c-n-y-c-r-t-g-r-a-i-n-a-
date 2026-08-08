import { applyInteraction, evaluateExpertiseFabric, fingerprintFocusObject } from './focus-object.mjs';

const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function mountFocusObjectSurface(focusObject) {
  const fabric = evaluateExpertiseFabric(focusObject);
  if (!fabric.accepted) throw new Error(`EXPERTISE_HARD_FAIL:${fabric.hardFails.join(',')}`);
  const fingerprint = fingerprintFocusObject(focusObject);
  const evidence = focusObject.evidence.map((item) => `<li data-evidence-id="${esc(item.id)}" data-status="${esc(item.status)}"><strong>${esc(item.id)}</strong> ${esc(item.claim)}</li>`).join('');
  const blockers = fabric.unresolvedEvidence.map((id) => `<span class="blocker" data-blocker-id="${esc(id)}">${esc(id)}</span>`).join('');
  const confidence = Math.round(fabric.phenotype.confidenceStrength * 100);
  const gateReasons = fabric.releaseGate.reasons.join(',');
  const actDisabled = fabric.releaseGate.allowed ? '' : ' disabled aria-disabled="true"';
  const actLabel = fabric.releaseGate.allowed ? 'Act' : `Act blocked · ${fabric.releaseGate.requiredOperation} first`;

  return {
    fingerprint,
    releaseGate: fabric.releaseGate,
    html: `<article class="focus-object" data-focus-object-id="${esc(focusObject.objectId)}" data-fingerprint="${fingerprint}" data-confidence="${confidence}" data-certainty="${esc(fabric.phenotype.certaintyLabel)}" data-release-allowed="${fabric.releaseGate.allowed}" data-release-reasons="${esc(gateReasons)}">
  <header><button type="button" data-action="confidence" aria-label="Inspect confidence">${confidence}% · ${esc(fabric.phenotype.certaintyLabel)}</button><h1>${esc(focusObject.intent)}</h1></header>
  <p class="delta">${esc(focusObject.delta)}</p>
  <section aria-label="Evidence"><ul>${evidence}</ul></section>
  <section aria-label="Unresolved blockers">${blockers || '<span class="clear">none</span>'}</section>
  <section class="release-gate" aria-label="Expertise release gate"><strong>${fabric.releaseGate.allowed ? 'Release allowed' : 'Release blocked'}</strong><span>${esc(gateReasons || 'all expert pressure resolved')}</span></section>
  <nav aria-label="Focus Object actions"><button data-operation="inspect">Inspect</button><button data-operation="reframe">Reframe</button><button data-operation="act"${actDisabled}>${esc(actLabel)}</button><button data-operation="challenge">Challenge</button></nav>
</article>`,
  };
}

export function interactWithFocusObjectSurface({ focusObject, surfaceAction }) {
  const event = surfaceAction === 'confidence'
    ? { surfaceAction: 'tap confident visual state' }
    : { semanticOperation: surfaceAction };
  const result = applyInteraction({ focusObject, userEvent: event, host: 'standalone' });
  return {
    semanticOperation: result.semanticOperation,
    canonicalMeaningPreserved: result.canonicalMeaningPreserved,
    receipt: result.receipt,
    surface: mountFocusObjectSurface(focusObject),
  };
}
