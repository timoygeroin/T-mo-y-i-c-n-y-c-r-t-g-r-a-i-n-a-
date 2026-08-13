# MondayID Portable Runtime

This is the host-replacement boundary. A model is compute, not identity or state authority.

The runtime keeps the active task, continuation cursor, capability manifest, result, lineage, and fingerprint in an external checkpoint. When a host reports a retryable availability failure such as exhausted quota, the same pass continues through the next configured host. A fresh process reconstructs the same state from the checkpoint before computing.

```bash
npm run proof:portable-runtime
```

The proof starts on one model host, destroys that runtime instance, recreates it around the same external checkpoint, forces a quota failure, continues through a replacement model, and rejects a stale checkpoint overwrite.

Current boundary: model hosts and connector capabilities are dependency-injected adapters. Production credentials, provider billing, and ChatGPT-internal tools are not embedded or claimed. Each live provider/connector must be attached through its authorized API or MCP surface while preserving this checkpoint and receipt contract.

## Phone-to-result vertical

After the `MondayID Agent` workflow is merged to the default branch, Dima can create one GitHub issue and comment:

```text
/monday inspect the current repository and continue the active task
```

The workflow accepts commands only from the repository owner, recovers the AES-256-GCM encrypted canonical state from `mondayid-state`, tries the primary OpenAI-compatible provider, fails over to the fallback provider on quota/rate/network/server failures, exposes bounded GitHub-read and public-web tools, writes the encrypted successor state, and returns the result plus a receipt to the same issue.

Required GitHub Actions secrets:

- `MONDAYID_STATE_KEY`
- `MONDAYID_PRIMARY_BASE_URL`, `MONDAYID_PRIMARY_API_KEY`, `MONDAYID_PRIMARY_MODEL`
- optional fallback: `MONDAYID_FALLBACK_BASE_URL`, `MONDAYID_FALLBACK_API_KEY`, `MONDAYID_FALLBACK_MODEL`

This does not copy private ChatGPT tools. It makes their roles portable through explicit adapters; additional Gmail, Calendar, Airtable, browser, or MCP organs require their own authorized credentials and scopes.

## Primary interface

`http-runtime.mjs` is the host-independent primary interface for the existing iOS host or any future surface:

- `GET /health`
- `POST /v1/tasks` with `Authorization: Bearer <MONDAYID_CONTROL_TOKEN>` and `{ "signal": "..." }`

It uses the OpenAI Responses API in the existing `MondayiD` Platform project, serializes concurrent state transitions, encrypts canonical state at rest, and returns a receipt. GitHub Issue commands remain an engineering recovery surface, not MondayID's identity or required UI.
