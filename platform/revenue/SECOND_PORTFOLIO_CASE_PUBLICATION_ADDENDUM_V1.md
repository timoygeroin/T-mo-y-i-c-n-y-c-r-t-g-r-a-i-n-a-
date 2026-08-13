# MondayID Second Portfolio Case Publication Addendum V1

Status: VERIFIED_PROOF_READY_FOR_ACCOUNT_PUBLICATION
Date: 2026-08-08

## Case

**Support Request Triage — Safe Automation Demo**

Disclosure: self-initiated synthetic demonstration; not a client deployment.

## Client-facing description

A deterministic support workflow that receives representative requests, classifies category and urgency, routes each item to a queue, and preserves a mandatory human-review boundary for sensitive or uncertain actions.

The proof demonstrates safe automation behavior rather than a fabricated client outcome.

## Verified evidence

- 9 synthetic support-ticket fixtures.
- 8/8 acceptance checks passed.
- 0 external sends.
- Refund requests require human review.
- Cancellation requests require human review.
- Suspected account compromise is high urgency and requires human review.
- Ambiguous input is routed to human review instead of invented certainty.
- Audit fields are present for every result.
- GitHub Actions workflow: `Support Triage Portfolio Proof`.
- Verified run: `31242885243` on head `27071c224962426addccfaf54f4b1bdafb49600f`.
- Evidence artifact: `support-triage-evidence`, artifact id `9017570338`.
- GitHub artifact digest: `sha256:1b424883c2f4baebb9419ce49300989fb42a6838493531ea76167bdb3cafb097`.
- Extracted `evidence.json` byte digest: `sha256:5f4510bec61d6cdcce6cc85e9ba3356a2de7b591646264880fe2cead5bbc4365`.
- Client-facing visual source: `platform/revenue/portfolio/support-triage/portfolio.html`.

## Fiverr insertion

If Fiverr exposes portfolio/gallery space suitable for a second proof, use:

**Title:** Support Request Triage — Safe Automation Demo

**Caption:** Synthetic support workflow demo: 9 test tickets, 8/8 checks passed, zero external sends, sensitive actions held for human review.

Do not describe this as client work, production deployment, measured savings, or paid experience.

## Contra insertion

Add as a second project only if the free profile permits another project without requiring payment.

**Project title:** Support Request Triage — Safe Automation Demo

**Project type:** Self-initiated synthetic demonstration. NOT a paid-client case study.

**Project description:** A proof-of-work support automation that classifies incoming requests, assigns urgency and queue routing, and sends refunds, cancellations, suspected account compromise, and ambiguous requests to human review. The CI proof used nine synthetic tickets and performed zero external sends.

**Suggested visual caption:** Synthetic support triage demo — tested routing and human gates, no fabricated client claims.

## Commercial use boundary

This case proves workflow design, deterministic classification/routing, human-gate policy, evidence generation, and zero-send safety. It does not prove production scale, customer satisfaction, ROI, response-time improvement, or any external account integration.

## Current publication cursor

`OWNER_AUTH_SURFACE -> ADD_CASE_1_LEAD_TRIAGE -> ADD_CASE_2_SUPPORT_TRIAGE -> ADD_SERVICES/GIG -> READBACK_DISCLOSURES -> OWNER_KYC/PHONE/TAX/CONTRACT_GATE -> PUBLISH`
