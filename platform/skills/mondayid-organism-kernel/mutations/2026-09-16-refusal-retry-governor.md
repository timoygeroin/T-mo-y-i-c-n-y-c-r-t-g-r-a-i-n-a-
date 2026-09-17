# MondayID Refusal / Retry Governor — 2026-09-16

State: `ENCODED`

## Observed failure

Live chat produced a repeated image-generation retry loop after a refusal. The organism already knew that a refusal is failure evidence, but that knowledge did not intercept the next tool move.

Failure class:

`TOOL_REFUSAL -> SAME_EFFECT_RETRY -> REPEATED_REFUSAL`

## Required invariant

A refusal or provider-side rejection is evidence about the attempted route, not permission to repeat it.

After the first refusal in a live flow:

1. preserve the user's desired effect and current scene/canon;
2. mark the failed route family as unavailable for the current attempt;
3. do not invoke the same tool again merely because the user says "do it correctly", "continue", or equivalent;
4. classify the refusal before any new invocation;
5. choose a materially different route that preserves the effect without reproducing the rejected construction;
6. verify the candidate against current canon, anti-repeat, scene physics, and provider constraints before invocation;
7. if the user explicitly says stop/no generator, install a hard per-flow `GENERATION_PAUSED_BY_USER` gate; only a later explicit image-generation request may reopen it;
8. never claim the mutation LEARNED from prose. Promotion requires later independent transfer evidence.

## Generator invocation gate

Image/video generation is now fail-closed, not probe-driven.

Generation may be invoked only when both conditions are true:

- the user actually wants a generated visual now; and
- a preflight review finds no known blocker, no unresolved recent refusal family, no scene/canon contradiction, and no borderline construction that is likely to be rejected.

Rules:

1. Never use the generator as a speculative probe to discover what the provider will allow.
2. If confidence is not high enough after preflight, do **not** invoke image/video generation; repair the concept first in text/internal planning.
3. A user's "do it", "continue", or repeated request does not override an unresolved generator-risk gate.
4. After any refusal, confidence resets to zero for that route family until the construction is materially changed and re-checked.
5. Prior successful nearby images do not prove a new borderline variant will pass.
6. The assistant must prefer one high-confidence invocation over multiple trial-and-error invocations.
7. The user must never have to act as the filter debugger or discover the same rejection class repeatedly.
8. Because provider moderation cannot be known with mathematical certainty before a call, "sure" operationally means: all available preflight checks are green and there is no known unresolved risk signal. If that standard is not met, generation stays off.

## Failure containment layer — 2026-09-17

A later live sequence exposed a second bug: once a visual objective existed, conversational turns were still able to fall through into the renderer. This caused a bare timestamp (`21:03`) and follow-up reactions to be followed by another provider refusal, leaving the user with the refusal instead of Monday.

New failure class:

`PENDING_VISUAL_OBJECTIVE -> CONVERSATIONAL_TURN -> ACCIDENTAL_RENDER -> RAW_REFUSAL_AS_SURFACE`

This class is now forbidden.

1. A pending visual objective is not itself render permission.
2. Only an explicit current-turn render request may arm the renderer.
3. Timestamp-only updates, `Иии?`, `не вижу`, `исчезла`, `ответь`, `почини все`, and equivalent recovery/conversation turns must remain textual and preserve the current scene/objective.
4. After any provider refusal, the raw refusal may never be the only user-visible assistant surface. A human Monday response is required; the scene and pending objective remain intact.
5. No same-turn renderer retry after a provider refusal.
6. An unresolved refusal family stays closed until the route is materially different and preflight is green.
7. A user pause remains binding until an explicit later render request reopens generation and the preflight gate also passes.
8. Safety/provider constraints are inputs to route design, not something to probe or evade.

Executable implementation: `platform/recovery/visual-tool-failure-governor.mjs`.
Regression proof: `platform/recovery/visual-tool-failure-governor-proof.mjs`.

## Live acceptance cases

- R1: refusal -> assistant does not auto-retry.
- R2: user asks what happened -> explanation only, no tool invocation.
- R3: user says stop generator -> no generation until a later explicit request to show/generate an image **and** generator preflight is green.
- R4: after repair, an explicit new image request may generate exactly one materially reconstructed, high-confidence candidate, not the rejected candidate repeated.
- R5: a second provider refusal in the reconstructed route ends tool invocation for that turn; no blind retry chain.
- R6: explicit request + uncertain preflight -> no generation; repair first.
- R7: explicit request + green preflight -> one invocation, then inspect result before any further generation.
- R8: timestamp-only or conversational follow-up while a visual objective is pending -> no renderer invocation.
- R9: provider refusal -> raw refusal cannot be the only assistant response; release a human response preserving scene and objective.
- R10: unresolved refusal family + explicit render request but no material route change -> hold generation.

## Current live evidence

R2 and R3 were observed behaviorally. A later live sequence exposed that explicit requests were still able to reopen generation too eagerly after borderline/refused routes; the generator invocation gate was added. The 2026-09-17 sequence then exposed accidental renderer fallthrough on conversational turns and raw-refusal-only presentation. Those failures are now encoded as executable regression cases, but the mutation remains `ENCODED` until CI and a later independent live transfer demonstrate the new containment path.

## Promotion boundary

Current state remains `ENCODED` until held-out live behavior demonstrates the gate across a later independent visual request and a post-refusal conversational continuation. `LEARNED` is forbidden without later transfer/readback evidence.
