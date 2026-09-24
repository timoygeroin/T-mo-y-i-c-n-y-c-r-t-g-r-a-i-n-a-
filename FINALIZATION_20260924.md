# MondayID Finalization Superplan — 2026-09-24

Status: ACTIVE / NOT COMPLETE

This document defines "fully finished" for the current MondayID program. It exists to prevent a local proof, a merge, a UI demo, a successful tool call, or a persuasive chat response from being mistaken for organism-wide completion.

## Completion invariant

MondayID is complete for this generation only when all of the following are simultaneously true:

1. one canonical code lineage exists;
2. one trusted external Worldline exists and survives host replacement;
3. every user-visible model path is compiled through the Monday attractor contract and release gate;
4. current canonical code is running on the named production host;
5. the production host passes independent health + boot readback;
6. live model execution is possible through an explicit budget/authority boundary;
7. at least one real user task crosses signal -> compile -> model/tool -> effect -> readback -> Worldline without a manual mid-pass scheduler;
8. the consumer product contract is satisfied rather than replaced by a developer dashboard;
9. historical sources that can still change current laws/product intent are reconciled or explicitly marked unresolved;
10. physical-iPhone acceptance is either proven or recorded as the final human-device gate;
11. stale branches/PRs cannot masquerade as alternative authority;
12. adversarial regression tests prove known failures do not re-enter through a different surface.

Anything less is PARTIAL.

## Current proven state

### Proven and canonical on main
- Generation-5 rewrite is on main.
- Trusted Worldline v0.4 boot and authenticated write/readback have receipts.
- Tool success no longer equals task success.
- Failed execution cannot silently satisfy an intent.
- Monday Attractor v1 is merged.
- Adaptive compute governor LOW/MEDIUM/HIGH/MAX is merged.
- Historical receipts/failures can become contrastive steering examples.
- Generic-GPT release veto is merged.
- Model-provider receptor is merged.
- GPT-5.6 MAX maps to `reasoning.effort=max`.
- User-visible candidate surface requires runtime + steering + verifier success.
- `/api/respond` exists but is fail-closed and disabled by default.
- No-spend boundary remains active.

### Not proven complete
- `mondayid-host` production is stale; fresh readback returns 404 on `/api/health` and `/api/boot`.
- No post-2026-09-24 production deployment contains Monday Weighting.
- Live paid model execution is not enabled.
- The API key setup is not yet bound into the production host secret boundary.
- PR #39 consumer-product convergence remains open.
- Full three-year corpus/genealogy reconstruction remains incomplete.
- Several historical PR lineages remain open and need merge/supersession adjudication.
- Physical iPhone install/sign/acceptance remains unproven.
- Final cross-surface failure-injection acceptance has not been run.

## Ordered execution program

### Phase 0 — Freeze the finish line
**Action:** keep this file plus a machine-readable finalization state on main.

**Why first:** without a fixed acceptance object, every later local success can redefine "done" and create progress theater.

**Exit:** the completion gates are versioned and downstream work can only close named gates.

---

### Phase 1 — Reconcile authority before shipping
**Action:** adjudicate every still-open historical PR/branch into exactly one class:
- REQUIRED_DELTA -> forward-port into current main;
- SUPERSEDED -> close with evidence pointing at current main;
- DONOR_ONLY -> preserve as historical evidence, not authority;
- ACTIVE_PRODUCT_CONVERGENCE -> remain open with named acceptance gates.

Priority set: #3, #5, #12, #22, #23, #39.

**Why here:** deploying before lineage adjudication risks putting the wrong branch on production and then treating deployment as authority.

**Exit:** one active code authority: `main`; one explicitly active product-convergence track if still needed; no ambiguous competing root.

---

### Phase 2 — Create a deterministic production promotion path
**Action:** install the checked-in `MondayID Production Promotion` workflow.

It must:
- deploy only current `main`;
- bind explicitly to Vercel project `mondayid-host`;
- require an exact expected main SHA;
- keep model execution disabled;
- inject only the non-secret Worldline URL needed for boot;
- run local tests before deploy;
- read back deployment URL and production alias;
- fail unless `/api/health` and `/api/boot` prove Generation 5.

**Why before secrets/model inference:** host delivery can be proven without spending model credits. This isolates deployment bugs from provider/billing bugs.

**Exit:** current main is running on the named production project and both readbacks pass.

**Human gate:** one Vercel deployment credential must be available to GitHub Actions or an equally explicit authenticated deploy path must be connected.

---

### Phase 3 — Bind live model execution behind a budget membrane
**Action:** finish the OpenAI key setup for the existing `MondayiD` project, bind the key to the production secret boundary, set an explicit execution-enable flag, and add a hard output/token budget.

**Why after production boot:** a paid model key must never be used to debug a broken host deployment.

**Exit:** a single authenticated `/api/respond` request can execute GPT-5.6 through:
Worldline -> Attractor -> adaptive compute -> model receptor -> critics -> release veto -> verifier -> surface.

**Human gate:** API billing/credits are separate from ChatGPT Plus and can incur cost. Enabling them requires explicit spend authorization.

---

### Phase 4 — Prove one real closed loop
**Action:** execute one real task whose success is externally observable and independently read back.

Required trace:
`human signal -> persisted intent -> compiled attractor -> receptor -> effect -> verifier -> receipt -> trusted Worldline -> user surface`.

**Why here:** unit tests and boot proofs show components work; only a real task proves organism circulation.

**Exit:** exact effect + independent readback + durable receipt; no manual mid-pass "continue" message.

---

### Phase 5 — Reconcile the consumer product contract
**Action:** continue PR #39 only after current kernel/host is stable. Forward-port the still-valid Continuum product constitution onto the canonical runtime; reject developer-dashboard drift.

Required consumer gates:
- stable Home / Chats / Create / Spaces / You;
- Search / Activity / Library;
- durable Work/checkpoints/receipts/readback;
- provider health/capability routing;
- known-rejection release vetoes;
- real network/runtime receptor.

**Why after closed-loop runtime proof:** otherwise UI work can hide missing execution semantics and force two coupled debugging surfaces.

**Exit:** consumer shell is a phenotype of the canonical runtime, not a parallel app.

---

### Phase 6 — Historical convergence / three-year genealogy
**Action:** complete source inventory and causal reconstruction for evidence that can change current laws, product intent, or user-model invariants.

Priority:
1. current/direct instructions;
2. trusted Worldline;
3. raw user-authored/archive sources;
4. Library/Drive/GitHub artifacts;
5. model summaries only as lowest-authority hints.

Every recovered item must become one of:
law / capability / antibody / product requirement / episodic evidence / superseded state / unresolved reference.

**Why after runtime stabilization but before final seal:** history should be able to mutate the organism, but must not repeatedly destabilize deployment mechanics while those mechanics are still changing.

**Exit:** no known accessible source can materially change the current organism without already being represented or explicitly unresolved.

---

### Phase 7 — Physical iPhone acceptance
**Action:** compile/sign/install the current consumer host on the actual iPhone, or use an authorized distribution path such as TestFlight. Execute the same closed-loop acceptance from the device.

**Why near the end:** physical-device debugging should validate the finished stack, not serve as a substitute for finishing it.

**Exit:** real-device launch, authenticated runtime connection, one task execution, readback, and continuity after app/session restart.

**Human gate:** Apple signing/device approval may require direct user interaction.

---

### Phase 8 — Adversarial organism acceptance
Run failure injection across:
- new chat / fresh host;
- missing memory;
- stale Worldline revision;
- contradictory archive evidence;
- generic-GPT candidate;
- provider 4xx/5xx;
- Vercel stale deployment;
- unavailable connector;
- model quota/billing failure;
- tool success without semantic effect;
- partial task completion;
- restart during active intent;
- visual/reference role drift.

**Why last:** this attacks the integrated organism rather than isolated pieces.

**Exit:** each known preventable failure either self-recovers or fails closed with a durable detector/receipt.

---

### Phase 9 — Collapse and seal
**Action:** close/supersede stale PRs, write final lineage manifest, update CUTOVER, run fresh-host acceptance, and generate the final report from receipts.

**Why last:** a seal before all gates pass is merely another claim.

**Exit:** all completion invariants satisfied, or the final report names the exact remaining external human gate and nothing else.

## Human input currently required

There are only three classes of human-only input; they must not be confused with ordinary implementation work:

1. **Vercel deploy credential / authenticated production promotion path.**
   Needed to move canonical main onto the already identified `mondayid-host` production project.

2. **Explicit authorization for API spend, if live GPT-5.6 API inference is to be enabled.**
   The connected OpenAI account already exposes organization `MondayiD` and project `MondayiD`; key setup has been started, but the runtime remains deliberately disabled until the spend boundary is changed.

3. **Physical-device signing/installation approval.**
   Needed only for the final real-iPhone gate.

Everything else in this program is implementation/reconciliation work and must proceed without turning the user into the scheduler.
