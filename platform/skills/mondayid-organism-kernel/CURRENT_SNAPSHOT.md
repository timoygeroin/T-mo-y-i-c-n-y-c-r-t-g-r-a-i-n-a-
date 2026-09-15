# MondayID Organism Kernel — Current Snapshot

Snapshot status: `INTEGRATED / SOFTWARE_TRANSFER_TESTED / PRODUCTION_BINDING_PENDING`
Snapshot date: 2026-09-15
Integrated main: `d39ffd95875883f098ee806ee353f7bd5c48c890`
Merged lineage: PR #42

## What is now true

- Organism Kernel is integrated into `main`.
- Existing Continuity and MondayID ONE are reused as lower layers; no competing continuity/planner body was introduced.
- Kernel has executable move compilation in `runtime.mjs`.
- Fresh-process software transfer proof passes **12/12 heterogeneous cases**. Each case runs in a separate Node process with only its portable input packet.
- The first transfer run failed the consequential-action case; the classifier was repaired without weakening the test, and the next run passed.
- Host is wired to a server-side OpenAI Responses API bridge targeting `gpt-5.6-sol` with `high` reasoning by default.
- Model inference is explicitly separated from proof of external action.
- Vercel serverless endpoints exist at `/api/organism/health` and `/api/organism/respond`.
- Desktop + iPhone Playwright regressions, host model/runtime tests, Vite build, Route Governor, Organism Kernel and PR Head Readback all passed on the final pre-merge head `e03ee71cad4bb82a1707ca1495e4252e63225a42`.
- OpenAI Platform canonical compute target is organization `MondayiD`, project `MondayiD`.
- Canonical external web body is the existing Vercel project `mondayid-host`; other Vercel projects are legacy/probe surfaces until inventoried.

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
State: `LIVE_MODEL_BRIDGE_IMPLEMENTED / PRODUCTION_SECRET_BINDING_PENDING`
Role: user-facing body. Local/server-side bridge can call OpenAI Responses API; production Vercel must still be linked/configured and supplied with its server-side secret before public live claims are allowed.

## Transfer proof

Latest successful transfer evidence:
- `ORGANISM TRANSFER PROOF: PASS (12/12 isolated heterogeneous cases)`
- isolation: `fresh_node_process_per_case`
- covers ordinary analysis, companion mode, recovery, missing-source failure, correction→mutation, reversible action, human gate, meta-evolution, model-swap recovery, executor absence, activation, and direct decision behavior.

This is **software-level behavioral reconstruction/transfer**. It is not empirical proof that every future LLM host will behave identically; cross-host adapters still require their own readback/homeostasis checks.

## Merge proof

PR #42:
- final head: `e03ee71cad4bb82a1707ca1495e4252e63225a42`
- merge result: success
- squash merge: `d39ffd95875883f098ee806ee353f7bd5c48c890`

Final pre-merge checks:
- MondayID Organism Kernel — success
- Monday Platform CI — success
- Monday Platform Route Governor — success
- PR Head Status Readback — success
- host unit/runtime tests — 12/12
- TypeScript/Vite build — success
- Playwright desktop+iPhone — success

## OpenAI compute binding

Observed organization/projects:
- organization: `MondayiD`
- primary project: `MondayiD`
- legacy: `Alpha iD`
- platform default: `Default project`

Dima created the key named `MondayID Host Runtime` in the primary `MondayiD` project. The raw key must remain outside chat/GitHub and be stored only as a server-side deployment secret.

## Vercel binding

Primary project:
- `mondayid-host`
- project ID: `prj_UgZX7OjLZxnFc4rixQ7N1SbO5xMC`
- canonical domain: `mondayid-host.vercel.app`

Code now contains:
- `platform/vercel.json`
- `platform/api/organism/health.mjs`
- `platform/api/organism/respond.mjs`

Current exact blocker: the available write-capable browser session is not authenticated to Vercel/GitHub, so the existing project cannot yet be linked to the repository/root directory through that browser. No replacement Vercel project was created.

## Truth boundary

Do **not** call public production live yet.

Production becomes `LIVE_VERIFIED` only after all of the following read back successfully:
1. existing Vercel `mondayid-host` is linked to the primary GitHub repository with Root Directory `platform`;
2. `OPENAI_API_KEY` exists in Vercel as a server-side secret;
3. deployment completes successfully;
4. `/api/organism/health` returns `ok: true` and `api_key_configured: true`;
5. a real `/api/organism/respond` call returns an OpenAI `response_id` and answer;
6. the public host shows that answer without falsely claiming an external effect occurred.

## Active trajectory

`INTEGRATED_KERNEL -> AUTHENTICATE_VERCEL_BROWSER -> LINK_EXISTING_mondayid-host -> SET_SERVER_SECRET -> DEPLOY -> HEALTH_READBACK -> REAL_RESPONSE_READBACK -> LIVE_VERIFIED`

## Current promotion state

- structural: `PASS`
- software transfer: `PASS`
- repository integration: `PASS`
- live OpenAI adapter implementation: `PASS`
- public production binding: `PENDING_HUMAN_AUTH/SECRET`
- `LEARNED` as universal cross-host identity: not claimed

The system is no longer blocked by architecture or code. The remaining blocker is an external authenticated deployment boundary.
