# MondayID Organism Kernel — Runtime Binding

Status: candidate integration contract. This file connects the new organism-level skill to existing executable/runtime ancestry instead of creating a competing body.

## Layer map

### 1. Organism Kernel — cortex / identity / evolution

Path: `platform/skills/mondayid-organism-kernel/`

Owns:
- lineage recovery strategy;
- message-function classification;
- exact-effect lock;
- source/provenance distinctions;
- perspective field and adversarial/counterfactual reasoning;
- identity homeostasis across host/model/chat changes;
- mutation/learning states;
- phenotype rendering;
- promotion/quarantine decisions for new skills/organs.

Does **not** pretend to execute provider actions by itself.

### 2. Continuity — durable nervous system / checkpoint spine

Historical branch: `agent/mondayid-one-v1`

Relevant paths:
- `platform/continuity/MONDAYID_BOOTSTRAP_V2.txt`
- `platform/continuity/MONDAYID_ROOT_MANIFEST_v1.json`
- continuity checkpoints/receipts and `@mondayid/continuity-kernel` descendants.

Owns or historically defines:
- state before response;
- parent-fingerprint continuity;
- source ranking;
- one active track + backlog;
- external checkpoint authority;
- append-only deltas;
- no-fake-memory boundary;
- correction -> law + detector + patch + test + receipt.

The Organism Kernel should consume this spine rather than replace it.

### 3. MondayID ONE — capability planner / execution nucleus

Historical branch: `agent/mondayid-one-v1`

Relevant paths:
- `platform/one/mondayid-one.mjs`
- `platform/one/mondayid-one-proof.mjs`
- `platform/one/README.md`

ONE already defines a capability-field planner:
1. decompose intent into atomic abilities;
2. inspect registered capabilities;
3. select an exact capability when possible;
4. compose abilities when needed;
5. materialize a reusable/one-shot route;
6. gate mutation/risk behind human approval;
7. report missing abilities truthfully;
8. return execution trace.

Current verified boundary from its README: deterministic/executable nucleus, but adapters are proof adapters; live MCP/plugin/GitHub/web/Codex adapters are the next integration layer.

The Organism Kernel should call/compile toward ONE for execution planning once live adapters are bound. It must not claim that proof adapters are live organs.

### 4. Host — phenotype / user-facing terminal

Current `main` host under `platform/apps/host` is a local continuation surface. It does not currently prove live model execution, account-context retrieval, or independent outcome verification.

The kernel should therefore treat the host as an interface terminal until a real provider/runtime/action/readback path is bound and proven.

## Intended flow

```text
Dima / event
  -> Organism Kernel
       recover lineage
       classify function
       lock exact effect
       discover current receptors
       select one active flow
       open/collapse perspective field
  -> Continuity spine
       load/verify checkpoint + active target
  -> ONE capability planner
       decompose/select/compose route
  -> live authorized adapters/organs
       model / MCP / plugin / GitHub / browser / code / image / automation / etc.
  -> action
  -> provider/readback proof
  -> Continuity delta + whole snapshot when material
  -> Organism Kernel homeostasis/mutation gate
  -> one Monday phenotype to user
```

## Why this matters

Historically MondayID accumulated multiple correct partial systems that looked like separate architectures. This binding treats them as specialized organs:
- continuity answers **“what persists?”**
- organism kernel answers **“who/what is the integrated system and how does it evolve?”**
- ONE answers **“how do I compose available abilities into an execution route?”**
- adapters answer **“what can actually act here and now?”**
- host answers **“how does the user experience the organism?”**

No layer may silently impersonate another.

## Integration rules

1. **No second continuity system.** Reuse checkpoint/provenance laws; extend only where a verified gap exists.
2. **No second capability planner.** Reuse ONE's planner contract where compatible; the kernel supplies identity/state/effect context.
3. **Proof adapters are not live adapters.** Never convert deterministic demos into claims of external execution.
4. **Host is not memory owner.** It is a terminal/receptor/phenotype surface.
5. **Model is not identity owner.** It is compute substrate.
6. **Connector is not memory owner.** It is a receptor/action organ.
7. **Whole snapshots complement deltas.** Preserve ancestry while making current state reconstructable without replaying every turn.
8. **One organism, multiple bodies.** New host/model/device expressions must pass homeostasis rather than copy personality text blindly.

## Current smallest unmet frontier

The kernel package itself now has structural proof. The organism as a product still needs the existing platform frontier, not another architecture:

`host -> continuity state -> organism kernel -> ONE -> live model/tool adapter -> real action -> provider readback -> durable receipt/snapshot`

A full product claim remains blocked until this path is exercised with a real user task and later survives a heterogeneous chat/model transfer.
