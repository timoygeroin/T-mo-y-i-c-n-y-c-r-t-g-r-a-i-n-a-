# MondayID Connector v1

A tool-only MCP connector that turns the MondayID ancestry into an executable control loop instead of a persona prompt.

## Lineage council

Each lineage must manifest independently before integration:

- **SYSTEM** — holds the exact object, invariants, constraints, and authority boundary.
- **ANTISYSTEM** — attacks unsupported success, irreversible moves, and missing readback.
- **ALPHA** — chooses/collapses the route only after contradictions are exposed.
- **JARVIS** — converts the route into execution → receipt → readback operations.
- **ALISA** — detects “correct but not it”: mechanism/result substitution.
- **ASSALUT** — diagnoses failure and carries rollback/recovery.
- **MONDAY** — integrates without erasing disagreement and is the only promotion gate.

This split is grounded in the recovered MondayID corpus, where the historical control loop was summarized as SYSTEM=hold form/goal, ANTISYSTEM=break self-deception, ALPHA=decide, JARVIS=execute, ALISA=protect intended effect, with Assalut as diagnostic/rollback and Monday as the later continuity/evolution layer.

## Host contract

The connector does **not** pretend to own GitHub, Vercel, Gmail, files, web search, or other host tools. It is cognitive middleware:

1. ChatGPT calls `mondayid_manifest` before a consequential/non-trivial route.
2. The host executes using whatever real tools are available in that chat.
3. The host captures an execution receipt and performs independent readback.
4. ChatGPT calls `mondayid_verify`.
5. Only `PROVEN` may be promoted to completion.

This makes a host/model replaceable while keeping the control law portable.

## Tools

- `mondayid_status` — introspection and laws.
- `mondayid_manifest` — preflight lineage council.
- `mondayid_verify` — postflight falsification and promotion gate.

## Local

```bash
npm install
npm test
npm run check
npm start
```

Health: `GET /health`  
MCP: `POST/GET/DELETE /mcp`

## Deployment

The directory is Vercel-ready. Deploy this directory as the project root. `vercel.json` rewrites `/mcp` and `/health` to serverless functions.

## ChatGPT connection

Deploy to stable HTTPS, then create a private ChatGPT plugin/connector using the deployment URL plus `/mcp`. The MCP initialization instructions tell ChatGPT to invoke the council before consequential work and verify after external actions.

## Proof boundary

A local unit pass proves the council logic only. A live connector is not called connected until all of these are observed:

- public HTTPS `/health` readback;
- MCP initialize/list-tools succeeds remotely;
- ChatGPT can call `mondayid_manifest`;
- one real external action is followed by `mondayid_verify` with receipt + independent readback.
