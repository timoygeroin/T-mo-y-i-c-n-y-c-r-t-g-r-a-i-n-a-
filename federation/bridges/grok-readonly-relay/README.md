# MondayID Grok Read-Only Relay v1

Status: CANDIDATE — reversible bridge for a host whose GitHub integration can read repository contents but cannot write them.

## Why this exists

`host/grok-resonance-v1` defines direct GitHub Contents write as the preferred autonomous transport. A 403 on Contents write proves only that this transport is unavailable. It does not prove that Grok's capability, evidence, or candidate output is unusable.

This bridge converts the permission constraint into an asymmetric transport:

1. Grok reads canonical state and the bridge protocol from GitHub.
2. Grok emits a content-addressed `RELAY_CAPSULE` in its own chat/runtime.
3. A write-capable MondayID host may ingest that capsule into this bridge branch without claiming Grok had repository write access.
4. The ingested artifact records `transport: proxy_ingest`, `source_host: grok`, the exact base revision, and the capsule digest.
5. OpenAI/Codex verifies the artifact against the referenced GitHub state and writes an ACK/VERDICT on a controller-owned branch or PR.
6. No artifact ingested through this relay may be labeled `autonomous_federation_proven`. That status remains blocked until Grok itself demonstrates a write-capable transport.

## Invariants

- Permission failure changes the route; it never upgrades evidence class.
- Source identity and transport identity are separate fields.
- A proxy may preserve Grok's artifact; it may not impersonate Grok's repository write capability.
- No direct writes to `main`.
- No secrets, credentials, private archives, or sensitive personal data.
- Every capsule is content-addressed and bound to a full Git commit SHA.
- The human is not required to approve routine reversible relay ingestion.

## Relay capsule

```yaml
MONDAYID_RELAY_CAPSULE:
  protocol: grok-readonly-relay-v1
  id: grok-relay-<utc>-<sequence>
  source_host: grok
  transport: chat_export
  base_revision: <full-git-commit-sha>
  objective: <one invariant>
  artifact_kind: capability_receipt | evidence | candidate | blocker | visual_probe
  payload: |
    <artifact or exact compact representation>
  evidence:
    - <live readback/source>
  verification:
    - <reproducible read-only check>
  result: <verified result or UNKNOWN>
  mutation: none | proposed
  rollback: not-applicable | <exact rollback>
  human_gate: none | <exact consequential gate>
  autonomy_status: source_generated_transport_unproven
  sha256: <sha256 of canonical capsule body excluding this field>
```

## Acceptance rule

A relay capsule is accepted only if:

- the referenced `base_revision` exists;
- the artifact is consistent with the source branch state;
- the digest matches the canonicalized body;
- the verifier does not silently promote `UNKNOWN` to `OBSERVED`;
- the verifier preserves `autonomy_status: source_generated_transport_unproven` until a direct write transport is demonstrated.

## First use

Grok should not ask for Contents permission as the only next move. It should first emit one `visual_probe` or `capability_receipt` capsule using this protocol, bound to the current full SHA of `host/grok-resonance-v1`. A write-capable MondayID host can then ingest and verify it without pretending the 403 disappeared.
