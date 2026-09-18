# MondayID Task Accounting Checkpoint — 2026-09-11

Status: **EVIDENCE CHECKPOINT / NOT FINAL TASK COUNT**

This checkpoint records the current machine-recoverable accounting state without promoting topology evidence into semantic completion claims.

## RAW-650 source scope

- Raw conversations: **650**
- Source coverage through: **2026-02-08**
- Unique user message events after branch-occurrence collapse: **40,088**
- Branch duplicate occurrences collapsed: **176**
- Candidate obligation events: **25,987**
- Candidate obligation atoms: **70,607**
- Unique normalized atom strings: **54,398**
- Exact-ish repeated instances: **15,468**

Topology outcomes at event level:

- ANSWERED_UNVERIFIED: 14,311
- EXECUTED_OR_TOOL_USED_UNVERIFIED: 2,298
- REJECTED_OR_REPEATED_BY_USER: 7,991
- ACCEPTED_BY_USER_UNVERIFIED: 813
- MISSED_NO_RESPONSE_OBSERVED: 574

Strict completion lower bound from the atom pass: **803 events / 2,294 atoms**. This is a lower bound only; tool success and assistant text are not equivalent to semantic DONE.

## Semantic thread compiler v2

The v2 compiler conservatively collapses repeated obligations within one conversation while keeping ambiguous semantic identity split. It also prevents common control/context fragments from inventing fake task objects.

Compiler changes:

1. Known host/UI boilerplate signatures are excluded from task counting.
2. Generic continuation/discourse controls attach to the active task thread.
3. Code-like payload/context lines attach to the active thread or are excluded when orphaned.
4. Exact substantive objective recurrence can collapse across the full conversation; fuzzy merges remain local and fail closed.

Observed v2 baseline:

- Machine semantic threads: **57,546**
- Multi-member threads: **8,548**
- Single-member threads: **48,998**
- Strict completion lower-bound threads: **2,023**
- Terminal topology:
  - ANSWERED_UNVERIFIED: 25,855
  - EXECUTED_OR_TOOL_USED_UNVERIFIED: 4,362
  - REJECTED_OR_REPEATED_BY_USER: 24,775
  - ACCEPTED_BY_USER_UNVERIFIED: 2,080
  - MISSED_NO_RESPONSE_OBSERVED: 474

These **57,546 are not claimed to be the final number of user tasks**. Cross-conversation identity is still uncollapsed; low-lexical paraphrases can remain split; source coverage ends before current 2026 activity; and outcome topology is not an outcome test.

## Runtime invariant repair

PR #33 was merged into `post-llm-foundation-v0` after GitHub Actions passed.

The repair closes two concrete runtime gaps:

- invalidated causal keys are enforced inside `CognitiveRuntime` before a chooser runs, and chooser escape from the viable set is rejected;
- `JSONStateStore` provides atomic durable state persistence so state, history, memory and invalidated causal keys can survive a fresh Python process.

GitHub Actions `Post-LLM Core CI` and `PR Head Status Readback` both completed successfully for head `d461479539d7296b6086a0858afb97800de06ded`; squash merge commit: `f82daffd1380d43c1306ca60ea7ee5b884e5d613`.

## Local evidence hashes

The following artifacts were generated from the current RAW-650 working set. Hashes allow later copies to be checked for exact identity.

- `MONDAYID_ACCOUNTING_MACHINE_SUMMARY_650_v3.json`  
  SHA-256 `adc95a20d3c737680b6720dfbffa8b8bd51f6274e281f01c9075905b18646218`
- `MONDAYID_OBLIGATION_ATOM_LEDGER_650_v3.jsonl`  
  SHA-256 `37af6c114aa9d71567fafefaf87ce050718178533e52e0f136b7d37cfb66e290`
- `MONDAYID_SEMANTIC_TASK_THREAD_SUMMARY_650_v2.json`  
  SHA-256 `8bcc192841b858261309374545da1ed7ba7148fe965071a5866c71922c7362f5`
- `MONDAYID_SEMANTIC_TASK_THREAD_LEDGER_650_v2.jsonl`  
  SHA-256 `f467a2bcbc02e6e1a8cf816ae2151d82d15b3dc1240e340f5e531e226986174b`

## Remaining proof gap

The current accounting line is not promotable to a final three-year total until all of the following are resolved:

- recover post-2026-02-08 raw conversation evidence or prove its unavailability;
- collapse semantically identical tasks across conversation boundaries without erasing genuinely distinct obligations;
- distinguish goal/object from constraint/context/continuation at higher semantic fidelity;
- bind thread lifecycle to outcome tests rather than response/tool topology;
- reconcile the resulting ledger with current canonical Monday state and later deltas.

Prime accounting rule: **message != task; atom != task; tool call != DONE; filename FINAL != proof.**
