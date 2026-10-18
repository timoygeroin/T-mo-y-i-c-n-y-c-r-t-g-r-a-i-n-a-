# MondayID Bus D2 — OAuth PRM + PKCE scaffold

Date: 2026-10-18  
Parent: MONDAYID_CHATGPT_BUS_CONNECTION D2/D3 + GROK-BUS-REVIEW-ACK finding 11  
Status: SCAFFOLD / NOT PRODUCTION-CONSENTED

## Exact object

Same MCP resource: `https://mondayid-host.vercel.app/api/mcp`  
No second MCP host. Plugin `mcp.json` URLs unchanged.

## Added surfaces

| Path | Role |
|------|------|
| `/.well-known/oauth-protected-resource` | RFC 9728 metadata → resource `/api/mcp` |
| `/.well-known/oauth-authorization-server` | RFC 8414 AS metadata, PKCE S256, `token_endpoint_auth_methods_supported: ["none"]` |
| `/api/oauth/authorize` | Authorization + owner consent HTML |
| `/api/oauth/token` | `authorization_code` + PKCE verify |
| `/api/oauth/register` | Public-client registration helper (no secret) |

## Principal mapping

Verified OAuth access token → `{ principal: "chatgpt-monday", hostBound: true, auth: "oauth" }` via `resolvePrincipal` in `src/mcp-access.mjs` (after static `MONDAYID_BUS_HOST_TOKENS`, before shared `MONDAYID_HOST_TOKEN`).

## Owner env (never in chat/Docs)

- `MONDAYID_OAUTH_ISSUER_SECRET` — ≥32 chars, required to mint/verify codes and tokens  
- optional `MONDAYID_PUBLIC_ORIGIN` — defaults to production host  
- optional `MONDAYID_OAUTH_REDIRECT_ALLOWLIST` — JSON array of allowed redirect prefixes  

## Acceptance still open

ChatGPT actual connector consent → private `bus_list` → bounded `bus_post` → Grok readback.  
Until `MONDAYID_OAUTH_ISSUER_SECRET` is set on Vercel and the plugin is refreshed, Drive remains the authenticated degraded bus.

## Non-claims

No production deploy from this PR alone. No spend. No static bearer in plugin zip. No claim that ChatGPT attach already works.
