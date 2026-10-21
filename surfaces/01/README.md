# monday. — Surface 01 (21 October 2026)

This is a **consumer UI surface for the existing MondayID organism**, not a second organism, autonomous LLM, or ChatGPT clone.

## Preview
Hosted surface: https://monday-surface-01.vercel.app
Static build source: `surfaces/01/index.html` — a self-contained HTML/CSS/JavaScript local-first app.
The existing MondayID-host and canonical runtime remain untouched.

## Design
Quiet premium editorial interface, iPhone-first and responsive to desktop; Russian language; ADHD-aware single-focus interaction, no fictional state, no artificial progress.

## Implemented
- Local threaded conversations; drafts and user-authored messages.
- Work goals with actual checklists, blockers and manual proof statements.
- Spaces and notes, local text import and backup export/import; compatible legacy import supported by the UI.
- Search and keyboard command controls; local change log.
- Mobile navigation, theme and reduced motion, supported-browser dictation.
- LocalStorage persistence checked with browser smoke tests; responsive mobile/desktop rendering.
- Explicit 'AI not connected' and 'sync not connected' states.

## Not implemented
- Live AI inference or automated assistant responses.
- Cross-device synchronization, native iOS/Android/macOS/Windows binaries or subscriptions/billing.
- Automated external agents, background services or self-modifying models.
- Backend user authentication or encrypted cloud storage.
- This inline single-file hosted build is NOT the full offline-capable multi-asset PWA bundle.

## Technical policy
Never include MONDAYID_HOST_TOKEN or OPENAI_API_KEY in browser code. The canonical /api/respond requires server-side authorization, explicit model execution and approved spend.
Never report a saved/synced/completed state without evidence. Keep all user data on the device until an authenticated, audited transport is intentionally added.
Do not overwrite the canonical MondayID index.html or change existing Vercel production routes.

## QA status
Local Chromium Playwright smoke checks passed for mobile/desktop navigation, creating threads/messages, reload persistence (in mocked browser origin), goals/steps/proof and notes/export. The deployed Vercel build returned READY and the deployed source was listed by its files API. External Safari/Android acceptance and HTTP user-session verification still pending.
