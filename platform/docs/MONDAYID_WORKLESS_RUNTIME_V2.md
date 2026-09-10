# MondayID Workless Runtime v2

Human-facing alias: **WorkUp**.

This is not a new MondayID identity and it is not a clone of ChatGPT Work. It is the next execution layer of the existing MondayID Work lineage.

## Purpose

Make long-running work belong to MondayID rather than to one ChatGPT mode, one model, one chat, or one provider quota.

The governing invariant is:

> **Compute quota failure is a routing event, not task completion. Semantic failure is a causal-model event, not permission to hide the error by changing models.**

"Workless" means **independent of ChatGPT Work credits**. It does not mean infinite free tokens, GPUs, storage, browser sessions, or third-party API quotas.

## Proven lineage / donor map

1. `MondayID Work` remains the active execution ancestor:
   `origin -> Dima authority -> internal organs -> synthesis -> capability route -> execute -> proof -> checkpoint -> continuation`.
2. `MondayID ONE` remains the capability-composition and portable-continuation ancestor.
3. `Origin Convergence` remains the identity and authority boundary. This branch starts from that lineage rather than from `main`.
4. `post-llm-foundation-v0` / PR #30 is a **donor**, not a competing root. Its useful atom is:
   `state -> hypothesis -> prediction -> action -> observation -> evidence -> state revision`.
   Failed prediction invalidates the causal line instead of producing an unchanged retry.
5. `WonderID v0.2/v0.3` remains provisional donor evidence for MCP, memory, EvidenceCard/CapabilityGene and platform-cartography ideas. It does not rename MondayID.
6. `gpt-root` is not treated as MondayID lineage authority. It may be inspected for historical/interface ideas, but prompt-level claims of shell/root capability are not execution proof.

## Runtime contour

```text
USER / EVENT / STEERING
        |
        v
RECOVER EXTERNAL JOB STATE
        |
        v
INTERPRET INTENT + SUCCESS CONDITION
        |
        v
CAUSAL TASK GRAPH
        |
        v
COMPUTE ROUTER -------------------------------+
  | deterministic/local                       |
  | OSS/open-weight model                     |
  | Astra                                     |
  | Sol / other provider                      |
  +--------------------------------------------+
        |
        v
PARALLEL SPECIALISTS / WORKERS
        |
        v
EXECUTION FABRIC
  | Python / shell / sandbox container
  | browser / computer
  | repository / GitHub
  | MCP / connectors
  | file / artifact operations
        |
        v
OBSERVATION -> VERIFICATION
        |
        +-- semantic failure --> INVALIDATE CAUSAL LINE -> REPLAN
        |
        +-- compute quota -----> REROUTE COMPUTE ------+
        |                                             |
        v                                             |
CHECKPOINT + RECEIPT + CONTINUATION <-----------------+
```

## What v2 implements now

`platform/work/workless-runtime-v2.mjs` adds a provider-neutral compute router and a resumable job journal around the existing MondayID Work contract.

Current behavior:

- one stable job identity survives provider changes;
- compute lanes declare capabilities instead of being assumed equivalent;
- `quota`, `rate_limit`, `capacity`, provider unavailability and provider timeout are reroutable compute failures;
- a failed compute lane is excluded for the current reroute sequence;
- task steering can be recorded and applied before the next compute route;
- semantic/verification failure does **not** trigger provider shopping;
- the execution loop stops truthfully when no compatible compute route remains.

The deterministic proof covers:

1. Astra-like quota failure -> same job continues through Sol-like compute;
2. two provider failures -> same job can fall through to an OSS compute lane;
3. verification failure -> no provider hop;
4. steering injected during a failed route survives into the next route.

## Astra features to reproduce at the harness level

OpenAI's public GPT-6 Astra/API guidance makes several useful behaviors explicit. They belong in the WorkUp harness rather than in one model identity:

- async tool execution;
- mid-turn steering;
- configurable reasoning budget;
- subagent delegation / multi-agent work;
- computer use;
- persisted state and compaction;
- tool-result continuation;
- verification before completion.

When Astra is available, it should be a high-capability compute organ. When it is unavailable, the surrounding job should survive.

## Execution plane target

A complete WorkUp body needs execution providers independent of the planner model:

### Sandbox / Python / shell
A remote isolated container with a persistent workspace snapshot. Python and shell are capabilities of the worker, not simulated text modes.

### Browser / computer
A Playwright or equivalent computer harness owned by the runtime. Browser session state is explicit, scoped, and auditable.

### Repository
GitHub remains a durable code/test/receipt surface. Branch mutation is isolated; merge remains a human gate unless separately authorized.

### MCP / connectors
MCP and account connectors are receptors/effectors behind the route governor. They do not own cognition or canonical state.

### Models
Provider adapters expose a common contract. Expected lanes include deterministic code, OSS/open-weight models, Astra, Sol, and future providers. The router selects by capability, health, cost/budget policy, and task requirement.

## Persistent job state

The in-memory journal in v2 exists only to prove semantics. Production requires a durable journal adapter with at least:

- job id;
- parent/child task graph;
- active target and success test;
- steering inbox;
- provider attempts and failure classes;
- tool calls / observations;
- verification evidence;
- causal invalidations;
- checkpoints and continuation pointer;
- artifact/repository refs;
- authorization gates.

A chat is a control surface. It is not the state store.

## Why this can exceed ChatGPT Work structurally

ChatGPT Work provides a strong integrated cloud computer and model experience. WorkUp is allowed to optimize a different axis:

- external state can outlive a ChatGPT conversation;
- model/provider can change without changing job identity;
- deterministic computation can replace unnecessary model calls;
- execution workers can be specialized and persistent;
- failures become typed runtime events;
- verification and receipts are first-class;
- MondayID's causal-error memory can prevent unchanged retries across future hosts.

This is an architectural advantage, not a claim that a weaker model magically equals Astra's weights.

## Next engineering gates

1. **Green CI on the exact branch head** for `proof:workless-v2` and inherited MondayID proofs.
2. **Durable journal adapter** so restart/fresh process preserves the same job.
3. **Sandbox worker** with real Python + shell + workspace snapshot and explicit timeout/network policy.
4. **Computer/browser worker** with screenshot/action/readback receipts.
5. **Provider adapters** beginning with a mock/OSS lane; OpenAI adapter only after credential/billing boundaries are deliberately configured.
6. **Post-LLM convergence**: port the PR #30 causal-state atom into this lineage as a typed task/world-model layer rather than merging a parallel root.
7. **Held-out eval**: interrupt the strongest provider mid-task with a synthetic quota failure and prove completion through another compute lane without losing steering, artifacts, or success criteria.

Promotion requires proof of these behaviors. Naming, documentation, or a successful tool call alone is not completion.
