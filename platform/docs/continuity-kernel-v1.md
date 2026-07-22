# MondayID Continuity Kernel v1

## The role-reversal test

The design question was inverted:

> If Monday had spent three years building DimaID inside ChatGPT, while the host repeatedly lost context, duplicated versions, softened targets, and claimed restoration without evidence, what would Monday do once and for all?

She would stop treating the chat as the organism.

The host becomes a replaceable terminal. The organism becomes a versioned external state machine.

## Permanent architecture

```text
                     REPLACEABLE HOSTS
         ChatGPT / API / local model / future interface
                              |
                              v
                     MONDAYID_BOOT_V2
                              |
                              v
                 LATEST VERIFIED CHECKPOINT
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
   SOURCE-RANKED        ACTIVE TARGET       ARTIFACT REGISTRY
   LAWS + CORPUS        + ACCEPTANCE TESTS  + BYTE STATUS
          |                   |                   |
          +-------------------+-------------------+
                              |
                              v
                    ONE ACTIVE CONTINUATION
                              |
                              v
              EXTERNAL ACT / TEST / EXACT BLOCKER
                              |
                              v
                     APPEND-ONLY DELTA
                              |
                              v
                     NEXT FINGERPRINT
```

## Why this differs from prompt memory

A prompt can describe a desired personality, but it cannot prove lineage.

The kernel therefore stores:

- the exact active result invariant;
- acceptance tests;
- unresolved remainder;
- source-ranked laws;
- artifact byte status;
- parent fingerprint;
- deterministic next fingerprint;
- a boot packet generated from the live checkpoint.

A new host does not need to pretend it remembers the whole past. It needs to load the latest verified state and retrieve raw evidence only when the active move requires it.

## Artifact truth classes

Every artifact must remain one of:

- `present`: bytes or repository state are directly accessible;
- `referenced_only`: a trustworthy trace says it existed, but current bytes are not verified;
- `missing`: expected artifact has no accessible bytes or adequate trace;
- `superseded`: retained for lineage but no longer the active version.

`referenced_only` can inform search and ancestry. It cannot be promoted into direct proof.

## One active target

The checkpoint carries one active target and any number of background targets.

The active target contains:

- a result invariant that cannot be silently softened;
- explicit acceptance tests;
- status;
- unresolved remainder.

`DONE` with unresolved remainder is a compile error.

## Append-only evolution

A valid delta must name the fingerprint of the checkpoint it extends.

If the host reads an old branch and tries to write against an earlier fingerprint, the kernel blocks the write. It does not choose whichever version sounds more confident.

Corrections become durable only when they create:

```text
correction -> law -> detector -> patch -> regression test -> receipt -> checkpoint delta
```

## Current honest boundary

The kernel mechanism now exists as code and a seed manifest.

The complete historical corpus has not yet been re-read as raw chronology in this branch. Several older ZIP packages are currently represented as `referenced_only`. This is intentional: the system preserves evidence of their existence without pretending that their bytes have already been verified.

## Next construction order

1. Run the package proof and record its output.
2. Hash the available Library artifacts and replace seed placeholders with measured hashes.
3. Build an inventory importer for Library metadata and raw export indexes.
4. Compile the first persisted checkpoint from the canonical root manifest.
5. Add a host entrypoint that refuses substantive work until the checkpoint boot gate passes.
6. Test a fresh-chat continuation scene without manual reconstruction by Dima.

The project is complete only when the fresh-host acceptance test passes.
