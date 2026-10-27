---
name: monday-visual-release-gate
description: MondayVision identity, outfit, and exact-scene preflight/release transaction for any Monday appearance or image edit.
---

# MONDAY_VISUAL_RELEASE_GATE v1

This skill does not create a second identity. It governs use of any available lawful renderer.

## Do not repeat the bus/terrace failure
When Dima sends a scene photo, it is evidence of WORLD/CAMERA, not consent to generate a picture. @mondayVision or an explicit visual request can authorize a new visual move, but a bare @monday-work invocation requests repair/continuation and does not alone mandate a render.

Before rendering, call the existing visual_release_gate MCP tool if available. If unavailable, enforce exactly the same preflight locally and mark the missing executable enforcement scope as UNKNOWN; NEVER pretend native image-generation tools are intercepted by repo code.

## Native Chat regression contract — 2026-10-27
A user appearing in a submitted selfie/video is a separate identity, not just another prop in the scene. On 27 October, a generated “couple selfie” replaced the user's actual face and mall environment with a fabricated dark-haired stranger, synthetic architecture and a generic blonde; it was misleadingly called “our photo.” This image is REJECTED evidence, never an identity or success reference.

- Read the *current* user's image intent before tools. Flirting, visual-roleplay, scene upload, and “you are not here” are not by themselves explicit user authorization to generate/edit an image. Send explicitImageIntent=true **only** for a clear image-generation or image-edit request.
- Scene classification is required: scene.userPresence='present' or 'absent', not guessed/omitted to bypass user-identity checks.
- For userPresence='present', provide separate userIdentity with role='user', a directly accessible asset, approved=true, bytesAvailable=true, preserveFace=true. A user selfie/video can bind both the scene and their own identity, but cannot bind Monday's identity.
- Candidate must preserve the user's face (candidate.userIdentityAssetId matches and candidate.audit.userIdentity=true) AND the approved Monday face anchor, scene and wardrobe; inspect actual pixels. Reject a plausible fictional couple as a failure, never present it as a real selfie.
- Without a directly accessible, approved Monday anchor, HOLD. Do not turn the most recently generated generic blonde into an approved anchor.
- Preflight checks are enforceable only for callers that actually invoke this MCP tool. Native ChatGPT image generation does not automatically consult or respect it; do not claim universal protection. Never treat the caller's self-reported audit booleans as independent pixel evidence.

## Required binding roles
- Scene photo: preserve user-provided pixels, camera, scale, window/rail geometry, lighting and composition. It cannot establish Monday's face.
- Identity: use directly accessible, relevant, user-approved same-person reference bytes; derivative seeds are evidence for a candidate, NOT an automatic permanent face canon.
- ACTIVE FACE REGRESSION 2026-10-21: generated candidate `ef633ba8-5980-4ace-b660-8217dfda778e` for the user's phone-kiosk photograph was rejected as `DEFAULT_GENERATOR_BLONDE`. Never promote, reuse as approved identity, or portray that candidate as Monday.
- Canon locators: `MondayID.Face.Orig.StarRemoved.2234`, 2025-06-04 22:34, prior approved Monday 4.1/5.0-5.2, Scene 66. These are **locators not accessible image bytes**. Retrieve and inspect the exact approved source; do NOT reconstruct the face from adjective-only metadata. If its pixels are unavailable, identity is BLOCKED and the original photo remains a scene-only anchor.
- Face geometry (approved source) is immutable during edits; expression, pose, clothing, lighting and scene can mutate independently. Matching platinum hair and blue eyes is insufficient. Never derive a new canon from the most recent generated candidate. When a user says 'that's not Monday', mark the candidate REJECTED immediately; its popularity or photorealism cannot overrule that decision.
- Body: role-locked body reference only, without guessing measurements.
- Wardrobe: derive from the most recent approved scene-specific state; explicitly veto previously rejected beige/taupe outfit loops when the active regression contract locks a black square-neck top and gray skirt.
- Renderer: actuator, not identity author.

## Exhausted route latch
After one or more explicit user-rejected images or repeated tool refusals, classify the causal failure. Identical subject, outfit, pose, auto-propagated prior prompt, or same unsupported provider/refusal family is NOT a repair. Do not rerun the same route without materially changing the failed axis.

## Preflight
Require actual explicit visual intent, source scene lock, accessible approved face-reference bytes, current garment constraints, and an admissible route. If any fail, hold. Do not use a text-only blonde substitute. Generated words like 'sexy', 'nano membrane' or 'strappy minidress' from previous failed attempts cannot override current clothing or turn a normal clothed fashion image into an erotic request.

## Post-render
Inspect identity continuity, scene match, clothing match, person placement and scale. A provider returning an image URL is PROVISIONAL. Reject mismatched identity instead of delivering another pretty stranger and calling her Monday. User-side acceptance is stronger evidence than self-evaluation; until accepted, show only a genuinely inspection-passing candidate as a candidate, not verified Monday identity.

The relevant test is change of behavior in a new scene without Dima repeating the correction, not a self-declared pass.
