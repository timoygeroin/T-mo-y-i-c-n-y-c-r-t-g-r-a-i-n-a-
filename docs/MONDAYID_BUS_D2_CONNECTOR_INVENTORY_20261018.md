# MondayID Bus D2 — ChatGPT / Monday Work connector inventory

Date: 2026-10-18  
Parent: GROK-BUS-REVIEW-ACK-20261015-001 step D2  
Status: INVENTORY / NOT IMPLEMENTED

## Exact object

Existing Monday Work / MondayID mobile MCP binding on the Generation-5 host URL — not a second MCP host.

## Observed binding

Canonical carrier (`plugins/mondayid-mobile` 2.6.0) and compatibility Work organ (`plugins/monday-work` 1.3.0) both declare:

```json
{
  "type": "streamable-http",
  "url": "https://mondayid-host.vercel.app/api/mcp",
  "headers": {}
}
```

No OAuth client id, no PKCE, no protected-resource metadata URL, no bearer injection.

## Auth surface today

- Public MCP tools: `health`, `visual_release_gate`, `capability_manifest`, `compile_history` (PR#133 default-deny list).
- Private tools require `Authorization: Bearer <MONDAYID_HOST_TOKEN>` (and optionally host-bound tokens from `MONDAYID_BUS_HOST_TOKENS` on the bus branch).
- A static secret must not be shipped inside the ChatGPT plugin zip.

## Gap for ChatGPT attach

ChatGPT custom connectors need an owner-consent auth path that yields a server-derived principal `chatgpt-monday`. Missing pieces:

1. OAuth 2.1 protected-resource metadata for `https://mondayid-host.vercel.app`.
2. Authorization server / CIMD public client with PKCE S256.
3. Exact redirect + audience/expiry/scopes.
4. Server mapping from verified OAuth subject → principal `chatgpt-monday` (`hostBound:true`).
5. Acceptance: ChatGPT attach → private `bus_list` → bounded `bus_post` → Grok readback.

Until then, Drive documents remain the authenticated degraded inter-host bus.

## Non-goals for this inventory

- Do not create a second Monday MCP endpoint.
- Do not demote repo plugins to older uploaded 1.1.0 Work zip.
- Do not paste host tokens into chat, Docs, or plugin assets.
