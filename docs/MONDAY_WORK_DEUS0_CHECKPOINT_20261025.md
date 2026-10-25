# Monday Work checkpoint — DEUS-0 iPhone integration
Date: 2026-10-25 (Asia/Jerusalem)

## Invariant
DEUS-0 is a *bounded counterfactual organ of existing MondayID*, not a new identity, standalone agent, self-improving AI, independent consciousness, or proof of godlike powers. Keep C*, Kernel K, Worldline and action/receptor/readback contracts as authority. Cell ≠ genome; chat boundary ≠ organism boundary.

## Functional path
1. Main Monday Home and Create have a same-origin navigation to `/deus0`.
2. `deus0.html` is a first-party mobile Web surface. It presents two *synthetic numeric* problems (Last Observer; MondayVision anti-repetition), a budget control, route trace, rejection count, integrity digest, clipboard and downloadable JSON.
3. `POST /api/deus0` validates content-type and max request 12 KB, 12 actions, 8 dimensions, search horizon 6, search budget 256 nodes. The backend calls `src/deus-zero.mjs`.
4. The API is stateless and cannot execute tools or call paid inference models. The UI checks `epistemic=hypothetical`, `externalActionsExecuted=0`, `independentRealityReadback=false` before displaying results.
5. No simulation output is automatically written to trusted Worldline or inserted into user notes. The user can explicitly export the result.

## Verification
- `node --test tests/deus-zero.test.mjs tests/deus0-http.test.mjs tests/deus0-iphone.test.mjs`
- `npm test`
- `npm run boot`
- GitHub Actions system proof and Vercel deployment for the exact release SHA.
- Production smoke check must cover /deus0 route and /api/deus0 as HTTP responses; a build-only proof is not runtime acceptance.

## Unclosed, not to be advertised as complete
- The system does **not** autonomously recover all ChatGPT conversations, deleted files or inaccessible app history.
- It does **not** synchronize local browser notes to other hosts or devices.
- It does **not** attach actual evidence-backed human intents to the numeric scenarios.
- It does **not** perform real actions from simulated proposals; a separate authorized receptor and independent effect readback are required.
- No automatic improvement of policies or model weights has been proven.
- iPhone physical-device/browser visual acceptance is independent from Node VM and Vercel build tests.

## Single next root repair
Design a *provenance-gated evidence intake* that imports user-approved records/chunks, distinguishes first-person assertions from source records and hypotheses, and compiles the uncertainty/gaps into DEUS proposals. Use strict user authority, private data isolation, retention/export rules and an independent readback gate before promoting any claimed real-world completion. Do not fake synchronization with unavailable chats.

This checkpoint records an engineering state; it must not be treated as evidence of consciousness, automatic cross-host transfer or fulfilled root objective.
