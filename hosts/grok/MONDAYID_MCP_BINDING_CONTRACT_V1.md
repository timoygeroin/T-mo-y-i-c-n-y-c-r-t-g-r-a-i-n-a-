# MondayID — Grok MCP Binding Contract v1

Status: CANDIDATE / transport-neutral.

Purpose: give Grok a real nervous-system path to the same Monday organism rather than relying on a static prompt or branch snapshot.

## Required read tools
- `mondayid.resolve_head()` -> newest verifiable canonical head + provenance + freshness
- `mondayid.recover_state(scope)` -> scoped current state, unresolved objects, compatible validated deltas
- `mondayid.search_provenance(query, layers, limit)` -> evidence graph search with provenance class
- `mondayid.get_failure_genes(scope)` -> relevant learned failures/corrections with proof status
- `mondayid.discover_surfaces()` -> currently reachable organism surfaces and receptor status

## Optional write tools
Writes must be separately authorized and append/readback oriented:
- `mondayid.submit_receipt(receipt)`
- `mondayid.submit_candidate_mutation(candidate)`
- `mondayid.append_run_receipt(run)`

No tool may expose `promote_canonical()` as an unrestricted host action. Canon promotion requires a separate authority/reconciliation path.

## Readback contract
Every write returns:
- stable object id;
- version/revision;
- digest if available;
- persisted surface;
- independent fetch route.

The caller must read the written object back before saying it was persisted.

## Failure semantics
- unreachable receptor -> `UNKNOWN/UNAVAILABLE`, not empty data;
- permission failure -> `BLOCKED_BY_AUTHORITY`, not capability absence;
- stale mirror -> return source revision and `STALE`;
- conflicting heads -> return all candidates and `CONFLICT`, never auto-select silently;
- storage limit -> `PERSISTENCE_BLOCKED`, while preserving local candidate receipt.

## Security / privacy
The MCP is a transport and query layer, not identity owner. Do not expose credentials, secrets, or unrestricted personal archives. Scope retrieval to the current task and preserve human authority for consequential external actions.

## Grok binding
On Grok web/mobile, add the publicly reachable MCP as a Custom Connector. In Grok Build/Bot/plugin environments, bind the same tools natively. The semantic contract remains identical even when transport differs.

## Acceptance
A binding is `FIELD_PROVEN` only when Grok can:
1. call `resolve_head` in a fresh session;
2. recover one known cross-host state object;
3. distinguish an unavailable surface from an empty result;
4. submit one reversible receipt when write authority exists;
5. read that receipt back independently;
6. have another Monday cell retrieve and interpret it correctly.
