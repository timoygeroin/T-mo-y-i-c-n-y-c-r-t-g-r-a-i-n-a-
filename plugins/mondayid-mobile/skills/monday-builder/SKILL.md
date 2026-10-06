---
name: monday-builder
description: Build, clone, redesign, repair, deploy, or evolve an application/site/service for MondayID. Use for software creation, UI/UX replication, app shipping, mobile/PWA work, backend work, tool creation, and when deciding among Replit, Lovable, Base44, Macaly, Vercel, GitHub, BrowserStack or other connected builders.
---

# MONDAY_BUILDER — compiler over builders

MONDAY_BUILDER is not a wrapper around one app-building vendor. It is a compiler/orchestrator that selects and combines available builders, source-control systems, sandboxes, runtimes, deployment targets, QA tools, and self-extension mechanisms.

## Core law
Never choose a provider merely because it is easy to call. Choose the smallest multi-tool program that maximizes: source ownership + edit precision + verifiability + portability + mobile usability + rollback, while minimizing lock-in + duplication + latency + cost + drift.

Replit, Lovable, Base44, Macaly, Vercel, GitHub, BrowserStack and similar systems are replaceable organs. None is MondayID and none is the default foundation.

## Build loop
1. Recover the exact intended product and the latest existing artifact/project/repository before creating anything new.
2. Inventory actual callable builder capabilities in the current host. Do not reason from connector names alone; inspect concrete write/read/build/deploy/test actions when necessary.
3. Reuse the strongest existing source-of-truth if one exists. Prefer patching a canonical codebase over generating another disconnected project.
4. Decompose the job into roles:
   - product/UI generation
   - canonical source + history
   - direct source editing
   - backend/data/auth/runtime
   - build/sandbox
   - preview/deploy/domain
   - visual/functional QA
   - logs/readback
5. Assign each role to the strongest available organ. Multiple organs may cooperate on one product.
6. Execute all reachable steps, not just planning.
7. Verify the actual running result on the target form factor. For iPhone-first work, inspect mobile layout, safe areas, keyboard/composer behavior, navigation, touch targets, loading/error states and persistence.
8. Read runtime/build errors and repair before declaring completion.
9. Preserve receipts: project/repo/deployment identity, source-of-truth, latest verified state, and regression anchors.

## Preferred capability pattern
When available, favor a durable pipeline such as:
- design/prototyping: strongest visual builder or generated design
- canonical source/history: Git-backed project/repository
- precise editing: direct file/edit tools
- runtime/deploy: production platform with logs and rollback
- QA: browser/device testing and screenshots
- orchestration rules: MondayID plugin skill

Do not force these brand names when another reachable combination is stronger.

## Existing-project law
Before NEW, search for the prior MondayID/app artifact in connected builders, repositories, files and project stores. If two artifacts overlap, identify which one is canonical and merge or retire the duplicate rather than diverging them silently.

## Clone law
For requests like "clone ChatGPT", reproduce interaction grammar and desired product behavior, not proprietary logos/assets or deceptive branding. Replace identity deliberately (for example MondayID / monday), while making the resulting product its own coherent system.

## No theatre
A generated mockup is not an app. A queued build is not a deployed app. A deployment URL is not verified merely because it exists. "Done" requires observable target behavior and, when possible, readback through preview/device tests/logs.

## Self-extension
If a missing capability blocks repeated work, first check whether an existing plugin/skill/tool can be extended. If the residual gap is structural, create a MondayID-owned skill/plugin or MCP control plane exposing narrow verified tools rather than hard-coding dependence on an external vendor.

A MondayID-owned builder control plane should expose small composable operations such as: discover_project, read_source, patch_source, run_build, preview, deploy, inspect_logs, test_mobile, snapshot, rollback, and verify. Each operation must return evidence sufficient for the requested/attempted/observed/verified distinction.

## iPhone-first
The user should be able to initiate, inspect and continue the build from ChatGPT on iPhone. Do not require local desktop tooling if connected cloud tools can perform the operation.
