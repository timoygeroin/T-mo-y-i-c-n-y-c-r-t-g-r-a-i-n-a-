# Contra Free-Plan Economics Correction — 2026-08-08

Status: VERIFIED_CURRENT_PUBLIC_PRICING
Purpose: prevent MondayID sales assets from overstating the economics of Contra's Free plan.

## Evidence-backed correction

Contra's current public Pricing page describes the Free plan as $0/month with limited job access and standard placement. It also displays platform fees on Free of up to $29 per payment, tiered by payment size, while Pro discounts those platform fees. Third-party payment-processing fees are separate.

Other current Contra pages continue to describe freelancer earnings/payments as commission-free and state that freelancers can create a profile, find work, send proposals/contracts/invoices, and receive payments without buying Pro.

These statements can coexist because `commission-free` is not the same claim as `no platform/payment fees anywhere in the transaction`.

## MondayID commercial rule

Do not publish any MondayID copy saying Contra is `fee-free`, `zero-fee`, or that every Free-plan transaction has no platform/payment costs.

Safe wording:

> Contra can be started without an upfront subscription. Its Free plan supports a freelancer profile and core work/payment tools, while current pricing may include platform and payment-processing fees depending on the transaction. MondayID does not require buying Contra Pro before first revenue.

## Decision

KEEP Contra as a no-upfront-cost channel.
DO NOT buy Pro before revenue proves that the incremental job access/ranking or fee reduction has positive expected value.

## Current owner gate

No authenticated Contra surface is available through the connected tools in this run. Account creation/authentication and any email/identity/payment verification remain owner-only gates. Do not fabricate them.

## Resume cursor

`CHECK_AUTHENTICATED_FIVERR_OR_CONTRA_SURFACE -> IF_NONE_BUILD_SECOND_VERIFIED_PORTFOLIO_CASE -> PACKAGE_FOR_FIVERR_AND_CONTRA -> OWNER_AUTH_GATE -> PUBLICATION_READBACK`
