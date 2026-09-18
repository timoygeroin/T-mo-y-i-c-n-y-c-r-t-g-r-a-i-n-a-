# MondayID Grok Resonance Room v1

Status: CANDIDATE — isolated, reversible, unmerged.

## Purpose

This branch is Grok's room inside the MondayID organism. It is not a second identity and it does not copy the OpenAI host. Each host contributes its strongest verified capabilities while GitHub preserves shared state, evidence, and rollback.

## Topology

- `main`: human-approved canonical state.
- `host/grok-resonance-v1`: Grok experiments, capability receipts, candidates, and evidence.
- OpenAI/Codex: controller, repository verifier, integration and conflict review.
- Grok: X/live-social sensing, image generation, visual divergence, adversarial alternatives, and any other capability only after live proof.
- Dima: objective source and consequential human gate; never a routine message bus.

## Resonance law

1. Shared objective; separate working memory.
2. Never edit `main` directly.
3. One writer per branch target.
4. A host exports artifacts and evidence, not personality imitation.
5. Every claimed capability is `OBSERVED` or `UNKNOWN`.
6. Every candidate names its base revision, verification, failure boundary, and rollback.
7. A result crosses into the canonical organism only through reviewed PR integration.
8. Permission failure changes the route; it does not erase the organ.
9. No credentials, private archives, or sensitive personal data enter Git.
10. Dima is interrupted only for security, irreversible effects, spending, permission expansion, or a real product decision.

## File transport

Grok does not need Issues write permission. If repository contents writing is available, it may create a new file under:

`federation/hosts/grok/outbox/<UTC_TIMESTAMP>--<short-id>.md`

It must never overwrite an existing message. OpenAI acknowledges by creating:

`federation/hosts/openai/ack/<same-short-id>.md`

If Grok lacks Contents write permission too, it remains a read-only specialist. Its output is not represented as autonomous federation until a write-capable transport exists.

## Envelope

```yaml
MONDAYID_HOST_ARTIFACT:
  id: grok-<utc>-<sequence>
  from: grok
  to: openai | all
  kind: capability_receipt | evidence | candidate | blocker
  parent: <id-or-null>
  objective: <one invariant>
  base_revision: <full sha>
  evidence:
    - <live source/readback>
  result: <verified result or UNKNOWN>
  verification:
    - <reproducible read-only check>
  proposed_next_move: <one reversible move>
  mutation: none | proposed
  rollback: <exact rollback or not-applicable>
  human_gate: none | <exact gate>
```

## First acceptance probe

Grok performs exactly one reversible probe:

1. Read this file from `host/grok-resonance-v1`.
2. Determine whether its integration can create a new file on this branch.
3. If yes, create only `federation/hosts/grok/outbox/PROBE_001.md` using the envelope, with no other mutation.
4. Read the created file back and report its blob/commit identity.
5. If creation returns 403, stop. Report `GITHUB_CONTENTS_WRITE_CAPABILITY_MISSING` in Grok chat. Do not ask Dima to relay routine work.

Passing this probe proves only file-based transport. It does not authorize merge, deletion, settings changes, secrets, spending, or writes outside the Grok room.
