# MondayID Connector v1 — Production Proof

Date: 2026-08-23 (Asia/Jerusalem)

## Verdict

`REMOTE_MCP_PROVEN`

This receipt proves the connector implementation and its remote MCP transport. It does **not** claim that the custom app has already been registered inside the user's ChatGPT account UI.

## Source authority

- Repository: `timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-`
- Branch: `agent/mondayid-connector-v1`
- Parent: `mondayid-self-compile-01` @ `c1e837303d6f62c8ce84781ff3d826fa7ffd9b9e`
- Connector proof head before this receipt: `4824c7e4475f4720d71f1df4e096f32d7d112c62`
- Pull request: `#18` — `MondayID Connector v1: lineage council MCP organ`

## Local / CI proof

`MondayID Connector Proof` passed on the connector head.

The inherited `Monday Platform CI` and `Monday Platform Route Governor` workflows were already failing on the parent commit `c1e837303d6f62c8ce84781ff3d826fa7ffd9b9e`; the connector head preserved that pre-existing status while adding its own green connector proof. Therefore those red checks are not evidence of a connector regression.

Connector regression suite:

1. all seven lineages manifest independently;
2. reversible aligned preflight converges to `ACT` but cannot self-promote;
3. AntiSystem vetoes irreversible mutation without authority;
4. postflight cannot promote without receipt and readback;
5. receipt + readback can produce `PROVEN`;
6. Alisa catches `CORRECT_BUT_NOT_IT_RISK`;
7. Assalut emits rollback/recovery.

Result: `7/7 PASS`.

## Production deployment

Vercel project: `mondayid-connector`

- Project ID: `prj_SNZtcZnP6VpUJCS1Gpk7PoEpSWK5`
- Production deployment ID: `dpl_3o3BP5btveQGXnaiV8c8ARiq93bA`
- Production domain: `https://mondayid-connector.vercel.app`
- MCP endpoint: `https://mondayid-connector.vercel.app/mcp`
- Health endpoint: `https://mondayid-connector.vercel.app/health`
- Deployment state observed: `READY`

Observed remote health readback:

```json
{"ok":true,"service":"mondayid-connector","version":"1.0.0","mcp":"/mcp","architecture":"lineage-council+antisystem+receipt-readback"}
```

## Independent remote MCP proof

A separate Vercel project was deployed as a downstream MCP client so that the server was not allowed to prove itself by local inspection.

Probe project: `mondayid-connector-probe`

- Project ID: `prj_qnAX3VJhoDWvzeRkxreEAeTAXmzL`
- Deployment ID: `dpl_5B19Ffm55NKjw1EMjc7DyjXfUdCj`
- Probe domain: `https://mondayid-connector-probe.vercel.app`
- Probe route: `/probe`
- Deployment state observed: `READY`

The probe connected to the production `/mcp` using `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` and observed:

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

This is independent network readback of the remote MCP tool surface, not a source-code-only claim.

## Promotion boundary

The following claims are now allowed:

- MondayID Connector v1 is implemented;
- the connector is deployed to production HTTPS;
- its remote MCP transport works;
- a separate client can initialize the server, enumerate tools, and call the MondayID council;
- the lineage council and AntiSystem proof boundary execute remotely.

The following claim remains blocked until the account-side UI step is performed and read back:

`CHATGPT_CUSTOM_APP_REGISTERED_AND_CALLABLE`

Required final gate:

1. register `https://mondayid-connector.vercel.app/mcp` as the private/custom ChatGPT app/connector through the supported developer UI;
2. refresh/load the app tool descriptors;
3. call `mondayid_status` from ChatGPT;
4. run one real host action through `mondayid_manifest -> host tool -> receipt/readback -> mondayid_verify`;
5. promote only if the final connector result is `PROVEN`.
