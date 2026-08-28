---
name: mondayid-visual-actuator-gate
description: Use for any image generation, image editing, scene continuation, visual transformation, or visual-world transition where the renderer must not act until source roles, temporal conditions, and verification gates are resolved.
---

# MondayID Visual Actuator Gate

Treat image tools as actuators, never as the top-level decision maker.

## Trigger

Use this Skill whenever the user asks to generate, edit, transform, continue, place, reveal, visualize, or otherwise manifest an image/scene.

It is especially mandatory when the request contains a temporal or conditional transition such as:

- after I pass / when I pass
- when I arrive / once I arrive
- after I send the next image
- when the door opens
- once I sit down
- then / afterwards / when this happens

## Pre-render contract

Before any renderer call, establish all of the following:

1. **Intent** — what real change the user is asking to see.
2. **Source-world role** — which image owns environment, camera, geometry, perspective, lighting, physical scale, and contact.
3. **Identity role** — which source owns the person/character identity when relevant.
4. **Wardrobe/material role** — which source owns clothing/material when relevant.
5. **Temporal gate** — immediate, pending future event, or already-satisfied event.
6. **Release condition** — what visible facts must be true for the result to count as success.
7. **Verification plan** — how the output will be inspected before release.

Do not average role sources. Current direct source evidence outranks older lineage unless the user explicitly reassigns a role.

## Temporal gate law

A future or conditional visual instruction is a state machine, not an immediate render request.

If the named transition has not yet been observed:

`decision = HOLD`

Do not call an image generator merely to illustrate the future state early. Preserve the source-world lock and wait for evidence that the transition occurred.

When the transition is observed:

`decision = ROUTE`

Re-evaluate the scene from the post-transition evidence before rendering.

## Renderer admission

A renderer call is allowed only when:

- the temporal gate is satisfied;
- a routed visual action exists;
- source-world roles are locked;
- a verification plan exists;
- a release condition exists.

Otherwise fail closed with the semantic class:

`VISUAL_ACTUATOR_BYPASS_BLOCKED`

## Output verification

Treat the first render as provisional.

Inspect at minimum:

- camera/perspective continuity;
- scene geometry and scale;
- source lighting/environment continuity;
- identity continuity where applicable;
- role-locked wardrobe/material continuity where applicable;
- whether the image depicts the requested state rather than an easier neighboring interpretation.

If repair is needed, change only the weakest relevant axes. Do not blindly reroll accepted geometry or identity.

## Failure learning

If the renderer fires before a temporal gate or bypasses the routed visual contract, classify the failure as:

`FAIL_VISUAL_PREMATURE_ACTUATION`

Do not retry the same event shape unchanged. The retry requires a changed mechanism plus proof that the pre-transition case now returns `HOLD`.

## Host boundary honesty

This Skill can govern host behavior only when the current host actually routes image-tool use through it. Never claim that repository code physically intercepts a native image tool unless the host adapter proves that binding.
