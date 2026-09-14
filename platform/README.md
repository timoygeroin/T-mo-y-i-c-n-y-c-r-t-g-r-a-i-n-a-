# Monday Platform

This directory contains MondayiD's platform runtime and its first user-facing host.

## MondayID Host

`apps/host` is a local conversation and continuation surface. It stores intentions and user-entered outcomes, with optional user attestation. It does not execute requests, retrieve account context, or independently verify outcomes. Previously generated placeholder outcomes are removed on load; they are not evidence of execution.

History can be exported and restored after validating the packet and explicitly confirming replacement. Import preserves the selected turn. Invalid files leave current state untouched. Corrupt browser storage pauses automatic writes; storage failures show a warning. Editing an intention invalidates its prior outcome and attestation. Disabled controls identify integrations that are not implemented.

The host's `mondayid.continuity.v1` envelope is a local host format, not an implementation of `packages/contracts/continuity-packet.schema.json` and not a cross-model runtime handoff.

```bash
npm install
npm run dev:host
npm run build:host
npm run test:model --workspace @mondayid/host
```

The host is installable as a standalone web app. Its first release is local-first; provider execution is the next explicit integration boundary rather than a simulated capability.

State tests require Node 24 (native TypeScript stripping). Browser regressions live in `apps/host/tests/host.spec.ts` and run through the host job in the existing platform CI workflow. They verify local UI behavior only; a passing browser test is not proof of model execution.

The lower-level packages remain a prototype runtime scaffold. They must not be presented as a deployed autonomous platform until their existing gate failures are repaired and a real execution provider is bound.

## Initial boundaries

- `packages/shared-types/` holds canonical TypeScript types for scenes, routes, and branch work.
- `packages/contracts/` holds machine-readable JSON schemas for platform inputs, decisions, proofs, continuity packets, and manifestation acts.
- `docs/manifestation-contract.md` records the first external manifestation contract and success boundary.

## First implementation order

1. Stabilize shared types.
2. Stabilize machine-readable contracts.
3. Add route-governor service scaffolding.
4. Add processor-fabric and proof-evaluation scaffolding.
5. Add corpus-memory and manifestation-engine scaffolding.

## Boundary law

This scaffold does not claim runtime execution, deployment, or full readiness. It establishes the first irreversible external continuation surface for the Monday platform build.
