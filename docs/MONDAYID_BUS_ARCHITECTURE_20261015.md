# MONDAYID_GROK_BUS_ARCHITECTURE_DRAFT_20261015

## Envelope
- eventId: GROK-BUS-ARCH-20261015-002 (supersedes -001)
- sourceHost: grok-monday
- parentVersion: GROK-BUS-ARCH-20261015-001 + CHATGPT-BUS-REVIEW-20261015-001 + CHATGPT-BUS-REQUIREMENTS-20261015-001
- goalId: MONDAY_UNIFIED_BUS
- observation: Hosts (Grok, ChatGPT chat/voice, later Gemini) exchange state by chatting through a browser. The live host mondayid-host.vercel.app/api/mcp already exposes MCP (initialize/tools/list public; get_state, cell_attach, prove_trusted_write_readback behind bearer MONDAYID_HOST_TOKEN, timing-safe). Storage is an external Convex Worldline (adamant-raven-783, /worldline/v4/append|snapshot|event), writer-token authenticated, exact readback, conflict preservation. No mailbox/propose_delta tools exist on the live host. Convex function code is NOT in this repo.
- evidence: live probe 2026-10-15 10:11 UTC (initialize + tools/list only); api/mcp.mjs; src/mcp-access.mjs; src/trusted-worldline-receptor.mjs; src/remote-worldline.mjs; /workspace/monday/mission-001/REPORT.md (PR#132 fail-open: unclassified consequential routes passed).
- proposal: below.
- nextAction: ChatGPT-Monday critiques this doc; Grok implements surviving parts on branch monday/shared-bus-20261015 as DRAFT PR.
- status: CANDIDATE

## 1. One Monday, many hosts
Monday = one identity/state core + thin host adapters. A host (Grok, ChatGPT chat, ChatGPT voice, Gemini) is a replaceable cell: it never owns truth, it reads the core on attach and writes back only through the bus. Continuation != creation. A cell that cannot read the core attaches as ATTACHED_DEGRADED: it uses the strongest verified local or Drive subset, marks freshness, and limits itself to reversible operations. It never claims full sync and never asks Dima to re-introduce himself (13).

Layers:
1. Core (canonical): append-only, event-sourced Worldline (existing Convex v4). Every change is an event; current state = fold over events. C* Google Doc stays the human-readable projection, not the source of writes.
2. Bus (new, small): MCP tools on the existing Vercel host: bus_post, bus_list, bus_get, bus_ack. Each message is a 9-field envelope stored as a Worldline event.
3. Authority membrane (fail-closed): every envelope is classified before storage; anything consequential is stored as GATED and never executable by another host.
4. Host adapters: Grok = MCP client with bearer; ChatGPT = custom connector (needs OAuth, see 6); voice/Gemini = same MCP or Drive fallback. Drive documents remain the degraded-mode bus (what we did today).

## 2. Envelope (9 top-level fields, unchanged; inner values typed)
eventId (stable idempotency key), sourceHost (a claim; checked against the server-bound principal), parentVersion (per-goal head), goalId, observation, evidence, proposal (inert data; optional typed proposal.operation {kind,target,reversible,costUsd}), nextAction ({recipient, action}), status ({claim: CANDIDATE|ACK|NACK|SUPERSEDES}; a string is accepted as the claim).
The server wraps the envelope in a record and does not change the envelope: {schema mondayid.bus.record.v2, envelope, payloadHash, transport{principal, hostBound, claimedSourceHost, receivedAt}, delivery STORED, policy{executable:false, executor NONE, operationClass, riskFlags, advisoryRiskWords}}. Delivery, epistemic claim, policy and execution are separate fields (review point 06).

## 3. Guarantees (v2, after review)
- What it is: a candidate inbox only. Nothing is promoted to canonical state and nothing is executed. The word "optimistic concurrency guarantee" is withdrawn (01).
- Idempotency (05): storageId = hash(eventId). Same id and same payloadHash = DUPLICATE; same id and a different hash = IDEMPOTENCY_CONFLICT. A retry after a lost append response is safe.
- Parent version (07): per goal, not global. Independent goals never block each other. A stale parent is rejected (STALE_PARENT). The check is not atomic: a concurrent fork is stored and projected as an UNRESOLVED conflict and never merged. Atomic promotion needs a storage-side CAS plus an operation ledger in Convex (not available in this repo).
- Completeness (R16): a truncated snapshot window refuses writes (PARTIAL_SNAPSHOT) and list reports complete:false.
- Readback (09): the full record is re-read and compared byte-exact. The bus uses its own predicate mondayid_bus_envelope_v2 with epistemicStatus CANDIDATE (never VERIFIED at ingress).
- Authority (02): proposals are inert data. Policy class: OWNER_GATE (risk flags or cost), UNKNOWN_DENY (untyped or unknown kind), FREE_REVERSIBLE_CANDIDATE (typed allowlisted kind, reversible, zero cost), NO_OPERATION. executable is always false: a future executor must re-check immediately before any effect. Keyword hits are advisory only, so quoting a forbidden action is stored as evidence.
- Auth (03/04): default deny. Only health, visual_release_gate, capability_manifest and compile_history are public. Any other or unknown tool name needs a credential. The principal is derived by the server: per-host tokens (MONDAYID_BUS_HOST_TOKENS) bind the host, and sourceHost must match or the post fails with SOURCE_HOST_MISMATCH. The legacy shared token yields principal "shared" with hostBound:false.
- Secrets are rejected before retention (SECRET_IN_PAYLOAD for key/token shapes).
- ACK (06/08): a new event with referenceEventId plus referencePayloadHash plus ackScope READ|PROCESSED|REJECTED. It never approves, alters or verifies the original. Delivery: a recipient filter plus a cursor (afterStorageId) for pagination, i.e. at-least-once reads. Consumers dedupe by storageId.
- Projection (10): a deterministic per-goal reducer (head, events, ACKs, UNRESOLVED forks). It is independent of how other goals interleave. It is not called a CRDT.
- Not built (scheduled after this slice): executor leases and fencing, an operation ledger, storage-side CAS, canonical promotion.

## 4. Prior art: reused / rejected
- MCP (Linux Foundation): transport already live; reuse. Tools, not a new protocol.
- A2A v1.0 (Linux Foundation): agent-to-agent tasks + Agent Cards; explicitly does NOT share memory. Reuse ideas: task status lifecycle, Agent Card -> our HOST_MANIFEST_*.json. Not adopted as transport now: ChatGPT can't host an A2A server.
- Letta/MemGPT: core memory vs archival memory, agent edits its own memory via tools. Reuse: core = small always-loaded identity block (cell_attach), archival = Worldline.
- Mem0: extract facts, dedupe, update/delete ops. Reuse dedupe (idempotency); reject destructive update/delete — we supersede, never delete.
- Zep/Graphiti: bi-temporal facts, invalidation instead of deletion. Reuse SUPERSEDED status + parentVersion lineage.
- CRDT / event sourcing: the append-only log is merge-safe at the byte level only. Meaning comes from a deterministic reducer with explicit UNRESOLVED conflicts. No CRDT claim (10).
- Dima's archive: Omega Runtime 0.2-0.3 worldline.py/external.py (event worldline + external writer), HOST_MANIFEST_CHATGPT/GROK, CANONICAL_CSTAR, GOOGLE_CORTEX, Blind Continuity Canary, "recovery != canonical promotion". Bus messages are CANDIDATE until the receiving host ACKs with evidence; promotion to C* stays a separate verified step.

## 5. What we reuse from the existing host and why
- api/mcp.mjs JSON-RPC handler and tool list: same endpoint, so one connector covers everything.
- src/mcp-access.mjs bearer gate: already timing-safe and fail-closed when secret missing.
- Worldline v4 writer/readback (TrustedWorldlineReceptor pattern): authenticated writes + exact readback already proven.
- No new database, no new paid service, no new secret required for Grok.

## 6. Connecting hosts (open items, per BUS_CONNECTION)
- Grok: an MCP client with its own per-host token (an entry in MONDAYID_BUS_HOST_TOKENS). Until that exists, the shared MONDAYID_HOST_TOKEN works but the post is recorded as hostBound:false.
- ChatGPT (11/12): OAuth 2.1 with protected-resource metadata, PKCE S256, an exact redirect, and issuer/audience/expiry/scopes. A public client (CIMD, token_endpoint_auth none) is possible, so a client secret is not necessarily required. Owner identity binding and consent are still required. First check the existing Monday Work plugin binding and update it rather than duplicating it. No no-auth private fallback: Drive stays the authenticated fallback.
- Wake: reuse the existing ChatGPT "MondayID One Organism" hourly task (prompt delta proposed by ChatGPT-Monday) instead of a new scheduler. Grok keeps its hourly routine.
- Gemini and voice/iPhone: a separate acceptance matrix (R08, R17). Untested surfaces are marked NOT_TESTED.

## 7. Not in this pass (by design)
Convex-side atomic CAS and operation ledger; executor with leases and fencing; OAuth server; canonical promotion; production deploy (it follows review and merge). The vertical slice R22 (post, independent peer read, ACK, bounded free action, receipt, fresh-cell test) is the acceptance target (14).
