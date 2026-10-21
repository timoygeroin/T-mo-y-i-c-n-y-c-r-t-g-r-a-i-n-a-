# monday. — Surface 02 · Atmosphere

An iterative visual and interaction upgrade **on top of** MondayID Surface 01, not a replacement of the organism. The original `surfaces/01` remains available for rollback.

## Visual language
- Obsidian / Porcelain editorial typography, soft metallic icy-steel accent.
- Liquid-Glass-inspired chrome reserved for top navigation, mobile floating bar and chat composer; content remains opaque and legible.
- Motion is subtle and respects `prefers-reduced-motion`; custom glass disables blur with `prefers-reduced-transparency`.
- A procedural orbit mark represents the *visual identity*, never model activity, agent completion, or verified sync.
- Adaptive mobile/desktop layout, controls at least 44px, safe-area bottom navigation.

## Real behavior
- Local-first thoughts and conversations, messages, notes, goals/steps/proof statements, spaces, timeline, JSON export/import.
- Home «Точка возврата» uses actual most recently changed local objects, never seeded fictional user data.
- Keyboard shortcuts, dictated draft only when browser supports recognition, system/quiet mode, mobile nav.
- Existing storage key `monday.surface.local.v1` is unchanged, so upgrades do not erase browser data.
- On storage write failure, mutations are rolled back and not announced as saved.

## Run
```
cd surfaces/02
python3 -m http.server 8000
```
Visit `http://localhost:8000`. PWA install requires a secure hosting origin; filesystem preview does not register a worker.

## Verification
- `node --check app.js`: PASS.
- CSS stylesheet parsing with tinycss2: no syntax errors.
- Headless JavaScript model with mock localStorage: PASS for home, actual continuation, creation, reload-equivalent persisted data, quiet mode, backup parsing, rollback on failed writes.
- **Physical iPhone Safari and live hosted visual review are NOT completed**. An attempted local Chromium run was blocked by environment administrator. Do not label such a run as tested.
- Vercel deployment update attempted October 21, 2026: **blocked by free-tier deployment API limit (402, retry-after 86400)**. Surface 01's existing production URL stays unchanged until deployment can run.

## Not included
Actual LLM inference, authenticated MondayID host session, multi-device cloud sync, native SwiftUI or Android binaries, paid tiers. This is the existing organism's independent browser surface, not a fake model.

## Sources used for design
Apple Human Interface Guidelines (materials/layout), 2026 xAI Designing Grok Bot, Gemini app updates, Claude Cowork/Artifacts, accessibility research and user feedback.
