# MondayID · Siri ↔ ChatGPT ↔ iPhone · cross-chat handoff
Date: 2026-11-14. Current work branch: `mondayid/ios-siri-sync-proof-20261114`.

## Reconciled from the existing work
- Siri-launched ChatGPT is a real separate entry, but continuity of this MondayID conversation is **not** proven in that path. Do not treat Siri's new ChatGPT conversation as a verified native MondayID memory bridge.
- Existing browser Apple Intelligence/Shortcuts bridge from PR #146 and its PR #147 editor fix have **already been merged**. Do not reinvent this bridge.
- The existing Swift Apple adapter includes Ask / Continue / Recall Capsule / Field Digest App Intents and secure runtime settings. The host has its own AppShortcuts provider.
- Worldline v4 draft PR #224 has CI evidence for independent process-level event transport (682 tests at prior head), but is **unmerged**. Production `mondayid-host` is still on main `511d61289e556d83dfaf364a886528083f4ba1d4` as inspected on November 14.
- Pinned GitHub event `mondayid-pos-20261114-chatgpt-001` was independently re-read in a ChatGPT conversation. That is **not** a physical iPhone or live independent executor ACK.

## What this branch adds (no user intervention or production change)
- `MondayIDSyncProofIntent.swift`: new read-only `CheckMondaySyncIntent` on physical iPhone. GET pinned public GitHub commit, verify exact event ID, schema, origin, target, state, save an iOS-local receipt, read it back. No token is embedded. No network write.
- Both existing AppShortcuts provider declarations add "Check sync in <app name>" for Siri.
- Swift package Shortcut count expectation adjusted from 5 to 6 and Node contract checks added.

## What is NOT proved
- No physical iPhone execution or Siri invocation is observed. Code review and static checks cannot substitute.
- No remote acknowledgement is published by the iPhone. A local iOS receipt is not a cross-host durable ACK.
- No production Worldline v4, new live build, installer, or cloud persistence is claimed.
- No claim of automatic sync across *all* ChatGPT conversations. Retrieved prior-chat context remains partial.

## Next acceptance
After compiling/installing this branch into the existing iPhone app, invoke the actual native Siri phrase "Check sync in MondayID". Require a physical-device receipt for the pinned event. Separately prove independent server-side ACK via a durable authenticated channel before claiming full cross-host sync. Reuse existing Siri PR #146/#147 implementation and Worldline PR #224 rather than rebuilding either.
