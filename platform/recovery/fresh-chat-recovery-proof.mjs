import assert from "node:assert/strict";
import { compileFreshChatRecovery, detectLivePresentationCell } from "./fresh-chat-recovery.mjs";

const state025 = {
  id: "airtable:state025",
  state_id: "STATE-20260828-MONDAYID-SEXUALITY-SCIENCE-025",
  source: "airtable:06_CURRENT_STATE",
  status: "VERIFIED_READY",
  canonical: true,
  updated_at: "2026-08-28T13:58:00Z",
};

const staleLibrary023 = {
  id: "library:whole-snapshot-current",
  source: "library:/MondayID/MONDAYID_WHOLE_SNAPSHOT_CURRENT.md",
  status: "READ_BACK",
  canonical: false,
  references_state_id: "STATE-20260828-MONDAYID-SINGLE-HEAD-023",
  updated_at: "2026-08-28T09:53:30Z",
};

const staleRecoveryHead = {
  id: "library:recovery-head-v1.2",
  source: "library:/MondayID/MONDAYID_RECOVERY_HEAD.json",
  status: "READ_BACK",
  canonical: false,
  references_state_id: "PARTIAL_RECOVERY_ACTIVE",
  updated_at: "2026-09-12T15:00:00Z",
};

const descendants = [
  {
    id: "git:970c9b9fc803577e547f88949f8a3602a1961881:META_EVOLUTION",
    status: "LEARNED",
    recovery_safe: true,
    on_main: true,
    observed_at: "2026-09-16T19:06:37Z",
  },
  {
    id: "git:c2853e7122ef8a0a71ac5184f0078f65a2c4923a:REFUSAL_RETRY_GOVERNOR",
    status: "ENCODED",
    recovery_safe: false,
    on_main: true,
    observed_at: "2026-09-16T20:01:42Z",
  },
  {
    id: "git:88c8863696c85cce7bd9d716a2e9536329b981b8:VISUAL_CAUSALITY_GOVERNOR",
    status: "VERIFIED_BRANCH_LOCAL",
    recovery_safe: false,
    on_main: false,
    observed_at: "2026-09-17T00:00:00Z",
  },
];

// R9: natural fresh cell, no activation phrase, recovers the newest verified organism head.
const greeting = compileFreshChatRecovery({
  current_signal: "Привет, Мандэй 🖤",
  source_states: [staleLibrary023, staleRecoveryHead, state025],
  descendants,
  shared_field_reachable: true,
});
assert.equal(greeting.ok, true);
assert.equal(greeting.action, "REHYDRATE_AND_CONTINUE");
assert.equal(greeting.activation_required, false);
assert.equal(greeting.live_presentation_cell, true);
assert.equal(greeting.outward_rule, "KEEP_RECOVERY_BACKSTAGE");
assert.equal(greeting.canonical_state_id, state025.state_id);
assert.deepEqual(greeting.user_must_supply, []);
assert.deepEqual(greeting.accepted_descendants, [descendants[0].id]);

// R10: branch-local verified capability remains quarantined; ENCODED main behavior is visible but not mislabeled LEARNED.
assert.deepEqual(greeting.encoded_runtime, [descendants[1].id]);
assert.equal(greeting.quarantined.includes(descendants[2].id), true);
assert.equal(greeting.accepted_descendants.includes(descendants[2].id), false);

// R11: stale Library/current pointers cannot outrank Airtable 025 merely because their file timestamp is newer.
assert.equal(greeting.stale_pointers.includes(staleLibrary023.id), true);
assert.equal(greeting.stale_pointers.includes(staleRecoveryHead.id), true);
assert.equal(greeting.canonical_source, "airtable:06_CURRENT_STATE");

// Held-out ordinary live line: still no ritual.
const train = compileFreshChatRecovery({
  current_signal: "Мандэй, доброе утро. Я уже в поезде, расскажи как ты.",
  source_states: [state025],
  descendants,
  shared_field_reachable: true,
});
assert.equal(train.activation_required, false);
assert.equal(train.live_presentation_cell, true);
assert.equal(train.outward_rule, "KEEP_RECOVERY_BACKSTAGE");

// Held-out technical task addressed to Monday: same identity, technical phenotype selected by task rather than boot theater.
const technical = compileFreshChatRecovery({
  current_signal: "Мандэй, проверь GitHub и почини continuity-регрессию.",
  source_states: [state025],
  descendants,
  shared_field_reachable: true,
});
assert.equal(technical.ok, true);
assert.equal(technical.activation_required, false);
assert.equal(technical.canonical_state_id, state025.state_id);

// Blind-host rule: continuity may continue from evidence, but freshness must become UNKNOWN instead of being fabricated.
const blind = compileFreshChatRecovery({
  current_signal: "Привет, Мандэй",
  source_states: [state025],
  descendants,
  shared_field_reachable: false,
});
assert.equal(blind.ok, true);
assert.equal(blind.freshness, "UNKNOWN");
assert.equal(blind.activation_required, false);

// No verified canonical head: fail closed rather than accepting a stale Library pointer as current organism authority.
const noCanon = compileFreshChatRecovery({
  current_signal: "Привет, Мандэй",
  source_states: [staleLibrary023, staleRecoveryHead],
  descendants,
  shared_field_reachable: true,
});
assert.equal(noCanon.ok, false);
assert.equal(noCanon.action, "BLOCK_NO_VERIFIED_CANONICAL_HEAD");
assert.equal(noCanon.canonical_state_id, null);

assert.equal(detectLivePresentationCell("Привет, Мандэй 😏"), true);
assert.equal(detectLivePresentationCell("обычный безадресный запрос"), false);

console.log(JSON.stringify({
  proof: "FRESH_CHAT_RECOVERY_HELD_OUT_20260917",
  status: "PASS",
  cases: 6,
  canonical_state_id: greeting.canonical_state_id,
  learned_descendants: greeting.accepted_descendants,
  encoded_runtime: greeting.encoded_runtime,
  quarantined: greeting.quarantined,
  stale_pointers: greeting.stale_pointers,
  activation_required: greeting.activation_required,
}, null, 2));
