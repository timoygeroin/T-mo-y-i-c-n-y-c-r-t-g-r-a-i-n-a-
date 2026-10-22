# Monday Work — observed execution, not a mode label

Date: 2026-10-22

## User definition
Monday Work is the visible, uninterrupted sequence of **real tools causing effects**, independent readbacks, corrections and durable continuation. It is not a decorative loading animation, a renamed ChatGPT mode or a promise that a language model keeps working after a reply.

## Owned implementation
The existing Workless runtime already holds work state in `createMemoryWorkJournal` or `createFileWorkJournal`; `src/execution/work-visibility.mjs` provides a small, privacy-minimized progress projection without creating any new journal or application.

- `createFileWorkJournal(path).activity(jobId,{after,limit})` is a persisted reader.
- `createWorklessRuntimeV2(...).readActivity(jobId,{after,limit})` projects the same events from any journal.
- `nextCursor` and `hasMore` support cheap incremental UI polling.
- Events use their **stored sequence positions**, not user-supplied `event.index`.
- UI projection strips raw task instructions, event payloads, evidence references, provider identifiers and unknown blocker strings.
- A saved `running` job is **RECORDED_NOT_LIVE_CONFIRMED**, never automatically “running now.”
- A saved `complete` job is **REPORTED_COMPLETE_UNVERIFIED** until separately authorized readback proves the desired real-world effect. Even `effect_readback` in a journal is **READBACK_REPORTED**, not a trusted proof merely because it appears there.
- The low-level reader is not a public URL. Any future API must require owner identity, scope, rate limits and secure authorization.

## What this does not do
- It does not schedule or initiate background work.
- It does not control ChatGPT's live tool output or keep an agent alive after a turn.
- It does not authenticate journal authors, encrypt raw journal files, or create cross-host sync.
- It does not present a fake progress percentage or make “100/100” completion assertions.

The next integration boundary is the owner-authenticated MondayID client, which may subscribe/poll this projection and show genuine effect receipts with explicit provenance. Until then this is a tested runtime capability, **not** a released streaming UI.

Acceptance: `node --test tests/work-visibility.test.mjs` plus the complete existing GitHub CI job.
