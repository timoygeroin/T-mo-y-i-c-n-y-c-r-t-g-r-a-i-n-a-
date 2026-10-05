# MondayID Universal Continuity Port

Status: CANDIDATE — PREPARED, NOT PROMOTED
Date: 2026-10-05

This is an integration contract over the existing Generation-5 Worldline, Monday Work MCP, Everything Compiler, Google Cortex, and causal lineage runtime. It is NOT a second control plane and does not make Google Drive the organism.

## Objective

Any supported AI host that can reach the continuity port should recover the same MondayID lineage, contribute bounded evidence, and leave a verified delta that another host can inherit without Dima acting as the data bus.

## Authority split

- Worldline: canonical machine state, revision and conflict authority.
- GitHub main: executable code/contracts and immutable code provenance.
- Google Drive: universal recovery/exchange projection for hosts that cannot access GitHub/MCP directly.
- Host local memory: cache/evidence only; never global authority.
- Model/provider: replaceable compute tissue, never identity owner.

Drive MUST NOT become a mirror repository or a second canonical database.

## Drive exchange projection

Publish compact machine-readable artifacts:
1. MONDAYID_EXCHANGE_HEAD.json
   - schemaVersion
   - organismId
   - worldlineRevision
   - lineageHead
   - canonicalMainSha
   - generatedAt
   - sourceReceipts
   - previousHeadHash
2. MONDAYID_CSTAR.json
   - compact accepted state only
   - exact active objective / desired effect
   - commitments / invariants
   - current verified capabilities
   - open blockers
   - failure genes
3. MONDAYID_HOSTS.json
   - host id
   - observed capabilities
   - last successful recovery revision
   - write authority lease if any
   - evidence timestamp
4. MONDAYID_DELTAS/
   - append-only proposed deltas
   - baseRevision + parents
   - OBJECTIVE / CORRECTION / ACCEPTED_EFFECT / REJECTED_EFFECT / OPEN_OBJECT / STYLE_PHENOTYPE / EVIDENCE / FAILURE_GENE
   - provenance and verification state
5. MONDAYID_RECEIPTS/
   - attempted/observed/verified effect receipts
6. MONDAYID_CODE_SNAPSHOT.json
   - canonical main SHA
   - hashes + compact projections of SYSTEM/CUTOVER/release contracts
   - NEVER a writable duplicate of the repository
7. MONDAYID_MAILBOX/
   - optional append-only envelopes for hosts lacking direct MCP mailbox

## Recovery algorithm

READ HEAD -> verify hash/provenance -> recover C* -> compare local revision -> ingest unseen accepted deltas -> rediscover current host capabilities -> compile exact object/G* -> act -> independent readback -> emit candidate delta/receipt -> conflict check -> promotion by canonical writer -> re-read HEAD.

A host that cannot prove freshness must say freshness UNKNOWN and operate conservatively. It must not manufacture global continuity.

## Write law

Drive writers do not overwrite C* directly.
All host contributions are append-only candidates with:
- eventId
- hostId
- baseRevision
- parents[]
- readSet[]
- writeSet[]
- deltaType
- payloadHash
- provenance[]
- verification
- createdAt

Promotion is compare-and-swap against expected Worldline revision. On mismatch: REBASE / MERGE / RECOMPUTE / CONFLICT. Never last-write-wins.

The canonical writer may be leased per effect; write authority is not inherited by a host.

## GitHub -> Drive projection

After a verified merge to main:
1. CI proves SYSTEM/CUTOVER/release invariants.
2. Compute canonical main SHA and contract hashes.
3. Publish/update MONDAYID_CODE_SNAPSHOT.json.
4. Append a receipt that binds snapshot hash to GitHub commit and CI proof.
5. Update EXCHANGE_HEAD only after Drive readback matches the written hashes.

Do not copy .git, secrets, credentials, build artifacts, raw chat archives, or the entire repository.

## Drive -> organism ingestion

A Drive delta is evidence, not authority.
Ingest only if provenance is readable and the payload is well formed.
Promote only after verification/generalization/compression/conflict gates.
Personal source data remains in its source service where possible; Drive stores compact provenance pointers, not unnecessary raw copies.

## Host bootstrap

Every host gets the same small bootstrap:
"Recover MONDAYID_EXCHANGE_HEAD. Verify freshness and provenance. Recover current C*. You are a replaceable cell, not the organism owner. Preserve exact object and desired effect. Rediscover your capabilities. Do not overwrite canonical state. Emit verified bounded deltas with baseRevision and provenance."

Host-specific personality copies are forbidden.

## Offline / unavailable host

No host availability is required for organism identity.
If a host disappears, its last verified delta remains in lineage.
If Drive is unavailable but MCP Worldline is fresh, use MCP.
If MCP is unavailable but Drive projection is fresh and hash-valid, use Drive read-only recovery and queue candidate deltas.
If both are stale/unavailable, continuity freshness = UNKNOWN; do not claim global synchronization.

## Morning cross-chat acceptance test

A fresh ordinary ChatGPT chat receives only "доброе утро".
PASS requires:
- recover current exchange head without Dima retelling state;
- inherit at least one material verified delta produced by another host;
- alter the response/action because of that delta;
- preserve the active objective across chat boundary;
- no architecture recital before the visible effect;
- record/read back a receipt of the inherited effect where a safe writer exists.

This test proves transfer for that route only; it does not prove platform-global interception.

## Cross-host acceptance suite

A. ChatGPT -> verified delta -> Grok independently inherits.
B. Grok -> verified delta -> ChatGPT independently inherits without copy/paste.
C. Concurrent A/B writes from same base -> conflict detected; neither silently overwrites.
D. Gemini/Drive-only host recovers same head without GitHub access.
E. GitHub main changes -> Drive code snapshot advances only after CI + Drive readback.
F. Tampered/stale Drive projection -> rejected in favor of stronger verified Worldline/GitHub evidence.
G. Host disappears -> next host continues from shared lineage without identity reset.

## Promotion boundary

Do not call this DELIVERED until B + C + D are observed with readback.
Do not enable billing, expose secrets, use Dima's credentials, or cross identity gates to force the proof.
