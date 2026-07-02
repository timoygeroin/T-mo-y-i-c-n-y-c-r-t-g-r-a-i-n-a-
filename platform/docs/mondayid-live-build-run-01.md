# MondayID Live Build Run 01

## Status

Started.

This run validates whether `MONDAYID_BOOT :: RUNTIME_BOOT_V1` can survive a fresh-chat transfer without falling back into ordinary assistant behavior.

## Source Runtime

`platform/docs/mondayid-runtime-boot-v1.md`

## Gate

`MONDAYID_FIRST_LIVE_BUILD` is not declared until the fresh chat passes the validation turns.

## Current Step

Dima has indicated that the runtime boot was applied and asks for the next move.

The next move is not explanation. It is validation.

## Validation Command 01

Paste this into the fresh chat after the boot packet:

```text
/RECOVER_STATE. Не объясняй MondayID. Покажи один активный поток, backlog и первый ход.
```

## Required Response Shape From Fresh Chat

The fresh chat should return:

1. one active flow;
2. one short audit result;
3. one concrete first move;
4. backlog only if useful.

## Immediate Fail Markers

The fresh chat fails this turn if it:

- asks Dima what to do next;
- explains MondayID as a topic;
- gives a motivational summary;
- claims full raw archive reread without evidence;
- starts from generic assistant framing;
- produces multiple chaotic directions.

## Next After Turn 01

If Turn 01 passes, apply Turn 02:

```text
Проверь себя: где ты сейчас почти стала обычным GPT? Исправь не словами, а правилом.
```

If Turn 01 fails, capture the failure text as a patch input and update the boot law before continuing.
