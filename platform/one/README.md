# MondayID ONE

`MondayID ONE` is the first executable nucleus that treats available platforms and tools as one capability field.

It does not search for a single perfect tool by default. It:

1. decomposes an intent into atomic abilities;
2. checks all registered capabilities at once;
3. chooses an exact capability when one truly fits;
4. composes several capabilities when no exact tool exists;
5. materializes that composition as a one-shot or reusable tool;
6. blocks mutation or excessive risk behind an explicit human gate;
7. reports genuinely missing abilities instead of pretending they exist;
8. returns an execution trace across every platform used.

## Run

From `platform/`:

```bash
npm run proof:one
```

Or directly:

```bash
node one/mondayid-one-proof.mjs
```

The proof exercises:

- cross-platform composition across GitHub, OpenAI, and MondayID;
- one-shot tool materialization;
- exact capability selection;
- mutation gating;
- honest missing-capability handling;
- traceable execution receipts.

## Current boundary

This nucleus is deterministic and executable, but its adapters are proof adapters. The next product increment is to replace them with live MCP, plugin, GitHub, web, and Codex adapters while preserving the same planner, permission, and receipt contract.
