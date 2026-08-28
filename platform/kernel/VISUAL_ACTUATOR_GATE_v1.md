# MondayID Visual Actuator Gate v1

Status: candidate mutation on isolated branch `agent/mondayid-visual-actuator-gate-v1`.

## Purpose

Prevent native image generation/editing from bypassing the MondayID routed-action boundary.

## Failure that triggered this mutation

A temporal visual instruction such as “after I pass this point, I will be in that universe” was incorrectly collapsed into an immediate render. The renderer was invoked before the event state transitioned. This is a direct `EVENT -> ACTION` bypass.

## Hard law

A visual actuator may run only after all of the following are bound to the current event:

1. `intent_receipt`
2. `source_world_lock`
3. `temporal_gate`
4. `route_receipt`
5. `verification_plan`
6. `release_condition`

If any required field is unresolved, the only admissible result is `HOLD`, never `RENDER`.

## Temporal gate

Visual instructions that contain a future or conditional transition are state machines, not immediate generation requests.

Examples:

- “after I pass the turnstile”
- “when I sit down”
- “once the door opens”
- “after I send the next photo”

Before the transition is observed:

`visual_action = HOLD`

After the transition is evidenced:

`visual_action = ROUTE`

The source image remains authoritative for camera, geometry, lighting, scale, and environment unless the user explicitly changes those roles.

## No spare door

The renderer is an actuator, not a decision maker. A host adapter must expose image generation/editing only behind the same routed dispatch boundary used by other effectors.

A direct native image-tool call without a current visual route receipt is classified as:

`VISUAL_ACTUATOR_BYPASS_BLOCKED`

## Verification

Before release, verify:

- the temporal condition was actually satisfied;
- source-world geometry/camera/light were preserved where locked;
- identity/wardrobe/material roles came from their assigned sources rather than averaging;
- the produced image depicts the post-transition state rather than inventing the transition itself;
- no renderer output is promoted merely because generation succeeded.

## Failure gene

If a visual action fires before its temporal gate, persist the semantic failure gene:

`FAIL_VISUAL_PREMATURE_ACTUATION`

The same event shape may not be retried unchanged. The mechanism must first introduce or repair a temporal gate and prove that the pre-transition state returns `HOLD`.
