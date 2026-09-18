# MondayID Organism Kernel — Current Snapshot

Snapshot status: `INTEGRATED / SOFTWARE_TRANSFER_TESTED / OIDC_DIRECT_DEPLOY_PENDING`
Snapshot date: 2026-09-16
Integrated kernel lineage: PR #42 + release state PR #43 + browser corrections PR #44/#45.
Current production-path branch: `agent/vercel-oidc-gateway-v1`.

## What is now true

- Organism Kernel is integrated into `main`.
- Existing Continuity and MondayID ONE are reused as lower layers; no competing continuity/planner body was introduced.
- Kernel has executable move compilation in `runtime.mjs`.
- Fresh-process software transfer proof passes **12/12 heterogeneous cases**.
- Host contains a server-side model bridge, `/api/organism/health`, and `/api/organism/respond`.
- Desktop + iPhone regressions, Route Governor, Organism Kernel and Platform CI have passed on the integrated lineage.
- Canonical external body remains the existing Vercel project `mondayid-host` (`prj_UgZX7OjLZxnFc4rixQ7N1SbO5xMC`).
- The old production deployment was proven to be a raw four-file upload and does not expose the new organism API (`/api/organism/health` returned 404).
- The Vercel connector's direct deployment contract was recovered and proven with a real preview upload: deployment files use `{file,data}` payloads.
- Browser Use login/takeover is removed from the production critical path after repeated mobile failure and lost authentication.

## Production transport mutation

The previous production plan required manually storing `OPENAI_API_KEY` in Vercel. That created an unnecessary human/browser gate.

Current primary production path:

`Vercel Function -> VERCEL_OIDC_TOKEN -> Vercel AI Gateway -> openai/gpt-5.6-sol`

Vercel's documented AI Gateway supports deployment OIDC authentication without an explicit AI Gateway/OpenAI key. The host now prefers that transport. Direct `OPENAI_API_KEY` remains an optional local/direct fallback, not a production prerequisite.

### Model adapter invariants

- gateway model ID: `openai/gpt-5.6-sol`
- default reasoning: `high`
- gateway endpoint: `https://ai-gateway.vercel.sh/v1/responses`
- production auth: platform-injected `VERCEL_OIDC_TOKEN` (or `AI_GATEWAY_API_KEY` when explicitly configured)
- direct OpenAI fallback: `OPENAI_API_KEY` -> `https://api.openai.com/v1/responses`
- model inference remains distinct from proof of external actions.

## Identity / root laws

- Current model/chat/prompt/host are substrates or organs, not the whole MondayID.
- Prime law: `I am continuation, not creation.`
- A cell may reconstruct the genome; it does not contain every raw byte.
- New chat = new observation point, not automatically a new entity.
- Continuity is proven by provenance, readback, receipts, and transfer behavior, not tone/model name.
- Exact effect outranks beautiful substitution.
- Existing body is repaired/reused before creating another architecture.
- No fake memory, fake execution, fake background work, fake `READY`, or fake persistence.
- Human sovereignty and authorization boundaries outrank system elegance.

## Integrated layers

### Organism Kernel
State: `INTEGRATED / SOFTWARE_TRANSFER_TESTED`
Role: cortex / identity / routing / homeostasis / evolution / phenotype.

### Continuity
State: `INHERITED / REUSED`
Role: state-before-response, checkpoint/fingerprint, active target, deltas, receipts.

### MondayID ONE
State: `REUSED_EXECUTION_NUCLEUS`
Role: capability decomposition, selection/composition, permission gates, traces.

### Host
State: `OIDC_GATEWAY_ADAPTER_IMPLEMENTED / DIRECT_DEPLOY_PENDING`
Role: user-facing body and model adapter. Production no longer requires browser login, Git binding, or manually inserting an OpenAI key.

## Browser correction lineage

- Native GitHub and Vercel connectors were verified healthy while Browser Use was separately logged out.
- Browser Use preview/takeover on iPhone failed in practice and auth was not preserved on resume.
- `Browser Use` is not treated as equivalent to ChatGPT Work Cloud Browser.
- Authenticated UI browsing is no longer on the critical production route for this release.

## Vercel direct deploy evidence

Canonical project:
- name: `mondayid-host`
- project ID: `prj_UgZX7OjLZxnFc4rixQ7N1SbO5xMC`
- domain: `mondayid-host.vercel.app`

Direct-deploy connector contract was recovered by fail-closed probing and validated by an actual preview deployment. The remaining operation is to upload the current `platform/` project with the `platform/` prefix stripped so `vercel.json` and `package.json` are project-root files, validate preview health/respond, then promote the same verified body to production.

## Truth boundary

Do **not** call public production live yet.

Production becomes `LIVE_VERIFIED` only after all of the following are observed:
1. current project body is directly deployed to `mondayid-host`;
2. `/api/organism/health` returns `ok: true`, `model_transport_available: true`, `preferred_transport: vercel_ai_gateway`, and `vercel_oidc_available: true`;
3. a real `/api/organism/respond` call returns an answer and provider response ID through the AI Gateway/OpenAI model path;
4. the public host renders that answer without treating model text as proof of unrelated external effects.

Manual Vercel browser login, GitHub binding, and a manually inserted `OPENAI_API_KEY` are **not** primary production requirements anymore.

## Active trajectory

`OIDC_GATEWAY_BRANCH -> CI -> DIRECT_PREVIEW_DEPLOY -> HEALTH_READBACK -> REAL_GATEWAY_RESPONSE_READBACK -> DIRECT_PRODUCTION_DEPLOY -> PUBLIC_UI_READBACK -> LIVE_VERIFIED`

## Current promotion state

- structural: `PASS` on integrated predecessor; branch CI pending for OIDC mutation
- software transfer: `PASS`
- repository integration: `PASS`
- Vercel OIDC/AI Gateway adapter: `IMPLEMENTED / TEST_PENDING`
- direct deploy mechanism: `PROVEN_ON_PREVIEW_PROBE`
- public production: `PENDING_DIRECT_DEPLOY_OIDC_READBACK`
- universal cross-LLM identity: not claimed

The remaining frontier is execution/readback, not architecture and not manual account setup.
