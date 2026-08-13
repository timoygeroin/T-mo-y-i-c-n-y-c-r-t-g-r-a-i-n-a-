# Focus Object Expertise Release Gate Checkpoint

Date: 2026-08-08
Track: first-product interaction / Expertise Fabric integration
Status: VERIFIED

## Verified source state

Behavioral head: `b26157558e064ce9ad0f4e787628da1346b4267e`
Required CI: `Monday Platform CI`
Run: `31238989937`
Conclusion: `success`

## Advancement

Expertise Fabric is now part of the executable transition path rather than only a confidence-rendering advisor.

For a provisional Focus Object with unresolved evidence:

- `inspect`, `reframe`, and `challenge` remain admissible;
- `act` is rejected by `EXPERTISE_RELEASE_GATE_BLOCKED`;
- the release gate returns exact reasons and requires `inspect` as the next operation;
- a ready-state claim conflicting with unresolved evidence produces `READY_STATE_WITH_UNRESOLVED_EVIDENCE`;
- the interaction receipt preserves the release-gate verdict and conflict ids;
- the mounted first-product surface exposes `data-release-allowed=false`, renders release reasons, and disables the Act control.

When all evidence is verified and uncertainty is empty:

- the conflict matrix clears;
- releaseGate.allowed becomes true;
- `act` executes and its receipt records an allowed Expertise Fabric gate.

## Proofs

- `platform/focus-object/focus-object-expertise-release-proof.mjs`
- `platform/focus-object/focus-object-surface-proof.mjs`
- `platform/focus-object/focus-object-proof.mjs`
- required through `.github/workflows/platform-ci.yml`

The mandatory CI proof passed on the behavioral head without weakening the prior illusion-detector, fingerprint, persistence, or cross-host contracts.

## Red-team pressure converted into law

Inherited surface behavior previously treated all four semantic operations as executable while blocker `B1` remained unresolved. The new release gate intentionally breaks that assumption: action salience and action execution cannot outrun evidence resolution.

## Current boundary

The gate currently determines whether `act` is admissible from canonical evidence/uncertainty state. The next meaningful product advancement is to make an expert-resolution interaction produce an explicit canonical evidence transition, rather than requiring a preconstructed fully-verified object in the proof fixture.
