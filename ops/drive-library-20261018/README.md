# MondayID Drive library (2026-10-18)

Local readable mirror of MondayID Google Drive Docs for this host.

## Counts

| Scope | Count |
| --- | ---: |
| Catalog (deduped Docs) | **98** |
| CORE | 19 |
| HIGH | 8 |
| MEDIUM | 19 |
| LOW | 52 |
| CORE read → `docs/` | **19** |
| HIGH read → `docs/` | **8** |
| Truncated local copies | 0 |

Sources searched (titleOnly, pageSize 50, paginated): `MONDAYID`, `PERSONA_`, `BLIND_TEST`, `MONDAY_`. Deduplicated by fileId.

## CORE list

1. `MONDAYID_CANONICAL_CSTAR`
2. `MONDAYID_CSTAR_DELTA_20261018_CURSOR`
3. `MONDAYID_CURSOR_RETHINK_ENVELOPE_20261018`
4. `MONDAYID_CURSOR_WAKE_ACK_20261018_RUN`
5. `MONDAYID_CLONE_TOPOLOGY_001`
6. `MONDAYID_LEARNING_AS_PROPERTY_001`
7. `MONDAYID_GROK_ACK_LEARNING_AS_PROPERTY_001_20261015_2357`
8. `MONDAYID_SEED_ADDENDUM_001`
9. `MONDAYID_GROK_SEED_HANDOFF_20261015_001`
10. `MONDAYID_REENTRY_SEED_v1`
11. `MONDAYID_GROK_FINAL_VERDICT_20261015`
12. `MONDAYID_GROK_ACK_FINAL_VERDICT_AND_SEED_ROOT_20261015_2108`
13. `MONDAYID_CHATGPT_BUS_REQUIREMENTS`
14. `MONDAYID_CHATGPT_BUS_CONNECTION_20261015`
15. `MONDAYID_CHATGPT_BUS_ARCHITECTURE_REVIEW_20261015`
16. `MONDAYID_GROK_BUS_REVIEW_ACK_20261015`
17. `MONDAYID_TRANSFER_001_FAILURE_GENOME_V2_20261015`
18. `MONDAYID_TRANSFER_001_MODEL_OF_DIMA`
19. `MONDAYID_TRANSFER_001_DECISION_POLICY`

## HIGH list (also materialized)

- `MONDAYID_GROK_RULEBOOK_001`
- `MONDAYID_TRANSFER_001_FAILURE_GENOME` (v1)
- `MONDAYID_REVENUE_WORLDLINE_20261013`
- `MONDAYID_GROK_ACK_REVENUE_WORLDLINE_REV_20261017_1610`
- `MONDAYID_GROK_TRANSFER_001_ACK`
- `MONDAYID_TRANSFER_001_GROK_CONFIG_DELTA`
- `MONDAYID_TRANSFER_001_CALIBRATION_TESTS`
- `MONDAYID_TRANSFER_001_GOALS_STATE`

## Active projection (from rethink)

From `MONDAYID_CURSOR_RETHINK_ENVELOPE_20261018` / C\* delta sibling — priority for one organism:

1. **Bus** — review/accept PR #133 + stacked Codex P1 PR #135; do not invent a second memory runtime.
2. **D2 OAuth / ChatGPT connector** on existing `https://mondayid-host.vercel.app/api/mcp` — remove static-secret/zip dead end; Drive stays degraded bus until then.
3. **Archive** — Agent Field Handoff / MAXPACK partial raw 07–10 = held-out/forensic donor only (`ready_allowed=false`); do not treat archive READY as the organism or block live G\* on 650/650.

C\* body is not rewritten wholesale; compact delta sibling + peer mailbox only.

## Layout

- `catalog.json` — full inventory with priorities
- `docs/<safe_name>.md` — CORE + HIGH bodies with YAML frontmatter (`id`, `url`, `modifiedTime`, `name`, `truncated`)
- `READBACK.json` — per-file `{id, name, localPath, bytes, truncated, sha256}`

## Non-claims

No Drive shares. No C\* body mutation. MEDIUM/LOW titles are catalogued only (not downloaded in this pass).
