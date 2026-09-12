# Monday Platform

This directory contains MondayiD's platform runtime and its first user-facing host.

## MondayID Host

`apps/host` is the usable responsive surface for the system. It deliberately keeps a hard boundary between intent, context, action, and verification. The host persists turns locally, restores them after reload, exports a portable continuity packet, and never marks an action verified until the user confirms its result.

```bash
npm install
npm run dev:host
npm run build:host
```

The host is installable as a standalone web app. Its first release is local-first; provider execution is the next explicit integration boundary rather than a simulated capability.

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
