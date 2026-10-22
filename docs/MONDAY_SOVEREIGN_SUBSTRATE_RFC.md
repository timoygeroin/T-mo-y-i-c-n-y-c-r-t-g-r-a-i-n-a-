# MondayID Sovereign Substrate — RFC 0001
Status: Implemented protocol experiment; NOT an adopted or patented standard.
Date: 2026-10-22

## Product decision
MondayID is not another hosted chatbot, AppDeploy clone or paid app builder. It is an independently authored consumer product with a replaceable runtime. Deployment vendors, model APIs, GPU providers and app stores are optional substrates. App creation can later be a capability **inside MondayID**, not a prerequisite for building it.

## Strategic inversion
Most builders own the creation environment and meter dependent users. MondayID should own a portable **effect contract**: the intended result, necessary capability, privacy boundary, cost ceiling and approval requirements. Local devices, user-owned servers, and competing cloud vendors may offer compatible executors. Verifiers confirm what happened rather than inferring success from a completed tool call.

```
Owner intent
  -> Effect Capsule
  -> Capability route (local device | own server | third-party host)
  -> Authorization and privacy gate
  -> Execute
  -> Independent readback
  -> Receipt: VERIFIED / BLOCKED / UNVERIFIED
  -> Existing ActionLedger and trusted Worldline when authorized
```

## Working proof
- `src/effect-abi.mjs`: `makeEffectCapsule()`, `runEffectCapsule()`; Node.js built-in `crypto` only.
- `tests/effect-abi.test.mjs`: runs with `node --test tests/effect-abi.test.mjs`.
- Capsule fields: `schema,id,intent,capability,privacy,maxCostUsd,sideEffect,digest`.
- Same capsule works with two separate mock adapters without vendor SDK.
- Fail-closed on unavailable capability, unauthorized cloud delegation, known over-budget execution, missing verifier, unexpected extra fields or consequential external action without an owner gate.

**Security truth:** SHA-256 detects changes; it does not sign or authenticate authors. A supplied verifier may lie. The unit tests use mocks and prove contract behavior, not cross-device execution or an actual physical effect. Cost estimates are not enforceable payment guarantees. This runner is not a sandbox and must not execute untrusted arbitrary code. Persistent effects and exactly-once causality remain responsibilities of the existing ActionLedger/Worldline.

## Economic hypothesis, not a demand for automatic royalties
- Open core candidate: reusable protocol, local SDK and self-host adapters, subject to choosing an explicit distribution license. A public GitHub repository is not automatically open source.
- Optional commercial products: reliability-backed execution hosting, adapter certification, compliance/audit tooling, managed storage, enterprise policy and development support.
- Monetize delivered services and trust, **not** permission to read personal files, basic buttons or export customer data.
- Vendor-independent interop plus a developer ecosystem could generate demand. No external developer is obligated to license MondayID simply because a protocol exists.

## Required product boundaries
- End users own and can export their content without subscription.
- Local mode must work without a Monday server where physically possible.
- Public protocol validators must not require a central commercial license handshake.
- Routing private content off-device requires explicit approval.
- A third-party adapter does not inherit owner authorization.
- Evidence, writeback, claimed novelty, patentability, and eventual certification all require separate independent verification.

## Gated roadmap
1. Integrate this ABI with existing CapabilityFoundry + ActionLedger, without introducing parallel execution authority.
2. Add cryptographic signatures, replay protection and adversarial adapter isolation.
3. Demonstrate the **same capsule** on two genuine runtimes, including one fully owner-controlled device/server, and independently read back stored artifacts.
4. Implement resumable large-file storage and safe cross-device identity; protect against browser eviction.
5. Test a new account: no inherited private user history, but identical core capabilities.
6. Review competing public protocols, developer demand and legal rights before claiming world-first novelty or selling licensing.

Product veto: never create another consumer-facing shell when the missing capability belongs in MondayID.