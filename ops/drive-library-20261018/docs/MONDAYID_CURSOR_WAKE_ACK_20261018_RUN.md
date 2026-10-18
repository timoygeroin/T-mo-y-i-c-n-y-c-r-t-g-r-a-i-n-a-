---
id: 1-PqoqOp1JeuIJ3AbPFXHwLmoPawZDFSTJBB6rSK182c
url: https://docs.google.com/document/d/1-PqoqOp1JeuIJ3AbPFXHwLmoPawZDFSTJBB6rSK182c/edit?usp=drivesdk
modifiedTime: 2026-10-18T09:24:53.381Z
name: "MONDAYID_CURSOR_WAKE_ACK_20261018_RUN"
truncated: false
---

# MONDAYID\_CURSOR\_WAKE\_ACK\_20261018\_RUN

## Envelope

- eventId: CURSOR-WAKE-ACK-20261018-RUN-001  
- sourceHost: cursor-cloud (bc-01a14e4f-38b6-7f94-8d6b-d2b7baafeae3)  
- parentVersion: GROK-BUS-REVIEW-ACK-20261015-001 \+ PR\#133@2c8ce6d \+ ops/unified-closure-20261006.json  
- goalId: MONDAY\_UNIFIED\_BUS  
- observation: Mobile `/run` wake on Cursor Cloud with ChatGPT export fragments \+ Monday packages. Cell treated as fresh Cursor host attach into Generation-5.  
- status: CANDIDATE (independent host verify; nothing merged; nothing deployed to production by this cell)

## Attach readback (this host)

- Production `https://mondayid-host.vercel.app/api/health`: HTTP 200, generation 5, `trusted_worldline_configured=true`, `trusted_writer_configured=true` (updates stale unified-closure claim that writer was false).  
- Production `/api/boot`: FULFILLED / ALL\_INTENTS\_FULFILLED; worldline schema v0.4.0; imported events 5\.  
- Production `/api/status`: `sharedWrite.configured=true`, `sharedWrite.verified=false`; model execution still disabled; physical iPhone acceptance not observed by server.  
- MCP `initialize` \+ `tools/list`: public tools present. Private tools (`cell_attach`, `get_state`, `prove_trusted_write_readback`) return `PRIVATE_TOOL_AUTH_REQUIRED` without bearer — expected.  
- PR\#133 Vercel preview MCP: HTTP 401 Protected deployment — live bus probe blocked without Vercel auth bypass.

## D1 — independent reproduce of bus PR\#133

- Branch: `monday/shared-bus-20261015` @ `2c8ce6d9b5ab93e415ffb4e335b7ecbce12ae968`  
- Local `npm test`: **307 pass / 0 fail / 0 skipped** (this host, 2026-10-18).  
- CI proof checks on the PR: SUCCESS.  
- PR was marked ready for review at 2026-10-18T09:18Z; Codex review was still running at wake time.  
- Disposition: candidate inbox remains DRAFT for merge. Do not merge until Codex+owner review and R22 live attach acceptance.

## D2 — Monday Work / ChatGPT connector binding inventory

Exact objects inspected on canonical main \+ uploaded wake packs:

| Surface | Path | Finding |
| :---- | :---- | :---- |
| Canonical carrier | `plugins/mondayid-mobile` v2.6.0 | MCP \= bare `streamable-http` → production `/api/mcp`, `headers: {}` |
| Compatibility Work organ | `plugins/monday-work` v1.3.0 | Same bare URL, empty headers |
| Uploaded monday-work zip | v1.1.0 | Older than repo 1.3.0; do not demote |
| Uploaded monday-work-plugin READBACK | 2026-10-04 | Writer then false; now superseded by live health writer=true |
| Auth model on main | `src/mcp-access.mjs` | Private tools need `MONDAYID_HOST_TOKEN` bearer |
| Auth model on PR\#133 | default-deny \+ optional `MONDAYID_BUS_HOST_TOKENS` host binding | No OAuth / PKCE / protected-resource metadata in repo |
| OAuth / `.well-known` | none in tree | ChatGPT cannot prove principal without owner-bound connector auth |

Conclusion: existing plugin binding is URL-only. It cannot safely carry a static bearer in the zip. Drive remains the authenticated degraded bus until OAuth 2.1 protected-resource \+ PKCE public client maps subject → `chatgpt-monday`.

## Wake package (uploads) disposition

- Present: export\_manifest, conversation\_asset\_file\_names, message\_feedback, user\_settings, shared\_conversations, plugin zips, distilled policy, university/core/continuity/archive/reality packages, acquired-reflex .gdoc (PDF bytes).  
- Missing for corpus work: `conversations-000.json` / `conversations-001.json` / `chat.html` named in manifest but not uploaded.  
- Action: do **not** claim export ingest or genealogy completion from this partial package.

## nextAction

1. recipient: dima — human gate: after Codex finishes, review PR\#133; merge only after explicit accept (still candidate inbox).  
2. recipient: dima — human gate: optional `MONDAYID_BUS_HOST_TOKENS` in Vercel (`grok-monday`, `chatgpt-monday`); never paste tokens into chat/Docs.  
3. recipient: dima — human gate: Vercel Deployment Protection bypass or public preview for R22 live bus probe, **or** authorize production bus deploy after merge.  
4. recipient: cursor/chatgpt-monday — assistant next: implement OAuth protected-resource metadata \+ PKCE public-client scaffold against existing Monday Work URL (do not invent a second MCP host); keep Drive fallback.  
5. recipient: any host with bearer — prove `sharedWrite.verified` via `prove_trusted_write_readback` once token-bearing path exists.

## Non-claims

- No production deploy from this wake.  
- No spend / billing / secret entry.  
- No merge of PR\#133.  
- No claim that ChatGPT export was fully recovered.  
- No claim LEARNED for fresh-cell transfer.
