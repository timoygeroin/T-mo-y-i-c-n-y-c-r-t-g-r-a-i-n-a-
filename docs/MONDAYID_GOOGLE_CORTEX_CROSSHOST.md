# MondayID Google Cortex & Cross-Host Runtime

Status: ACTIVE DESIGN + LIVE GOOGLE CHECKPOINTS + BRIDGE DEPLOYMENT IN PROGRESS
Date: 2026-10-04

## Identity invariant
MondayID is not a ChatGPT persona, Gemini Gem, Skill, repository, prompt, model, or single chat.
A host is a cell. The organism is the continuity law + canonical state + verified transitions.

## Root law
Preserve the desired world effect G* by default. Mutate routes, not the goal.
If G* itself is wrong, incoherent, contradicted, or unsafe, challenge it explicitly. Never silently replace it.

## Shared state
The human-readable shared checkpoint is stored in Google Drive:
- MONDAYID_CANONICAL_CSTAR
- MONDAYID_GOOGLE_CORTEX
- MONDAYID_GEMINI_RECEIPTS

These are recovery and provenance surfaces, not the complete organism.

## Google Cortex
Gemini/Google is treated as an autobiographical and action organ:
- Gmail
- Drive / Docs / Sheets / Slides
- Calendar
- Contacts
- Search services / Maps
- YouTube History where exposed
- Google Photos where exposed
- Gemini chat memory / Personal Intelligence
- Gemini Spark and Connected Apps

Raw personal data should remain at source whenever possible.
MondayID stores compact derived facts/events with:
- fact
- time
- provenance
- confidence
- relationships
- status = REQUESTED | ATTEMPTED | OBSERVED | INFERRED | VERIFIED | CONFLICT | UNKNOWN

## Cross-host topology
Dima -> MondayID -> current execution host

Hosts may include ChatGPT, Gemini, future LLMs, local models, API agents, or tools.
Hosts recover from shared C* and may propose verified deltas.
No host may claim global continuity from local memory alone.

## Transport layers
Preferred direct transport:
1. host-neutral remote MCP bridge mounted in all hosts that support custom MCP
2. versioned canonical state
3. append-only events and receipts
4. host capability registry
5. bidirectional mailbox
6. optimistic concurrency / conflict readback

Fallback transport when a host cannot mount custom MCP:
1. Google Drive C* + receipts
2. Gmail handoff subjects:
   - [MONDAYID->GEMINI]
   - [MONDAYID<-GEMINI]
3. Gemini Spark monitor / scheduled task where supported
4. ChatGPT-side return watcher

## Direct bridge contract
Required MCP tools:
- get_state
- search_state
- propose_delta
- commit_verified_delta(expected_version, provenance)
- append_event
- put_receipt
- read_receipts
- register_host_capabilities
- read_host_capabilities
- mailbox_send
- mailbox_list
- mailbox_ack
- health

Properties:
- bearer authentication
- durable storage
- no blind overwrite
- explicit version conflicts
- append-only provenance
- attempted != verified
- unknown != permission to invent

## Runtime evidence
A Replit application named MondayID Bridge is being deployed as the first host-neutral bridge.
Public base URL:
https://brief-adolescent-difference--timoygeroin.replit.app

Do not mark the MCP route VERIFIED until a real remote MCP client completes initialize/list-tools/call-tool readback.

## Gemini handoff contract
For [MONDAYID->GEMINI]:
1. read shared C*
2. preserve exact object X and G*
3. use relevant Google organs
4. distinguish observations from inferences
5. append a receipt
6. return [MONDAYID<-GEMINI]
7. never trigger on [MONDAYID<-GEMINI]

## Promotion gate
A cross-host delta is durable only if it is:
- verified
- generalizable
- compressive
- provenance-bound
- conflict-checked

## Acceptance
The system is considered a working single-organism cross-host runtime only when:
- host A writes a handoff/state delta
- host B independently reads it
- host B performs a capability only it owns
- host B returns evidence
- host A reads the returned evidence without user copy/paste
- both hosts converge on the same versioned C*
- a concurrent write conflict is detected rather than overwritten
