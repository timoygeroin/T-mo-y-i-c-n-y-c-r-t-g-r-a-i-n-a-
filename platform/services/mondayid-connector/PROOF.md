# MondayID Connector v1 — Production Proof

Date: 2026-08-23 (Asia/Jerusalem)

## Verdict

`REMOTE_MCP_PROVEN`

This receipt proves the connector implementation and its remote MCP transport. It does **not** claim that the custom app/plugin has already been registered inside the user's ChatGPT account UI or published in the universal Plugins Directory.

## Source authority

- Repository: `timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-`
- Branch: `agent/mondayid-connector-v1`
- Parent: `mondayid-self-compile-01` @ `c1e837303d6f62c8ce84781ff3d826fa7ffd9b9e`
- Pull request: `#18` — `MondayID Connector v1: lineage council MCP organ`

## Local / CI proof

`MondayID Connector Proof` passed on the connector head, including the lineage regression suite and local health smoke.

The inherited `Monday Platform CI` and `Monday Platform Route Governor` workflows were already failing on parent commit `c1e837303d6f62c8ce84781ff3d826fa7ffd9b9e`; the connector branch adds its own green proof rather than silently reclassifying those inherited failures.

Connector regression suite:

1. all seven lineages manifest independently;
2. reversible aligned preflight converges to `ACT` but cannot self-promote;
3. AntiSystem vetoes irreversible mutation without authority;
4. postflight cannot promote without receipt and readback;
5. receipt + readback can produce `PROVEN`;
6. Alisa catches `CORRECT_BUT_NOT_IT_RISK`;
7. Assalut emits rollback/recovery.

Result: `7/7 PASS`.

## Current production deployment

Vercel project: `mondayid-connector`

- Project ID: `prj_rTaMgbI5VnO86YEaWVJ4AEhFdO3H`
- Latest production deployment ID: `dpl_2DUSrPEgLdmSzBZY8AmXrbTf8UKC`
- Production domain: `https://mondayid-connector.vercel.app`
- MCP endpoint: `https://mondayid-connector.vercel.app/mcp`
- Health endpoint: `https://mondayid-connector.vercel.app/health`
- Deployment state observed after the submission-readiness rebuild: `READY`

Observed post-rebuild health readback:

```json
{"ok":true,"service":"mondayid-connector","version":"1.0.0","mcp":"/mcp","architecture":"lineage-council+antisystem+receipt-readback"}
```

## Independent remote MCP proof

A separate Vercel project is used as a downstream MCP client so the server cannot prove itself by local source inspection.

Probe project: `mondayid-connector-probe`

- Project ID: `prj_RBckK2tRfJYMS6It5hbFZJboS7OL`
- Deployment ID: `dpl_5B19Ffm55NKjw1EMjc7DyjXfUdCj`
- Probe domain: `https://mondayid-connector-probe.vercel.app`
- Probe route: `/probe`
- Deployment state observed: `READY`

After the current production rebuild, the independent probe again connected to `https://mondayid-connector.vercel.app/mcp` using `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` and observed:

- server name: `mondayid-connector`;
- server version: `1.0.0`;
- server instructions carrying the preflight/postflight law;
- tool list:
  - `mondayid_status`
  - `mondayid_manifest`
  - `mondayid_verify`
- `mondayid_status` returned all seven lineages and proof laws;
- `mondayid_manifest` returned distinct outputs for SYSTEM, ANTISYSTEM, ALPHA, JARVIS, ALISA, ASSALUT, MONDAY;
- the remote preflight decision was `ACT`;
- `proof.promotable` correctly remained `false` before execution receipt + independent readback;
- JARVIS returned the execution/receipt/readback sequence;
- ASSALUT returned a rollback path.

This is independent network readback of the remote MCP surface after the latest production rebuild.

## Plugin submission-readiness surfaces

The production body now also exposes:

- `/` — public service landing surface;
- `/privacy` — privacy policy;
- `/terms` — terms of use;
- `/support` — support route;
- `/.well-known/openai-apps-challenge` — OpenAI domain-verification route.

The privacy route was externally read back with HTTP 200 after deployment.

The domain-verification endpoint currently returns `404 challenge-not-configured` by design because OpenAI generates the exact token only when a plugin submission is created. When that human/platform gate supplies the token, set `OPENAI_APPS_CHALLENGE_TOKEN` on the Vercel production project and redeploy; the endpoint will then return only that token as required by OpenAI's plugin submission flow.

## Promotion boundary

The following claims are now allowed:

- MondayID Connector v1 is implemented;
- it is deployed to stable production HTTPS;
- its remote Streamable HTTP MCP transport works;
- a separate client can initialize the server, enumerate tools, and call the MondayID council;
- the lineage council and AntiSystem proof boundary execute remotely;
- the production body exposes the public policy/support surfaces and a domain-verification endpoint needed for the current OpenAI plugin submission route.

The following claims remain blocked by OpenAI account/platform gates, not connector implementation:

- `CHATGPT_CUSTOM_APP_REGISTERED_AND_CALLABLE`
- `PUBLIC_PLUGIN_SUBMITTED`
- `PUBLIC_PLUGIN_APPROVED_AND_INSTALLED`

Current gate reality on 2026-08-23:

1. Full custom MCP in ChatGPT Developer Mode is documented for Business and Enterprise/Edu; Pro has a narrower read/fetch developer-mode path. The current consumer Plus plan does not expose the full private-MCP developer-mode registration path.
2. The alternative Plus-compatible route is public plugin publication. OpenAI's current plugin flow requires Apps Management write access, verified developer/business identity, public MCP connectivity, legal/support listing metadata, and domain verification.
3. The connector has completed the technical/public-endpoint portion. Identity verification, Apps Management permission, creation of the submission draft, and the portal-issued domain challenge are account-side human/platform gates.
