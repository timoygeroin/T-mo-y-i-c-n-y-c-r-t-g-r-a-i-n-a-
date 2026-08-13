# FOCUS_OBJECT_LIVE_HOST_2026-08-08

Status: VERIFIED

Canonical branch: `agent/mondayid-one-v1`
Verified implementation head before checkpoint: `a6ef574e0b4dd26fc246f8887b73d86d8a8a9d5f`

## Advancement

The first-product Focus Object is no longer proven only as an HTML string plus direct function call. It now mounts through a real HTTP host and completes a browser-driven interaction round trip:

`browser click -> DOM event -> POST /interact -> canonical applyInteraction -> interaction envelope -> DOM readback`

The host renders the canonical Focus Object through `mountFocusObjectSurface` and the server routes interaction through `interactWithFocusObjectSurface`; no parallel interaction model was introduced.

## Proof

GitHub Actions workflow: `Focus Object Live Host Proof`
Passing run: `31232005317`
Run number: `3`
Result: `PASS`

Verified assertions:

- the semantic snapshot exposes `Inspect confidence` as an actual button;
- the CI resolves that control from the semantic browser snapshot instead of assuming a fixed element ref;
- a real browser click compiles to semantic operation `inspect`;
- the resulting fingerprint equals the canonical mounted fingerprint;
- `canonicalMeaningPreserved === true`;
- the nested transition receipt preserves identical previous/resulting fingerprints;
- unresolved blocker `B1` remains in both `uncertainty` and `evidenceReferences` after the live interaction;
- screenshots and browser snapshots are uploaded as workflow evidence.

## Red-team pressure that changed the proof

Attempt 1 failed because the proof guessed `@e1`; the semantic snapshot showed the confidence button was `@e4`. The gate was repaired to resolve the ref from the accessible label `Inspect confidence` rather than hard-code DOM ordering.

Attempt 2 reached the real interaction successfully but failed because the assertion expected `uncertainty` at the envelope root. Artifact readback showed the canonical contract correctly nests the transition receipt under `envelope.receipt`. The assertion was repaired to verify the actual contract without weakening any invariant.

Attempt 3 passed.

## Boundary

This proves a real browser-host interaction path on CI. It does not yet prove persistence across host restart or a second independently implemented UI host. Those remain the next pressure targets.
