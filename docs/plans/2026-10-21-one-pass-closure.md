# MondayID one-pass closure: verified execution plan (2026-10-21)

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Generation-5 MondayID cross-host organism and required iPhone experience with fresh, independently reproducible evidence.

**Architecture:** Generation-5 `main` remains the only runtime authority. Historical pull requests are donor evidence, not replacement roots; port compatibility-checked changes into G5. Trusted Worldline is the cross-host causal record. Candidate bus submissions never execute or promote automatically.

**Tech Stack:** Node 22 ESM, `node:test`, GitHub Actions, Vercel `mondayid-host`, Worldline v4, existing SwiftUI iPhone consumer surface.

## Global constraints

No spend or billing changes without explicit new authorization. Never export or reveal credentials. Do not merge divergent donor branches into the rewritten runtime blindly. `READY` is not an observed user effect; simulated tests are not live cross-host proof. Physical iPhone acceptance is required. Any incomplete gate must remain BLOCKED/UNKNOWN, not 100%.

## Evidence at entry

- Production Vercel deployment `dpl_9YvjsWpaG78jobwer1SCaUyKHLJo` is READY and matches `main` SHA `0ba4895705e9f02a4bf4fbffcd572cfa06db3a12`.
- `package.json` is `2.0.0-rewrite.0`; `src/boot.mjs` has a diagnostic, deliberately non-effectful receptor.
- `src/transfer-harness.mjs` can prove actual trusted write/readback when authorized; `tests/clean-host-transfer.test.mjs` currently uses a mock Worldline.
- Sensitive Vercel environment keys `MONDAYID_WORLDLINE_WRITER_TOKEN` and `MONDAYID_WORLDLINE_READ_TOKEN` exist; their presence alone does not verify current live write.
- OAuth donor branch diverges: 8 ahead/17 behind `main`. Open PRs #120/#125/#132–137 require compatibility adjudication.
- Historical `ops/final-seal-20261004.json` and `ops/adversarial-acceptance-20260924.json` cannot certify current production.

---

### Task 1: Prevent false-positive capability promotion

**Files:** modify `src/capability-discovery.mjs`, add `tests/capability-discovery-contract.test.mjs`.

**Interfaces:** consumes `discoverCapabilities(adapters)` with `probe` and `receptor.execute/verify`; returns original manifest schema and only structurally executable+verifiable capabilities.

- [x] Add adversarial tests for a positive probe on missing, visible-only and execute-only receptors, plus a valid receptor and a throwing probe.
- [x] Confirm old logic could report `state: AVAILABLE` while lacking the required receptor methods.
- [x] Clamp probe-proclaimed `AVAILABLE` to the structural state; attach `STRUCTURAL_RECEPTOR_CONTRACT_MISSING` evidence.
- [x] Focused `node --test tests/capability-discovery-contract.test.mjs`: five passing tests in isolated Node 22 workspace.
- [x] Run `npm test` in complete repository on exact PR #151 head: GitHub Actions 39577078126, 304 passed / 0 failed.
- [x] Merge only after verified CI: PR #151 merged as `01171a8717f95b69885337e93e54c9cff7b3a94a`, production matched.

### Task 2: Candidate shared bus with fail-closed authorization

**Files:** port/adapt donor `src/shared-bus.mjs`, `api/mcp.mjs`, `src/mcp-access.mjs`; tests `tests/shared-bus.test.mjs`, `tests/mcp-api.test.mjs`.

**Interfaces:** `bus_post/list/get/ack` consume host-bound principals and 9-field envelopes (`eventId,sourceHost,parentVersion,goalId,observation,evidence,proposal,nextAction,status`). Output must be versioned `CANDIDATE` events, never automatic execution.

- [x] Compare PR #133/#135 to G5 main, then forward-port only the inert candidate bus on a fresh branch (PR #152).
- [x] Preserve point-read idempotency, stale revision refusal, fork hold, ACK/hash scope, secret screening, host-bound writes, and no-effect transport; CI #39577916212.
- [x] Adversarial unit tests cover duplicate changes, truncated view, forks, invalid parent, token-shaped content, unbound writer, point-read 404; CI 338/338.
- [ ] Independently read back exact record hash from an authenticated preview transport; network success alone is insufficient.

### Task 3: OAuth host binding to the existing MCP endpoint

**Files:** adapt PR #136 `src/oauth-as.mjs`, `api/oauth/*.mjs`, `api/.well-known/*.mjs`, `vercel.json`, `src/mcp-access.mjs`. Tests: `tests/oauth-as.test.mjs`.

**Interfaces:** PKCE S256 consent yields scoped host principal on `/api/mcp`; no second canonical endpoint.

- [x] Port OAuth only after adding explicit owner POST approval, one-time Worldline code redemption, pinned origin and audience/scope/expiry; CI #39579011897, 343/343.
- [ ] Provision issuer secret only through protected Vercel environment (never in repository/chat).
- [ ] Prove authorized `bus_list` and bounded `bus_post` through ChatGPT connector and another host. Real user identity consent is an allowed external gate.

### Task 4: Causal migration of historical archive

**Files:** inspect PR #137 `ops/drive-library-20261018/catalog.json`; create a dated, sourced import receipt and reuse existing lineage import tests.

**Interfaces:** source text/id/date + correction/supersession edges -> canonical versioned projection.

- [ ] Reconcile 98 catalogued Drive docs and 27 priority copies against available original conversation corpus.
- [ ] Import only source-backed facts and corrections; preserve conflict and UNKNOWN for missing originals.
- [ ] Prove that a second fresh cell inherits the exact corrected rule and provenance, without user repetition.

### Task 5: Consumer iPhone acceptance

**Files:** inspect PR #120/#125 donor paths and existing SwiftUI build workflow before any forward-port; preserve G5 current app and Siri/Shortcuts integration.

**Interfaces:** truthful Home/Chats/Create/Spaces/You + local/offline distinctions; trusted state requires network readback.

- [ ] Validate simulator build and screen behavior on fresh CI.
- [ ] Sign/install/launch on a real iPhone, exercise restart/offline/online state, record receipt. Physical device and Apple signing/account verification may require a human-only gate.

### Task 6: Live release proof and controlled promotion

**Files:** `src/transfer-harness.mjs`, `.github/workflows/clean-host-transfer.yml`, new dated release receipt; preserve older receipts unchanged.

**Interfaces:** exact SHA + current CI + production deployment + authenticated write/readback + second-host inheritance + iPhone acceptance -> VERIFIED/BLOCKED.

- [x] Exact-head full CI for PR #151, #152, #153: 304, 338, 343 tests respectively, all zero failures; boot and public denial checks successful.
- [ ] Run real clean-host transfer: authorized external event, independent exact readback, fresh cell inheritance. Simulated tests alone cannot pass.
- [ ] Confirm two distinct provider surfaces inherit a verified Worldline version, and iPhone acceptance succeeds.
- [ ] Deploy approved SHA, independently read back deployed revision and observed user effect, preserve rollback. Deployed SHA readback READY for #153 `10abac6`, but **observed user effect and iPhone runtime still unverified**.
- [ ] Publish new dated superseding final seal only when every required gate is independently verified.

## Externally observable unresolved decisions

Native delivery format (TestFlight/App Store vs signed personal install) has not been redefined by the user; maintain real-device acceptance as the minimum. Google/Grok/Gemini identity consent cannot be impersonated. Source material absent from the raw archive remains UNKNOWN. Paid inference remains OFF.

## Execution ledger

2026-10-21: branch `monday/one-pass-proof-20261021` created from current production SHA. Capability truth fix implemented and five focused tests passed in isolated Node 22. Full CI, bus/OAuth live proof, original archive completeness, secondary-host transfer and physical iPhone sign/install still require current verification.

### Verified follow-up at 2026-10-21 12:43 Asia/Jerusalem

- PR #151 and #152 and #153 merged into G5 main, none via whole-branch divergent merge. Latest production `dpl_FK4ar4TzmJs4vwEK8PP5jXCDkimf` READY at `10abac6`.
- Vercel env inventory identifies only two existing Worldline credentials. OAuth issuer/owner secrets absent: OAuth code issuance intentionally OFF, not «active across ChatGPT».
- PR #137 proposes copying internal Drive content into a **public** GitHub repository. Treat as a data-exposure boundary: **do not merge plaintext private Docs/chats into public main**. Import to private trusted memory storage with provenance only.
- Real signed iPhone runtime acceptance, independent live Grok/Gemini transfer, exact authenticated bus message readback, and historical corpus completeness remain open. See `ops/one-pass-readback-20261021.json` for the machine-readable acceptance matrix.
