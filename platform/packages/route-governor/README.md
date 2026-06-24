# Route Governor

## Purpose

The route governor is the first platform package responsible for turning MondayiD's internal startup, source-ranking, anti-repeat, proof-scene, and external-act rules into an explicit runtime boundary.

This is a scaffold boundary, not an implemented service. Its job is to prevent future platform work from drifting back into prompt-only architecture by naming the first executable package surface that must own route selection.

## Inputs

The route governor consumes:

- `Scene` objects from `packages/shared-types/scene.ts`.
- `RouteDecision` objects from `packages/shared-types/route.ts`.
- JSON contracts from `packages/contracts/`.
- Durable continuity packets from future corpus-memory work.

## Required Responsibilities

A future implementation must decide, before any visible release:

1. Which primary scene class is active.
2. Which source tiers are allowed to support strong claims.
3. Which organ chain or processor bundle is required.
4. Whether the proposed move class is exhausted.
5. Whether the run must end in an external durable act or an exact blocker.

## Non-Responsibilities

The route governor must not claim:

- corpus ingestion;
- model execution;
- full platform deployment;
- final readiness certification.

Those belong to later packages. This package owns the decision boundary that keeps them from being substituted by explanation.

## First Acceptance Tests

The first real implementation should fail closed when:

- a route has no source-tier classification;
- a finalization scene terminates in explanation instead of act or blocker;
- an exhausted move class is proposed again;
- a proof scene has no durable evidence surface;
- a manifestation act is claimed without a branch, commit, or externally retrievable artifact.

## Continuation Rule

The next platform scaffold step should add a minimal `route-governor` package contract or TypeScript entrypoint that validates `RouteDecision` against these responsibilities before any runtime surface is allowed to release text.