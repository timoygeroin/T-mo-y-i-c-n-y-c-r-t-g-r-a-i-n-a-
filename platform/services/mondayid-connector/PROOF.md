# MondayID Connector v1 — Production Proof

Date: 2026-08-23 (Asia/Jerusalem)

## Verdict

`REMOTE_MCP_PROVEN + SUBMISSION_PACKAGE_READY`

This receipt proves the connector implementation, production deployment, remote MCP transport, review metadata package, and submission-readiness surfaces. It does **not** claim account-side registration, OpenAI submission, approval, or installation that has not actually occurred.

## Source authority

- Repository: `timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-`
- Branch: `agent/mondayid-connector-v1`
- Parent: `mondayid-self-compile-01` @ `c1e837303d6f62c8ce84781ff3d826fa7ffd9b9e`
- Pull request: `#18` — `MondayID Connector v1: lineage council MCP organ`
- Submission-ready runtime head before this proof seal: `b58b2597c15fdf9b08d2f91a657770746534db1a`

## Connector contract

Exposed tools:

- `mondayid_status`
- `mondayid_manifest`
- `mondayid_verify`

All three tools explicitly declare:

- `readOnlyHint: true`
- `openWorldHint: false`
- `destructiveHint: false`
- an explicit `outputSchema`

The tools only compute or inspect MondayID state supplied to them. They do not themselves perform the host action, mutate third-party systems, publish internet state, or perform destructive operations.

## Local / CI proof

`MondayID Connector Proof` passed on runtime head `b58b2597c15fdf9b08d2f91a657770746534db1a`, including the lineage regression suite and local health smoke.

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
- Current production deployment ID: `dpl_43mcXzNw3DPnYYPD88UJ363UtQAz`
- Production domain: `https://mondayid-connector.vercel.app`
- MCP endpoint: `https://mondayid-connector.vercel.app/mcp`
- Health endpoint: `https://mondayid-connector.vercel.app/health`
- Deployment state observed: `READY`
- Stable production alias attached without alias error.

Observed post-deployment health readback:

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

After deployment `dpl_43mcXzNw3DPnYYPD88UJ363UtQAz`, the independent probe again connected to `https://mondayid-connector.vercel.app/mcp` using Streamable HTTP and observed:

- server name `mondayid-connector`;
- server version `1.0.0`;
- MCP initialization instructions carrying the preflight/postflight law;
- all three expected tool names;
- all seven lineage outputs from `mondayid_manifest`;
- preflight decision `ACT` for the aligned reversible remote-proof candidate;
- `proof.promotable: false` before receipt + readback;
- JARVIS execution/receipt/readback sequence;
- ASSALUT rollback path.

This is independent network readback of the remote MCP after the submission-ready runtime was deployed.

## ChatGPT App submission package

Source file:

`platform/services/mondayid-connector/chatgpt-app-submission.json`

The package follows the OpenAI ChatGPT App submission skill contract and contains:

- display name: `MondayID Connector`;
- subtitle: `Cognitive control for actions`;
- category: `PRODUCTIVITY`;
- all 3 MCP tools with explicit annotation justifications;
- exactly 5 positive review test cases;
- exactly 3 negative review test cases.

Review checks from source inspection:

- sensitive-data solicitation: no obvious prohibited sensitive identifier fields;
- tool data use: tools evaluate supplied task state/evidence and do not themselves transmit it onward to third-party systems;
- tool naming: names match actual behavior;
- annotation consistency: all three tools are computational/read-only in implementation;
- CSP: no widget/CSP surface exists in this tool-only connector;
- outputSchema: all three exposed tools now declare one.

## Submission-readiness surfaces

Production exposes:

- `/` — public landing surface;
- `/privacy` — privacy policy;
- `/terms` — terms of use;
- `/support` — support route;
- `/.well-known/openai-apps-challenge` — domain-verification route.

The domain-verification endpoint intentionally returns `404 challenge-not-configured` until OpenAI issues the exact challenge token during a submission/account verification flow. Once supplied, the production environment variable `OPENAI_APPS_CHALLENGE_TOKEN` is the only missing value required for that endpoint to return the token.

## Platform gate observed on 2026-08-23

OpenAI's current help documentation states:

- full custom MCP / full MCP Developer Mode is available to ChatGPT Business and Enterprise/Edu;
- Pro users have a narrower read/fetch custom-app path in Developer Mode;
- the current Plus plan does not expose the private custom-MCP Developer Mode path.

Therefore the connector implementation itself is no longer the blocker for private registration on this account; the plan/account capability is.

## Promotion boundary

Allowed claims:

- `MONDAYID_CONNECTOR_IMPLEMENTED`
- `MONDAYID_CONNECTOR_CI_PROVEN`
- `MONDAYID_CONNECTOR_PRODUCTION_READY`
- `MONDAYID_REMOTE_MCP_PROVEN`
- `MONDAYID_SUBMISSION_JSON_READY`
- `MONDAYID_REVIEW_METADATA_READY`
- `MONDAYID_DOMAIN_CHALLENGE_ROUTE_READY`

Blocked until actually observed:

- `CHATGPT_ACCOUNT_SIDE_CUSTOM_APP_REGISTERED`
- `OPENAI_APP_SUBMISSION_CREATED`
- `OPENAI_DOMAIN_CHALLENGE_ISSUED_AND_SET`
- `OPENAI_APP_APPROVED`
- `MONDAYID_INSTALLED_IN_CHATGPT`

Those remaining states require OpenAI account/workspace capabilities or an OpenAI-issued submission challenge; they cannot be truthfully manufactured by the MCP server itself.
