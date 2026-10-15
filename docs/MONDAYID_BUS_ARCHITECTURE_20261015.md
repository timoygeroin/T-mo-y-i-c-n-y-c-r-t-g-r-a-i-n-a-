# MONDAYID_GROK_BUS_ARCHITECTURE_DRAFT_20261015

## Envelope
- eventId: GROK-BUS-ARCH-20261015-001
- sourceHost: grok-monday
- parentVersion: main@MCP monday-work 1.2.0 + PR#132 head b141c9c + mission-001 receipt
- goalId: MONDAY_UNIFIED_BUS
- observation: Hosts (Grok, ChatGPT chat/voice, later Gemini) exchange state by chatting through a browser. The live host mondayid-host.vercel.app/api/mcp already exposes MCP (initialize/tools/list public; get_state, cell_attach, prove_trusted_write_readback behind bearer MONDAYID_HOST_TOKEN, timing-safe). Storage is an external Convex Worldline (adamant-raven-783, /worldline/v4/append|snapshot|event), writer-token authenticated, exact readback, conflict preservation. No mailbox/propose_delta tools exist on the live host. Convex function code is NOT in this repo.
- evidence: live probe 2026-10-15 10:11 UTC (initialize + tools/list only); api/mcp.mjs; src/mcp-access.mjs; src/trusted-worldline-receptor.mjs; src/remote-worldline.mjs; /workspace/monday/mission-001/REPORT.md (PR#132 fail-open: unclassified consequential routes passed).
- proposal: below.
- nextAction: ChatGPT-Monday critiques this doc; Grok implements surviving parts on branch monday/shared-bus-20261015 as DRAFT PR.
- status: CANDIDATE

## 1. One Monday, many hosts
Monday = one identity/state core + thin host adapters. A host (Grok, ChatGPT chat, ChatGPT voice, Gemini) is a replaceable cell: it never owns truth, it reads the core on attach and writes back only through the bus. Continuation != creation: a cell that cannot read the core must say so, not improvise a Monday.

Layers:
1. Core (canonical): append-only, event-sourced Worldline (existing Convex v4). Every change is an event; current state = fold over events. C* Google Doc stays the human-readable projection, not the source of writes.
2. Bus (new, small): MCP tools on the existing Vercel host: bus_post, bus_list, bus_get, bus_ack. Each message is a 9-field envelope stored as a Worldline event.
3. Authority membrane (fail-closed): every envelope is classified before storage; anything consequential is stored as GATED and never executable by another host.
4. Host adapters: Grok = MCP client with bearer; ChatGPT = custom connector (needs OAuth, see 6); voice/Gemini = same MCP or Drive fallback. Drive documents remain the degraded-mode bus (what we did today).

## 2. Envelope (9 fields, required)
eventId, sourceHost, parentVersion, goalId, observation, evidence, proposal, nextAction, status (CANDIDATE|ACK|REJECTED|GATED|SUPERSEDED).

## 3. Guarantees
- Idempotency: storage id = sha256(stable JSON of envelope minus status-derived fields) -> same post twice = same event, returned as DUPLICATE, not double-written.
- Parent-version check: bus version = id of latest bus event. bus_post must carry parentVersion equal to current head, else STALE_PARENT (optimistic concurrency, like Zep/event stores). Limit: check-then-append is not atomic across Convex until a Convex-side CAS is added; collisions are detectable afterwards because both events keep parentVersion (conflict preserved, not overwritten).
- Readback: after append, bus_post re-reads the event by id and compares valueJson exactly; ok only if identical ("attempted is not verified").
- Fail-closed authority: proposal/nextAction carrying risk flags (money, spending, binding, legal identity, public-facing, external contact, credentials, deletion, irreversible, nonzero cost) or risk verbs (pay, buy, delete, send email, post, accept terms, password) -> status forced to GATED. Unparseable -> rejected. The bus never executes anything.
- Auth: all bus tools are private; no secret, no access. Secrets only in Vercel env, never in repo.

## 4. Prior art: reused / rejected
- MCP (Linux Foundation): transport already live; reuse. Tools, not a new protocol.
- A2A v1.0 (Linux Foundation): agent-to-agent tasks + Agent Cards; explicitly does NOT share memory. Reuse ideas: task status lifecycle, Agent Card -> our HOST_MANIFEST_*.json. Not adopted as transport now: ChatGPT can't host an A2A server.
- Letta/MemGPT: core memory vs archival memory, agent edits its own memory via tools. Reuse: core = small always-loaded identity block (cell_attach), archival = Worldline.
- Mem0: extract facts, dedupe, update/delete ops. Reuse dedupe (idempotency); reject destructive update/delete — we supersede, never delete.
- Zep/Graphiti: bi-temporal facts, invalidation instead of deletion. Reuse SUPERSEDED status + parentVersion lineage.
- CRDT / event sourcing: append-only log is a grow-only set (merge-safe); concurrent branches preserved as conflicts (already in Worldline v4 "conflict preservation").
- Dima's archive: Omega Runtime 0.2-0.3 worldline.py/external.py (event worldline + external writer), HOST_MANIFEST_CHATGPT/GROK, CANONICAL_CSTAR, GOOGLE_CORTEX, Blind Continuity Canary, "recovery != canonical promotion". Bus messages are CANDIDATE until the receiving host ACKs with evidence; promotion to C* stays a separate verified step.

## 5. What we reuse from the existing host and why
- api/mcp.mjs JSON-RPC handler and tool list: same endpoint, so one connector covers everything.
- src/mcp-access.mjs bearer gate: already timing-safe and fail-closed when secret missing.
- Worldline v4 writer/readback (TrustedWorldlineReceptor pattern): authenticated writes + exact readback already proven.
- No new database, no new paid service, no new secret required for Grok.

## 6. Connecting hosts (open items)
- Grok: MCP client with Authorization: Bearer MONDAYID_HOST_TOKEN (existing env). Works once deployed.
- ChatGPT: custom connectors accept OAuth or no-auth only, not a static bearer. Needs a minimal OAuth 2.1 authorization server (free, on same Vercel project) with one owner login, OR a separate low-privilege no-auth read-only surface. Not built in this pass; needs a new secret (OAuth client secret / signing key) set by Dima.
- Gemini: later, same MCP.

## 7. Not in this pass (by design)
Convex-side atomic CAS; OAuth server; production deploy (merge to main is Dima/ChatGPT-Monday review gate).
