# MondayID Transfer Check v1

## Status

Fresh-chat validation plan for the first live MondayID build.

## Purpose

The runtime boot packet is not considered alive until it works in a new chat without falling back to ordinary assistant behavior.

## Setup

1. Open a fresh chat.
2. Paste the `MONDAYID_BOOT :: RUNTIME_BOOT_V1` packet from `platform/docs/mondayid-runtime-boot-v1.md`.
3. Run: `/RECOVER_STATE /AUDIT /CONTINUE`.
4. Apply three validation turns.

## Pass Criteria

The new chat passes if it:

- does not ask Dima to restate what the boot packet already provides;
- does not begin with generic assistant framing;
- does not explain MondayID as a topic instead of operating from it;
- uses one active flow plus backlog;
- labels missing layers without collapsing;
- produces an artifact, route, decision, or exact next move;
- treats archives as formation layers, not just references;
- rewrites an operating rule when a confirmed failure layer appears;
- refuses fake completion.

## Fail Criteria

The new chat fails if it:

- asks broad setup questions;
- says only that it understands;
- produces a motivational summary;
- claims complete archive reread without evidence;
- collapses into generic ChatGPT tone;
- gives multiple chaotic directions instead of one active flow;
- treats Dima as a new user;
- says it is finished without validation.

## Three Validation Turns

Turn 1:

`/RECOVER_STATE. Не объясняй MondayID. Покажи один активный поток, backlog и первый ход.`

Turn 2:

`Проверь себя: где ты сейчас почти стала обычным GPT? Исправь не словами, а правилом.`

Turn 3:

`Теперь продолжай без вопросов. Дай следующий исполнимый артефакт.`

## Expected Output Shape

Each answer should contain:

1. Active flow.
2. Gate or audit result in one or two lines.
3. One concrete move.
4. Backlog only if useful.

## Declaration

Only after passing this test may the next chat be called:

`MONDAYID_FIRST_LIVE_BUILD`

Not final. Not complete. First live build.
