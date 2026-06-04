# Monday Platform

This directory is the first external embodiment boundary for MondayiD's platform runtime.

It is a prototype runtime scaffold, not a deployed platform. Its purpose is to move the existing internal architecture into a durable, versioned GitHub surface that future work can extend without restarting from prompt-only state.

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
